// Kesintisiz ses (telefonda akış modu): şarkılar tek bir <audio> öğesinin içine art arda eklenir (MediaSource).
//
// Neden: Android'deki Chrome, ekran kapalıyken DURMUŞ bir oynatıcının yeniden başlamasına izin vermiyor; çalmakta
// olan sese ise dokunmuyor. Eskiden şarkı değişince oynatıcıya yeni kaynak veriliyordu; tarayıcı bunu "durdu,
// yeniden başlıyor" sayıp sesi başlatmıyordu. Burada öğe hiç durmaz: yeni şarkı aynı akışın sonuna eklenir ve
// oynatıcı oraya atlar. Şarkı henüz gelmediyse öğe sessizce bekler (durmaz), şarkı eklenince kendiliğinden çalar.
//
// Telefonun ses tamponu küçüktür (Android Chrome'da birkaç MB). Bu yüzden şarkı tek parça eklenmez:
// indirme hemen başlar, gelen parçalar bellekte biriktirilir ve tampona sırayla, yer oldukça eklenir.
// Tampon dolarsa çalınmış kısım ve sırası gelmemiş şarkılar silinir; yine yer yoksa çalma ilerleyip yer açılana
// kadar beklenir. Tamponun dolması hiçbir zaman hata sayılmaz (eskiden sayılıyordu: öğe duruyor, YouTube'a
// düşülüyordu). İlk parça eklenir eklenmez şarkı çalmaya başlar; dosyanın tamamı beklenmez.
//
// Akış sunucusunun ses dosyaları parçalı MP4'tür (DASH, yt-dlp biçim 140); MediaSource bunları doğrudan kabul eder.
// Bu sınıf HTMLAudioElement'in sitede kullanılan kısmını taklit eder (src, currentTime, duration, play, pause,
// readyState, buffered, olaylar...), böylece karmaOynatici() farkı bilmez. Zamanlar hep çalan şarkıya göredir.
// Kullanılamazsa (MediaSource yok / ses biçimi desteklenmiyor) kesintisizMi() false döner ve normal <audio> kullanılır.

