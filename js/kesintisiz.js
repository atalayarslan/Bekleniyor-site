// Kesintisiz ses (telefonda akış modu): şarkılar tek bir <audio> öğesinin içine art arda eklenir (MediaSource).
//
// Neden: Android'deki Chrome, ekran kapalıyken DURMUŞ bir oynatıcının yeniden başlamasına izin vermiyor; çalmakta
// olan sese ise dokunmuyor. Eskiden şarkı değişince oynatıcıya yeni kaynak veriliyordu; tarayıcı bunu "durdu,
// yeniden başlıyor" sayıp sesi başlatmıyordu. Burada öğe hiç durmaz: yeni şarkı aynı akışın sonuna eklenir ve
// oynatıcı oraya atlar. Şarkı henüz gelmediyse öğe sessizce bekler (durmaz), şarkı eklenince kendiliğinden çalar.
//
// Akış sunucusunun ses dosyaları parçalı MP4'tür (DASH, yt-dlp biçim 140); MediaSource bunları doğrudan kabul eder.
// Bu sınıf HTMLAudioElement'in sitede kullanılan kısmını taklit eder (src, currentTime, duration, play, pause,
// readyState, buffered, olaylar...), böylece karmaOynatici() farkı bilmez. Zamanlar hep çalan şarkıya göredir.
// Kullanılamazsa (MediaSource yok / ses biçimi desteklenmiyor) kesintisizMi() false döner ve normal <audio> kullanılır.