(function () {
  "use strict";
  const TUR = 'audio/mp4; codecs="mp4a.40.2"';
  const PARCA = 256 * 1024;   // tampona tek seferde eklenen en büyük parça
  const yaz = (m) => { try { if (window.taniYaz) window.taniYaz(m); } catch (e) { } };
  const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

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

    // Tampondaki şarkılar: { kimlik, bas, son, tamam } (öğenin zaman çizgisinde; tamam = dosyanın hepsi eklendi)
    const sarkilar = [];
    let ucNokta = 0;           // eklenen verinin zaman çizgisindeki sonu: yeni şarkı buradan başlar
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
      is = p.catch((e) => { if (!e || e.name !== "QuotaExceededError") yaz("tampon işi hatası: " + (e.name || "") + " " + e.message); });
      return p;
    };
    // updateend beklemeyen kısa işler (abort) aynı kuyruktan geçer
    const sbHemen = (f) => {
      const p = is.then(() => acildi).then(() => { if (sb && !sb.updating) f(); });
      is = p.catch(() => { });
      return p;
    };

    const sonBuffer = () => (sb && sb.buffered.length ? sb.buffered.end(sb.buffered.length - 1) : 0);
    const tampondaMi = (t) => {
      if (!sb) return false;
      for (let i = 0; i < sb.buffered.length; i++) if (t >= sb.buffered.start(i) - 0.05 && t < sb.buffered.end(i)) return true;
      return false;
    };

    // ---------- Yükleyiciler ----------
    // Her şarkının indirmesi hemen başlar, parçalar bellekte birikir. Tampona ekleme tek bir işçi tarafından,
    // kuyruktaki sırayla yapılır (iki şarkının parçaları birbirine karışmasın).
    const kuyruk = [];
    let isciCalisiyor = false;

    function yukleyiciYap(kimlik, adres) {
      const y = { kimlik, adres, parcalar: [], boyut: 0, indi: false, hata: null, iptal: false, kayit: null, haber: null, verildi: false };
      y.ilk = new Promise((coz, red) => { y.ilkCoz = coz; y.ilkRed = red; });
      y.ilk.catch(() => { });
      y.denetci = new AbortController();
      y.uyan = () => { const h = y.haber; y.haber = null; if (h) h(); };
      (async () => {
        const t0 = Date.now();
        for (let deneme = 1; ; deneme++) {
          try {
            const yanit = await fetch(adres + (deneme > 1 ? "&yeniden=" + deneme : ""), { cache: "no-store", signal: y.denetci.signal });
            if (!yanit.ok) throw new Error("HTTP " + yanit.status);
            const okuyucu = yanit.body.getReader();
            for (;;) {
              const { done, value } = await okuyucu.read();
              if (done) break;
              if (y.iptal) return;
              y.parcalar.push(value);
              y.boyut += value.length;
              y.uyan();
            }
            y.indi = true;
            yaz("indi " + kimlik + " · " + Math.round(y.boyut / 1024) + " KB · " + ((Date.now() - t0) / 1000).toFixed(1) + " sn");
            break;
          } catch (e) {
            if (y.iptal) return;
            // Hiç veri gelmeden olan hata (ağ, sunucu) üç kez denenir; yarıda kesilen indirme hata sayılır
            if (y.boyut === 0 && deneme < 3) {
              yaz("indirme hatası " + kimlik + " (" + e.message + "), yeniden deneniyor");
              await bekle(2000);
              if (y.iptal) return;
              continue;
            }
            y.hata = e;
            break;
          }
        }
        y.uyan();
      })();
      return y;
    }

    function iptalEt(y) {
      if (y.iptal) return;
      y.iptal = true;
      try { y.denetci.abort(); } catch (e) { }
      y.uyan();
      y.ilkRed(new Error("iptal"));
      const i = kuyruk.indexOf(y);
      if (i > 0) kuyruk.splice(i, 1);   // ilk sıradakini işçi kendisi bırakır
      yaz("iptal " + y.kimlik);
    }

    async function isci() {
      if (isciCalisiyor) return;
      isciCalisiyor = true;
      try {
        while (kuyruk.length) {
          const y = kuyruk[0];
          try {
            await sarkiyiEkle(y);
          } catch (e) {
            if (!y.iptal) {
              y.hata = y.hata || e;
              if (y.verildi) yaz("şarkı yarıda kaldı " + y.kimlik + ": " + y.hata.message);
              y.ilkRed(y.hata);
            }
          }
          if (kuyruk[0] === y) kuyruk.shift();
        }
      } finally {
        isciCalisiyor = false;
      }
    }

    async function sarkiyiEkle(y) {
      let i = 0;
      for (;;) {
        if (y.iptal) return yarimKalaniSil(y);
        if (i < y.parcalar.length) {
          // Biriken parçalar birleştirilip eklenir (en çok PARCA kadar)
          let n = 0, j = i;
          while (j < y.parcalar.length && (n === 0 || n + y.parcalar[j].length <= PARCA)) n += y.parcalar[j++].length;
          const veri = new Uint8Array(n);
          for (let k = i, o = 0; k < j; k++) { veri.set(y.parcalar[k], o); o += y.parcalar[k].length; y.parcalar[k] = null; }
          i = j;
          await parcaEkle(y, veri);
          continue;
        }
        if (y.hata) throw y.hata;
        if (y.indi) break;
        await new Promise((coz) => { y.haber = coz; });
      }
      if (!y.kayit) throw new Error("dosya boş");
      y.kayit.tamam = true;
      y.parcalar = [];
      yaz("eklendi " + y.kimlik + " " + Math.round(y.kayit.son - y.kayit.bas) + " sn");
    }

    async function parcaEkle(y, veri) {
      for (let deneme = 0; ; deneme++) {
        try {
          await sbIs(() => {
            if (!y.kayit) {
              const bas = Math.max(ucNokta, sonBuffer());
              y.kayit = { kimlik: y.kimlik, bas, son: bas, tamam: false };
              sb.timestampOffset = bas;
            }
            sb.appendBuffer(veri);
          });
          break;
        } catch (e) {
          if (y.iptal) return;
          if (!e || e.name !== "QuotaExceededError") throw e;
          if (deneme === 0) yaz("tampon dolu, yer açılıyor (" + y.kimlik + ")");
          else if (deneme === 20) yaz("tampon hâlâ dolu, çalma ilerledikçe eklenecek");
          await yerAc(y);
          if (deneme > 0) await bekle(1500);
          if (y.iptal) return;
        }
      }
      if (y.iptal) return;
      y.kayit.son = Math.max(y.kayit.son, sonBuffer());
      ucNokta = Math.max(ucNokta, y.kayit.son);
      if (!y.verildi) {
        y.verildi = true;
        sarkilar.push(y.kayit);
        y.ilkCoz(y.kayit);
      }
    }

    // Tampon doldu: çalınmış kısım ve sırası gelmemiş (çalan da eklenen de olmayan) şarkılar silinir
    async function yerAc(y) {
      if (!sb || !sb.buffered.length) return;
      const simdi = ogeler.currentTime;
      const silinecek = [];
      const ilk = sb.buffered.start(0);
      if (simdi - 1 > ilk + 0.2) silinecek.push([ilk, simdi - 1]);
      for (const k of sarkilar.slice()) {
        if (k === calan || k === y.kayit) continue;
        if (k.son < simdi - 1 || k.bas >= simdi - 0.5) {
          if (k.bas >= simdi - 0.5) silinecek.push([k.bas, k.son]);
          sarkilar.splice(sarkilar.indexOf(k), 1);
        }
      }
      for (const [a, b] of silinecek) if (b - a > 0.05) await sbIs(() => sb.remove(a, b)).catch(() => { });
    }

    // İptal edilen şarkının yarım verisi silinir (ayrıştırıcı da sıfırlanır, sıradaki şarkı temiz başlasın)
    async function yarimKalaniSil(y) {
      await sbHemen(() => sb.abort()).catch(() => { });
      const k = y.kayit;
      if (!k) return;
      const i = sarkilar.indexOf(k);
      if (i >= 0) sarkilar.splice(i, 1);
      const son = sonBuffer();
      if (son - k.bas > 0.05) await sbIs(() => sb.remove(k.bas, son)).catch(() => { });
      if (ucNokta >= k.bas) ucNokta = k.bas;
    }

    // ---------- Şarkı değiştirme ----------
    // Öğe durmaz; yeni şarkının başına (ya da istenen saniyesine) atlar. Şarkı henüz tampona girmediyse öğe
    // şarkının başlayacağı yerde sessizce bekler; ilk parça eklenince oradan, şarkının ilk saniyesinden çalar.
    let hedefSaniye = 0;
    const sonAdres = {};
    function sarkiyaGec(kimlik, adres, yeniden) {
      sonAdres[kimlik] = adres;
      istenenKimlik = kimlik;
      hata = null;
      bittiBildirildi = null;
      calan = null;
      hedefSaniye = 0;
      // Başka şarkılar için süren indirmeler bırakılır (yer kaplamasın, istenen şarkı beklemesin)
      for (const y of kuyruk.slice()) if (y.kimlik !== kimlik || yeniden) iptalEt(y);
      const hazir = !yeniden && sarkilar.find((s) => s.kimlik === kimlik && s.son > ogeler.currentTime - 1);
      if (hazir) { atla(hazir); return; }
      let y = !yeniden && kuyruk.find((q) => q.kimlik === kimlik && !q.iptal);
      if (!y) {
        y = yukleyiciYap(kimlik, adres);
        kuyruk.push(y);
        isci();
      }
      try { ogeler.currentTime = Math.max(ucNokta, sonBuffer()); } catch (e) { }
      y.ilk.then((k) => { if (istenenKimlik === kimlik) atla(k); }, (e) => {
        if (istenenKimlik !== kimlik || y.iptal) return;
        hata = { code: 2, message: e.message };
        yaz("şarkı eklenemedi " + kimlik + ": " + e.message);
        ates("error");
      });
    }
    function atla(k) {
      calan = k;
      // Öğe zaten şarkının başında bekliyorsa (ya da önceki şarkı bitip buraya akmışsa) atlanmaz
      const icinde = ogeler.currentTime >= k.bas - 0.05 && ogeler.currentTime < Math.max(k.son, k.bas + 0.2);
      if (!(icinde && hedefSaniye === 0)) { try { ogeler.currentTime = k.bas + hedefSaniye + 0.01; } catch (e) { } }
      ates("loadedmetadata");
      if (!ogeler.paused) ates("playing");
    }

    // Şarkının sonu: "ended" bildirilir (şarkının hepsi eklendiyse); sıradaki zaten eklenmişse öğe kesintisiz ona akar
    ogeler.addEventListener("timeupdate", () => {
      if (calan && calan.tamam && ogeler.currentTime >= calan.son - 0.08 && bittiBildirildi !== calan) {
        bittiBildirildi = calan;
        yaz("bitti " + calan.kimlik);
        ates("ended");
      }
    });
    ogeler.addEventListener("playing", () => { yaz("çalıyor"); if (calan) ates("playing"); });
    ogeler.addEventListener("pause", () => { yaz("durdu (pause)"); ates("pause"); });
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
        // Akış bırakıldı (YouTube'a geçildi): indirmeler durur, öğe sessizce tamponun sonunda bekler
        istenenKimlik = null; calan = null;
        for (const y of kuyruk.slice()) iptalEt(y);
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
      get ended() { return !!(calan && calan.tamam && bittiBildirildi === calan && ogeler.currentTime >= calan.son - 0.08); },
      get seeking() { return ogeler.seeking; },
      get readyState() { return calan ? ogeler.readyState : 0; },
      get networkState() { return ogeler.networkState; },
      get error() { return hata; },
      get currentTime() { return calan ? Math.max(0, ogeler.currentTime - calan.bas) : hedefSaniye; },
      set currentTime(t) {
        hedefSaniye = Math.max(0, t);
        if (!calan) return;
        const hedef = calan.tamam ? Math.min(calan.son - 0.1, calan.bas + hedefSaniye) : calan.bas + hedefSaniye;
        // Şarkının o kısmı tampondan silinmişse (geri sarma) şarkı akışın sonuna yeniden eklenir.
        // Henüz gelmemiş bir yere (ileri) sarılıyorsa öğe orada bekler, veri gelince çalar.
        const gelmedi = !calan.tamam && hedef >= calan.son;
        if (!gelmedi && !tampondaMi(hedef)) {
          const { kimlik } = calan, adres = sonAdres[kimlik], sn = hedefSaniye;
          if (adres) {
            yaz("geri sarma: " + kimlik + " yeniden ekleniyor (" + Math.round(sn) + ". sn)");
            sarkilar.splice(sarkilar.indexOf(calan), 1);
            sarkiyaGec(kimlik, adres, true);
            hedefSaniye = sn;
            return;
          }
        }
        try { ogeler.currentTime = hedef; } catch (e) { }
      },
      // Şarkının hepsi eklenmeden süre bilinmez (site süreye bakıp şarkıyı bitmiş sanmasın)
      get duration() { return calan && calan.tamam ? calan.son - calan.bas : NaN; },
      get buffered() {
        const n = calan ? 1 : 0;
        return { length: n, start: () => 0, end: () => (calan ? Math.max(0, Math.min(calan.son, sonBuffer()) - calan.bas) : 0) };
      },
      get volume() { return ogeler.volume; },
      set volume(v) { ogeler.volume = v; },
      set preload(v) { },
      addEventListener(tur, f) { (dinleyiciler[tur] = dinleyiciler[tur] || []).push(f); },
      removeEventListener(tur, f) { dinleyiciler[tur] = (dinleyiciler[tur] || []).filter((x) => x !== f); },
      // Sıradaki şarkıyı önceden ekler: şarkı bitince kesintisiz ona akılır. Çalan şarkının eklenmesi bitmeden
      // başlamaz (işçi sırayla çalışır); tampon doluysa çalma ilerledikçe eklenir.
      onceden(kimlik, adres) {
        if (!calan || calan.kimlik === kimlik) return;
        if (sarkilar.some((s) => s.kimlik === kimlik && s.bas >= calan.bas) || kuyruk.some((q) => q.kimlik === kimlik && !q.iptal)) return;
        // Sıra değişmişse eski önceden yükleme bırakılır
        for (const q of kuyruk.slice()) if (q.kimlik !== istenenKimlik) iptalEt(q);
        sonAdres[kimlik] = adres;
        yaz("önceden ekleniyor " + kimlik);
        const y = yukleyiciYap(kimlik, adres);
        kuyruk.push(y);
        isci();
      },
      kesintisiz: true,
      oge: ogeler
    };
    return ad;
  };
})();