(function () {
  "use strict";
  const TUR = 'audio/mp4; codecs="mp4a.40.2"';
  const yaz = (m) => { try { if (window.taniYaz) window.taniYaz(m); } catch (e) { } };

  window.kesintisizMi = () => !!(window.MediaSource && MediaSource.isTypeSupported(TUR));

  window.KesintisizSes = function () {
    const ogeler = new Audio();
    ogeler.preload = "auto";
    const ms = new MediaSource();
    ogeler.src = URL.createObjectURL(ms);
    let sb = null;
    const acildi = new Promise((coz) => ms.addEventListener("sourceopen", () => {
      try {
        sb = ms.addSourceBuffer(TUR);
        sb.mode = "sequence";   // her eklenen şarkı bir öncekinin bittiği yerden başlar
      } catch (e) { yaz("MediaSource açılamadı: " + e.name); }
      coz();
    }, { once: true }));

    // Eklenen şarkılar: { kimlik, bas, son } (öğenin zaman çizgisinde)
    const sarkilar = [];
    let calan = null;          // çalan şarkının kaydı
    let istenenKimlik = null;  // yüklenmesi istenen son şarkı
    let hata = null;
    let bittiBildirildi = null;
    const dinleyiciler = {};
    const ates = (tur) => {
      for (const f of dinleyiciler[tur] || []) { try { f(); } catch (e) { } }
      const h = ad["on" + tur];
      if (typeof h === "function") { try { h(); } catch (e) { } }
    };

    // Kuyruk: SourceBuffer aynı anda tek iş yapar
    let is = Promise.resolve();
    const sbIs = (f) => {
      const p = is.then(() => acildi).then(() => new Promise((coz, red) => {
        if (!sb) return red(new Error("SourceBuffer yok"));
        const bitti = () => { sb.removeEventListener("updateend", bitti); sb.removeEventListener("error", hatali); coz(); };
        const hatali = () => { sb.removeEventListener("updateend", bitti); sb.removeEventListener("error", hatali); red(new Error("SourceBuffer hatası")); };
        sb.addEventListener("updateend", bitti);
        sb.addEventListener("error", hatali);
        try { f(); } catch (e) { sb.removeEventListener("updateend", bitti); sb.removeEventListener("error", hatali); red(e); }
      }));
      is = p.catch((e) => yaz("tampon işi hatası: " + (e.name || "") + " " + e.message));   // kuyruk bir hatada kilitlenmesin
      return p;
    };

    const sonBuffer = () => (sb && sb.buffered.length ? sb.buffered.end(sb.buffered.length - 1) : 0);

    // Eski şarkılar silinir (tarayıcının ses tamponu sınırlı): sadece çalan ve sonrası kalır
    async function temizle() {
      if (!sb || !calan || !sb.buffered.length) return;
      const ilk = sb.buffered.start(0);
      const sinir = Math.max(0, Math.min(calan.bas, ogeler.currentTime) - 2);
      if (sinir - ilk > 1) await sbIs(() => sb.remove(ilk, sinir)).catch(() => { });
      for (let i = sarkilar.length - 1; i >= 0; i--) if (sarkilar[i].son < sinir) sarkilar.splice(i, 1);
    }

    // Şarkının verisini indirir ve akışın sonuna ekler; zaten eklenmişse onu döner
    const yuklemeler = new Map();
    function ekle(kimlik, adres) {
      const var_ = sarkilar.find((s) => s.kimlik === kimlik && s.son > ogeler.currentTime);
      if (var_) return Promise.resolve(var_);
      if (yuklemeler.has(kimlik)) return yuklemeler.get(kimlik);
      const s = (async () => {
        const yanit = await fetch(adres, { cache: "no-store" });
        if (!yanit.ok) throw new Error("HTTP " + yanit.status);
        const veri = await yanit.arrayBuffer();
        await temizle();
        let kayit = null;
        const ekleIs = () => sbIs(() => {
          const bas = sonBuffer();
          kayit = { kimlik, bas, son: bas };
          sb.timestampOffset = bas;
          sb.appendBuffer(veri);
        });
        try {
          await ekleIs();
        } catch (e) {
          // Ses tamponu doldu: çalan yerin 1 sn gerisine kadar her şey silinip bir kez daha denenir
          yaz("tampon doldu, temizlenip yeniden ekleniyor");
          if (sb && sb.buffered.length && ogeler.currentTime - 1 > sb.buffered.start(0)) {
            await sbIs(() => sb.remove(sb.buffered.start(0), ogeler.currentTime - 1)).catch(() => { });
          }
          await ekleIs();
        }
        kayit.son = sonBuffer();
        sarkilar.push(kayit);
        yaz("eklendi " + kimlik + " " + Math.round(kayit.son - kayit.bas) + " sn");
        return kayit;
      })().finally(() => yuklemeler.delete(kimlik));
      yuklemeler.set(kimlik, s);
      return s;
    }

    // Çalan şarkıyı değiştirir: öğe durmaz; yeni şarkının başına (ya da istenen saniyesine) atlar.
    // Şarkı henüz eklenmediyse öğe tamponun sonuna atlar ve orada sessizce bekler.
    let hedefSaniye = 0;
    const sonAdres = {};
    function sarkiyaGec(kimlik, adres) {
      sonAdres[kimlik] = adres;
      istenenKimlik = kimlik;
      hata = null;
      bittiBildirildi = null;
      calan = null;
      hedefSaniye = 0;
      const hazir = sarkilar.find((s) => s.kimlik === kimlik && s.son > ogeler.currentTime - 1);
      if (hazir) { atla(hazir); return; }
      // Yeni şarkı gelene kadar sessizlik: tamponun sonu (öğe "bekliyor" olur, durmaz)
      try { if (sonBuffer() > 0) ogeler.currentTime = sonBuffer(); } catch (e) { }
      ekle(kimlik, adres).then((k) => { if (istenenKimlik === kimlik) atla(k); }).catch((e) => {
        if (istenenKimlik !== kimlik) return;
        hata = { code: 2, message: e.message };
        yaz("şarkı eklenemedi " + kimlik + ": " + e.message);
        ates("error");
      });
    }
    function atla(k) {
      calan = k;
      // Önceki şarkı bitip öğe kendiliğinden bu şarkıya akmışsa atlanmaz (küçük bir geri sıçrama olmasın)
      const icinde = ogeler.currentTime >= k.bas && ogeler.currentTime < k.son;
      if (!(icinde && hedefSaniye === 0)) { try { ogeler.currentTime = k.bas + hedefSaniye + 0.01; } catch (e) { } }
      ates("loadedmetadata");
      if (!ogeler.paused) ates("playing");
    }
    const tampondaMi = (t) => {
      if (!sb) return false;
      for (let i = 0; i < sb.buffered.length; i++) if (t >= sb.buffered.start(i) - 0.05 && t < sb.buffered.end(i)) return true;
      return false;
    };

    // Şarkının sonu: "ended" bildirilir; sıradaki zaten eklenmişse öğe kesintisiz ona akar
    ogeler.addEventListener("timeupdate", () => {
      if (calan && ogeler.currentTime >= calan.son - 0.08 && bittiBildirildi !== calan) {
        bittiBildirildi = calan;
        yaz("bitti " + calan.kimlik);
        ates("ended");
      }
    });
    ogeler.addEventListener("playing", () => { yaz("çalıyor"); if (calan) ates("playing"); });
    ogeler.addEventListener("pause", () => yaz("durdu (pause)"));
    ogeler.addEventListener("waiting", () => yaz("bekliyor (veri yok)"));
    ogeler.addEventListener("error", () => { yaz("öğe hatası " + (ogeler.error ? ogeler.error.code : "")); hata = ogeler.error; ates("error"); });

    const ad = {
      // src atanınca o şarkıya geçilir; "&v=<kimlik>" adresten okunur
      set src(adres) {
        const kimlik = (/[?&]v=([A-Za-z0-9_-]{11})/.exec(adres) || [])[1];
        if (!kimlik) return;
        yaz("geç → " + kimlik);
        sarkiyaGec(kimlik, adres);
      },
      get src() { return istenenKimlik || ""; },
      get currentSrc() { return istenenKimlik || ""; },
      removeAttribute() {
        // Akış bırakıldı (YouTube'a geçildi): öğe sessizce tamponun sonunda bekler
        istenenKimlik = null; calan = null;
        try { if (sonBuffer() > 0) ogeler.currentTime = sonBuffer(); } catch (e) { }
      },
      load() { },
      play() {
        const s = ogeler.play();
        if (s && s.then) s.then(() => yaz("play() tamam"), (e) => yaz("play() reddedildi: " + e.name));
        return s || Promise.resolve();
      },
      pause() { ogeler.pause(); },
      get paused() { return ogeler.paused; },
      get ended() { return !!(calan && bittiBildirildi === calan && ogeler.currentTime >= calan.son - 0.08); },
      get seeking() { return ogeler.seeking; },
      get readyState() { return calan ? ogeler.readyState : 0; },
      get networkState() { return ogeler.networkState; },
      get error() { return hata; },
      get currentTime() { return calan ? Math.max(0, ogeler.currentTime - calan.bas) : hedefSaniye; },
      set currentTime(t) {
        hedefSaniye = Math.max(0, t);
        if (!calan) return;
        const hedef = Math.min(calan.son - 0.1, calan.bas + hedefSaniye);
        // Şarkının o kısmı tampondan silinmişse (geri sarma) şarkı akışın sonuna yeniden eklenir
        if (!tampondaMi(hedef)) {
          const { kimlik } = calan, adres = sonAdres[kimlik], sn = hedefSaniye;
          if (adres) {
            yaz("geri sarma: " + kimlik + " yeniden ekleniyor");
            sarkilar.splice(sarkilar.indexOf(calan), 1);
            sarkiyaGec(kimlik, adres);
            hedefSaniye = sn;
            return;
          }
        }
        try { ogeler.currentTime = hedef; } catch (e) { }
      },
      get duration() { return calan ? calan.son - calan.bas : NaN; },
      get buffered() {
        const n = calan ? 1 : 0;
        return { length: n, start: () => 0, end: () => (calan ? Math.max(0, Math.min(calan.son, sonBuffer()) - calan.bas) : 0) };
      },
      get volume() { return ogeler.volume; },
      set volume(v) { ogeler.volume = v; },
      set preload(v) { },
      addEventListener(tur, f) { (dinleyiciler[tur] = dinleyiciler[tur] || []).push(f); },
      removeEventListener(tur, f) { dinleyiciler[tur] = (dinleyiciler[tur] || []).filter((x) => x !== f); },
      // Sıradaki şarkıyı önceden ekler: şarkı bitince kesintisiz ona akılır
      onceden(kimlik, adres) {
        if (!calan || sarkilar.some((s) => s.kimlik === kimlik && s.bas >= calan.bas)) return;
        ekle(kimlik, adres).then(() => yaz("önceden eklendi " + kimlik)).catch(() => { });
      },
      kesintisiz: true,
      oge: ogeler
    };
    return ad;
  };
})();
