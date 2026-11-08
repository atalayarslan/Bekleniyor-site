// Odadaki okey masası: üst çubuktaki "🀄 Okey" düğmesi, fotoğrafların yerine çıkan masa katmanı ve masa sunucusuyla
// (okey-sunucu, Cloudflare) bağlantı. Kurallar sunucuda uygulanır; burada çizilir ve oyuncunun yapmak istediği
// gönderilir. Istakadaki diziliş (taşların yeri) oyuncunun kendi ekranındadır; sunucu sadece hangi taşların
// elinde olduğunu bilir.
//
// Masa hep "ben alttayım" diye çizilir: sunucudaki koltuk numaraları (0-3) oturduğum (izleyiciysem yancısı
// olduğum, yoksa 0.) koltuk alta gelecek şekilde döndürülür. Oyun saat yönünün tersine döner: sağımdaki
// sunucuda bir sonraki koltuktur.

(function () {
  "use strict";
  const K = window.OkeyKurallar;
  const YUVA = 30, SATIR = 15;
  const RENKLER = ["#8a5a3c", "#2f6fb0", "#2f8f5a", "#a8326e"];

  // Sunucu adresi. Kendi bilgisayarında denerken (localhost) yerel sunucu; ?okeySunucu=http://127.0.0.1:8788 ile başka port
  function sunucuAdresi() {
    const p = new URLSearchParams(location.search).get("okeySunucu");
    if (p && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(p)) return p;
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return "http://127.0.0.1:8787";
    return AYARLAR.okeySunucu;
  }

  let tus = null, kok = null, masa = null, ws = null, durum = null;
  let acik = false, yeniden = 0, ofset = 0, sureZamani = null;
  let yuvalar = Array(YUVA).fill(null), elAnahtari = null, yeniId = null;
  let kuyruk = Promise.resolve();   // olay animasyonları sırayla oynar, sonra durum çizilir

  const benimKoltugum = () => (durum ? durum.ben.koltuk : -1);
  const oturuyorum = () => benimKoltugum() >= 0;
  const baz = () => (oturuyorum() ? benimKoltugum() : durum && durum.ben.yanci != null ? durum.ben.yanci : 0);
  const gorunen = (s) => (s - baz() + 4) % 4;      // sunucu koltuğu → ekrandaki yer (0 alt, 1 sağ, 2 üst, 3 sol)
  const sunucudaki = (v) => (v + baz()) % 4;
  const ad = (s) => (durum && durum.koltuklar[s] && durum.koltuklar[s].ad) || "Oyuncu";

  // ---------- bağlantı ----------
  // Giriş yapmamış oyuncunun kalıcı kimliği (sayfayı yenileyince koltuğuna geri dönsün).
  // Test düzeneğinde her sekme ?kim= ile ayrı kişidir.
  function misafirKimligi() {
    const kim = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("kim");
    const anahtar = "okeyMisafir" + (kim ? ":" + kim : "");
    try {
      let id = localStorage.getItem(anahtar);
      if (!/^[a-z0-9]{16}$/.test(id || "")) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
        localStorage.setItem(anahtar, id);
      }
      return id;
    } catch (e) {
      return "misafir" + Math.random().toString(36).slice(2, 11).padEnd(9, "0");
    }
  }

  const benimAdim = () => (typeof isim !== "undefined" && isim) || "Misafir";
  let soylenenAd = null;
  async function merhaba() {
    let kart = null;
    try { if (typeof kullanici !== "undefined" && kullanici && kullanici.getIdToken) kart = await kullanici.getIdToken(); } catch (e) { }
    soylenenAd = benimAdim();
    gonder({ t: "merhaba", kart, ad: soylenenAd, misafir: { id: misafirKimligi(), ad: soylenenAd } });
  }
  // Odaya katılırken ad sonradan yazılır: değişince masaya yeni adla yeniden merhaba denir
  setInterval(() => { if (ws && ws.readyState === 1 && soylenenAd !== benimAdim()) merhaba(); }, 1500);

  function baglan() {
    if (ws && ws.readyState <= 1) return;
    // Sayfa yeni açıldıysa oda henüz yüklenmemiş olabilir: biraz sonra yeniden dene
    if (typeof odaId === "undefined" || !odaId) { if (acik) setTimeout(baglan, 500); return; }
    ws = new WebSocket(sunucuAdresi().replace(/^http/, "ws") + "/masa/" + encodeURIComponent(odaId));
    ws.onopen = () => { yeniden = 0; merhaba(); };
    ws.onmessage = (e) => { try { mesajAl(JSON.parse(e.data)); } catch (h) { } };
    ws.onclose = () => {
      ws = null;
      if (!acik && !oturuyorum()) return;      // masa kapalı ve oturmuyorsam yeniden bağlanmaya gerek yok
      setTimeout(baglan, Math.min(10000, 800 * 2 ** yeniden++));
      if (masa) masa.bildir("Masa bağlantısı koptu, yeniden bağlanılıyor…", "ceza");
    };
  }

  function gonder(mesaj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(mesaj));
  }

  function mesajAl(m) {
    if (m.t === "hata") { if (masa) masa.bildir(m.metin); return; }
    if (m.t !== "guncel") return;
    kuyruk = kuyruk.then(() => olaylariOynat(m.olaylar || [])).then(() => {
      durum = m.durum;
      ofset = durum.sunucuZamani - Date.now();
      dugmeyiGuncelle();
      uygula();
      for (const o of m.olaylar || []) if (o.tur === "elBitti") sonucuGoster(o.baslik);
    }).catch(() => { });
  }

  // ---------- olay animasyonları ----------
  async function olaylariOynat(olaylar) {
    if (!masa || !durum || !acik) return;
    const O = masa.oge;
    for (const o of olaylar) {
      const v = gorunen(o.k);
      const ben = v === 0 && oturuyorum();
      try {
        if (o.tur === "cek") await masa.ucur(O.deste(), ben ? O.yuva(bosYuva()) : O.rakipIstaka(v), null, 360);
        else if (o.tur === "at") await masa.ucur(ben ? O.tas(o.tas.id) : O.rakipIstaka(v), O.atilan(v), o.tas, 380);
        else if (o.tur === "soldanAl") await masa.ucur(O.atilanUst(gorunen((o.k + 3) % 4)), ben ? O.yuva(bosYuva()) : O.rakipIstaka(v), o.tas, 380);
        else if (o.tur === "geriBirak") await masa.ucur(ben ? O.tas(o.tas.id) : O.rakipIstaka(v), O.atilan(gorunen((o.k + 3) % 4)), o.tas, 380);
        else if (o.tur === "ceza") { masa.puanUcur(v, o.miktar); masa.bildir(ad(o.k) + ": " + o.neden + (o.miktar > 0 ? " +" : " ") + o.miktar, "ceza"); }
        else if (o.tur === "acti") masa.bildir(ad(o.k) + " " + o.deger + (o.cift ? " çift" : "") + " ile açtı");
        else if (o.tur === "sure") masa.bildir(ad(o.k) + ": süre doldu, otomatik oynandı");
        else if (o.tur === "islekGosterildi") {
          masa.islekVurgula(o.per);
          masa.bildir("⚠️ " + ad(o.k) + " gösterdi: " + ad(o.atan) + " işlek taş attı", "ceza");
          await new Promise((r) => setTimeout(r, 1400));   // ceza yazısından önce okunsun
        }
        else if (o.tur === "islekDegil") masa.bildir(ad(o.k) + " gösterdi ama taş o pere işlenmiyor (ceza yok)");
      } catch (e) { }
    }
  }

  // ---------- ıstaka (benim ekranımdaki diziliş) ----------
  const yeriBul = (id) => yuvalar.findIndex((t) => t && t.id === id);
  function bosYuva() {
    const bos = (i) => i < 0 || i >= YUVA || !yuvalar[i];
    for (let i = YUVA - 1; i >= 0; i--) {
      const kenar = (d) => Math.floor((i + d) / SATIR) !== Math.floor(i / SATIR);
      if (!yuvalar[i] && (kenar(-1) || bos(i - 1)) && (kenar(1) || bos(i + 1))) return i;
    }
    return yuvalar.lastIndexOf(null);
  }

  // Sunucunun söylediği taşlarla ıstakayı eşle: yeni el gelince baştan dizilir; sonra sadece giden taşlar
  // kalkar, gelen taşlar boş bir yuvaya konur (oyuncunun dizdiği yerler bozulmaz)
  function istakayiEsle(E) {
    const taslar = E && E.taslar;
    if (!taslar || !oturuyorum()) { yuvalar = Array(YUVA).fill(null); elAnahtari = null; return; }
    const anahtar = (durum.oyun && durum.oyun.id) + ":" + E.gosterge.id + ":" + E.okey.r + "/" + E.okey.n;
    if (anahtar !== elAnahtari) {
      elAnahtari = anahtar;
      yuvalar = K.istakayaYerlestir(K.seriDiz(taslar, E.okey), YUVA, SATIR);
      yeniId = null;
      return;
    }
    const ids = new Set(taslar.map((t) => t.id));
    yuvalar = yuvalar.map((t) => (t && ids.has(t.id) ? t : null));
    for (const t of taslar) {
      if (yeriBul(t.id) < 0) { yuvalar[bosYuva()] = t; yeniId = t.id; }
    }
  }

  function tasTasi(id, hedef) {
    if (!oturuyorum()) return;
    const kaynak = yeriBul(id);
    if (kaynak < 0 || kaynak === hedef) return;
    const tas = yuvalar[kaynak];
    if (!yuvalar[hedef]) { yuvalar[hedef] = tas; yuvalar[kaynak] = null; }
    else {
      yuvalar[kaynak] = null;
      const satirBasi = Math.floor(hedef / SATIR) * SATIR;
      let bos = -1;
      for (let i = hedef; i < satirBasi + SATIR; i++) if (!yuvalar[i]) { bos = i; break; }
      if (bos >= 0) { for (let i = bos; i > hedef; i--) yuvalar[i] = yuvalar[i - 1]; }
      else {
        for (let i = hedef; i >= satirBasi; i--) if (!yuvalar[i]) { bos = i; break; }
        if (bos < 0) { yuvalar[kaynak] = tas; return; }
        for (let i = bos; i < hedef; i++) yuvalar[i] = yuvalar[i + 1];
      }
      yuvalar[hedef] = tas;
    }
    yeniId = null;
    uygula();
  }

  // Istakadaki bir peri (bas..son yuvaları) bütün olarak taşır; hedef, perin ilk taşının gideceği yuva. Satır sonuna
  // taşıyorsa per sola çekilir. Gideceği yuvalarda başka taş varsa taşınmaz (per yerinde kalır).
  function perTasi(bas, son, hedef) {
    if (!oturuyorum()) return;
    const uzunluk = son - bas + 1;
    const satirBasi = Math.floor(hedef / SATIR) * SATIR;
    hedef = Math.min(hedef, satirBasi + SATIR - uzunluk);
    if (hedef === bas) return;
    const taslar = yuvalar.slice(bas, son + 1);
    const yeni = yuvalar.slice();
    for (let i = bas; i <= son; i++) yeni[i] = null;
    for (let i = 0; i < uzunluk; i++) if (yeni[hedef + i]) { masa.bildir("Per oraya sığmıyor, boş bir yere bırak"); return; }
    taslar.forEach((t, i) => { yeni[hedef + i] = t; });
    yuvalar = yeni;
    yeniId = null;
    uygula();
  }

  // ---------- açış ve işleme (doğrulama sunucuda; burada düğmelerin durumu ve gönderilecek gruplar) ----------
  function ayar() { return Object.assign({}, K.VARSAYILAN, durum.ayar); }
  const benimTaslarim = () => yuvalar.filter(Boolean);
  const gostergeIcin = (E) => (E.gostergeMasada ? E.gosterge : null);

  function acilisDurumu() {
    const E = durum.el;
    const k = benimKoltugum();
    const a = ayar();
    const gruplar = K.gruplariBul(yuvalar, SATIR);
    const seri = gruplar.flatMap((g) => K.gruptakiPerler(g, E.okey, a));
    // Çiftler elin tamamından sayılır (yan yana dizmek gerekmez); seri açan sonradan çift koyacaksa ıstakada dizdikleri
    const elinCiftleri = K.eldekiCiftler(benimTaslarim(), E.okey);
    const cift = E.acti[k] === "seri" ? K.istakadakiCiftler(gruplar, E.okey, gostergeIcin(E), a) : elinCiftleri;
    const seriDeger = seri.reduce((t, g) => t + K.perCoz(g, E.okey, a).puan, 0);
    const kalan = benimTaslarim().length;
    const seriTas = seri.reduce((t, x) => t + x.length, 0);
    const ciftTas = cift.reduce((t, x) => t + x.length, 0);
    const yandan = E.yandanId && benimTaslarim().find((t) => t.id === E.yandanId);
    const icinde = (gs) => {
      if (!yandan) return true;
      const y = K.kimlik(yandan, E.okey);
      return gs.flat().some((t) => !K.okeyMi(t, E.okey) && ((x) => x.r === y.r && x.n === y.n)(K.kimlik(t, E.okey)));
    };
    if (E.acti[k]) {
      // Açtığı türün dışındakini ancak masada o türle açmış başka biri varsa koyabilir (önce perler, çiftler sonraki basışta)
      const serbest = (tur) => E.acti[k] === tur || E.acti.some((x, i) => i !== k && x === tur);
      const yeni = serbest("seri") && seri.length ? seri : serbest("cift") ? cift : [];
      return { acti: true, gruplar: yeni, yeniPer: yeni.length > 0 && kalan - yeni.reduce((t, x) => t + x.length, 0) >= 1 };
    }
    const seriBaraj = K.acmaBaraji(E.acilislar, "seri", k, a);
    const ciftBaraj = K.acmaBaraji(E.acilislar, "cift", k, a);
    return {
      acti: false, seri: seriDeger, cift: cift.length, seriBaraj, ciftBaraj, seriGruplar: seri, ciftGruplar: cift,
      seriOlur: seri.length && (seriDeger >= seriBaraj || seriTas === kalan - 1) && icinde(seri) && kalan - seriTas >= 1,
      ciftOlur: cift.length >= ciftBaraj && icinde(cift) && kalan - ciftTas >= 1
    };
  }

  function ac() {
    const d = acilisDurumu();
    const gruplar = d.acti ? (d.yeniPer ? d.gruplar : null) : d.seriOlur ? d.seriGruplar : d.ciftOlur ? d.ciftGruplar : null;
    if (!gruplar) return;
    gonder({ t: "ac", gruplar: gruplar.map((g) => g.map((t) => t.id)) });
  }

  function istakadakiPerler() {
    const E = durum.el;
    const a = ayar();
    const sonuc = [];
    const gruplar = K.gruplariBul(yuvalar, SATIR);
    for (const g of gruplar) {
      for (const per of K.gruptakiPerler(g, E.okey, a)) {
        const bas = yeriBul(per[0].id);
        sonuc.push({ bas, son: bas + per.length - 1, yazi: String(K.perCoz(per, E.okey, a).puan) });
      }
    }
    return sonuc;
  }

  // ---------- çizim ----------
  function uygula() {
    if (!masa || !durum || !acik) return;
    const E = durum.el;
    istakayiEsle(E);
    const k = benimKoltugum();
    const toplam = durum.oyun ? OkeyCetele.toplamlar(durum.oyun) : null;
    const oturan = durum.koltuklar.filter((x) => !x.bos).length;
    const elVar = E && !E.bitti;
    const benSiram = elVar && oturuyorum() && E.sira === k;
    // Seri/çift bilgisi sıra başkasındayken de görünür; düğmeler yalnız sıra bendeyken çalışır
    const a = elVar && oturuyorum() ? acilisDurumu() : null;

    let yazi;
    if (!E) yazi = oturan < 4 ? "Masa: " + oturan + "/4 · 4 kişi olunca oyun başlar" + (oturuyorum() ? " · boş koltuklara bot ekleyebilirsin" : "") :"Masa dolu · " + (oturuyorum() ? "'Oyunu başlat'a bas" : "oyun başlamak üzere");
    else if (E.bitti) yazi = E.sonuc ? E.sonuc.baslik : "El bitti";
    else if (benSiram) yazi = E.asama === "cek" ? "Sıra sende: desteden çek ya da soldan al" : "Taşını at" + (E.acti[k] ? " (işlemek için pere sürükle)" : " ya da elini aç");
    else yazi = ad(E.sira) + " oynuyor…";

    const izleyici = !oturuyorum();
    const yanci = durum.ben.yanci;
    let benim;
    if (!izleyici) {
      benim = { yuvalar, yandanId: E && E.yandanId, yeniId, perler: E ? istakadakiPerler() : [] };
    } else if (yanci != null && E && E.taslar) {
      benim = { yuvalar: K.istakayaYerlestir(K.seriDiz(E.taslar, E.okey), YUVA, SATIR), saltOkunur: true, donulebilir: true,
        yanciBandi: "Yancısın · " + ad(yanci) + " · onun taşlarını görüyorsun" };
    } else {
      benim = { yuvalar: Array(YUVA).fill(null), saltOkunur: true,
        yanciBandi: oturan < 4 ? "İzleyicisin · boş bir koltuğa oturabilirsin" : "İzleyicisin · birinin taşlarını görmek için 'Yancı ol'a bas" };
    }

    const sira = E ? gorunen(E.sira) : -1;
    const koltuklar = [0, 1, 2, 3].map((v) => {
      const s = sunucudaki(v);
      const kol = durum.koltuklar[s];
      const yancilar = (kol.yancilar || []).map((y) => ({ ad: y.ad, renk: "#7c5cff" }));
      if (kol.bos) return { bos: true, yancilar };
      return {
        ad: kol.ad, renk: RENKLER[s], ben: s === k, bagli: kol.bagli, devralinabilir: kol.devralinabilir, bot: kol.bot, yancilar,
        puan: toplam ? toplam[s].top : 0, ceza: E ? E.cezalar[s] : 0, tasSayisi: E ? E.tasSayilari[s] : 0,
        acti: E ? E.acti[s] : null, acilisDegeri: E ? E.acilisDegeri[s] : 0
      };
    });

    const ekTuslar = [{ yazi: "🎨 Tema", ipucu: "Taş, ıstaka ve masa teması", is: temaPaneli }];
    if (durum.ben.kurucu || durum.ben.yetkili) ekTuslar.push({ yazi: "⚙️ Ayarlar", ipucu: "Oyun türü, el sayısı, tur süresi", is: ayarPaneli });
    if (oturuyorum()) ekTuslar.push({ yazi: "🚪 Kalk", ipucu: "Koltuktan kalk", is: kalkSor });

    masa.ciz({
      okey: E ? E.okey : { r: 0, n: 1 }, gosterge: E ? E.gosterge : null, gostergeMasada: E ? E.gostergeMasada : true,
      desteSayisi: E ? E.desteSayisi : 0, sira, asama: E ? E.asama : null, benimSiram: benSiram,
      bitti: !elVar, sonrakiYazi: oturuyorum() && oturan === 4 ? (E ? "Sonraki el" : "Oyunu başlat") : null,
      sure: kalanSure(), izleyici, izlenen: yanci != null ? gorunen(yanci) : null, botEkle: oturuyorum(),
      koltukDegisir: oturuyorum() && !elVar && !(durum.oyun && !durum.oyun.bitis),
      atilanlar: [0, 1, 2, 3].map((v) => (E ? E.atilanlar[sunucudaki(v)] : [])),
      atilanlarGorunur: !durum.ayar || durum.ayar.atilanlarGorunur !== false,
      perler: E ? E.perler.map((p) => Object.assign({}, p, { sahip: gorunen(p.sahip) })) : [],
      // İşlek gösterme: başkasının son attığı taş (kendi attığımı gösteremem); gösterilip kilitlenen taşlar
      gosterilebilir: E && E.sonAtilan && oturuyorum() && E.sonAtilan.atan !== k && E.perler.length
        ? { yigin: gorunen(E.sonAtilan.atan), tasId: E.sonAtilan.tasId } : null,
      kilitliler: new Set(E ? E.kilitliler || [] : []),
      durumYazisi: yazi,
      acilis: a && (a.acti ? { acti: true, yeniPer: a.yeniPer } : a),
      tuslar: {
        ac: { etkin: benSiram && E.asama === "at" && a && (a.acti ? a.yeniPer : a.seriOlur || a.ciftOlur), yazi: E && E.acti[k] ? "Per koy" : "El aç",
          ipucu: "Istakada yan yana dizdiğin geçerli perler masaya konur" }
      },
      koltuklar, ekTuslar, benim
    });
    sureyiIslet();
  }

  // Kalkmadan önce sorulur. "Hayır" kırmızı ve belirgin, "Evet" soluk: göz önce kalmaya gitsin.
  // Pencerenin dışına tıklamak da "Hayır" sayılır.
  function kalkSor() {
    masa.pencere("Masadan ayrılmak istiyor musunuz?",
      masa.h("p", { sinif: "kalk-not" }, durum.el && !durum.el.bitti ? "El sürüyor: kalkarsan elin masada kalır, yerine başkası ya da bot oturabilir." : ""),
      [{ yazi: "Evet", sinif: "soluk", is: () => gonder({ t: "kalk" }) }, { yazi: "Hayır", sinif: "kirmizi" }]);
  }

  function kalanSure() {
    const E = durum && durum.el;
    const toplam = (durum && durum.ayar.sure) || 30;
    // Bot birkaç saniyede oynar; halkası boşalıyormuş gibi görünmesin
    if (!E || E.bitti || (durum.koltuklar[E.sira] && durum.koltuklar[E.sira].bot)) return { kalan: toplam, toplam };
    return { kalan: Math.max(0, (E.sureBitis - (Date.now() + ofset)) / 1000), toplam };
  }
  function sureyiIslet() {
    clearInterval(sureZamani);
    // Halka çeyrek saniyede bir, geçişi (.25 sn) bitince varacağı değere ayarlanır: gerçek süreden geride kalmaz,
    // halka tam bittiğinde süre dolar. Masa yeniden çizilince (diz düğmeleri) halka zıplamaz.
    sureZamani = setInterval(() => {
      if (!masa || !durum || !acik) return;
      const s = kalanSure();
      masa.sureGuncelle({ kalan: Math.max(0, s.kalan - 0.25), toplam: s.toplam });
    }, 250);
  }

  function sonucuGoster(baslik) {
    if (!masa || !durum || !durum.oyun || !acik) return;
    const govde = masa.h("div", { sinif: "cetele koyu" }, OkeyCetele.ciz(durum.oyun, { vurguEl: durum.oyun.eller.length }));
    const tuslar = [{ yazi: "Odanın çetelesi", is: ceteleSayfasi }];
    if (oturuyorum()) tuslar.push({ yazi: durum.oyun.bitis ? "Yeni oyun" : "Sonraki el", ana: true, is: () => gonder({ t: "sonraki" }) });
    else tuslar.push({ yazi: "Kapat", ana: true });
    masa.pencere(baslik + (durum.oyun.bitis ? " · oyun bitti" : ""), govde, tuslar, true);
  }

  // Odanın çetelesi (sunucudaki son 50 oyun) masanın üstünde büyük pencerede: solda oyunlar, sağda seçilenin çetelesi.
  // Süren oyun masadan gelen haliyle (sunucu kaydı ancak el bitince yazılır) listeye katılır. Açıkken 20 sn'de bir yenilenir.
  function ceteleSayfasi() {
    const h = masa.h;
    let oyunlar = null, secili = durum && durum.oyun ? durum.oyun.id : null;
    const liste = h("div", { sinif: "list" });
    const ayrinti = h("section", { sinif: "ayrinti" });
    const bos = (metin) => liste.replaceChildren(h("div", { sinif: "empty" }, metin));

    function ciz() {
      const hepsi = (oyunlar || []).filter((o) => !(durum && durum.oyun && o.id === durum.oyun.id));
      if (durum && durum.oyun) hepsi.push(durum.oyun);
      hepsi.sort((a, b) => b.baslangic - a.baslangic);
      if (!hepsi.some((o) => o.id === secili)) secili = hepsi[0] && hepsi[0].id;
      if (!hepsi.length) bos(oyunlar ? "Bu odada henüz okey oynanmadı. Masada bir el bitince burada görünür." : "Yükleniyor…");
      else liste.replaceChildren(...hepsi.map((o) => {
        const k = OkeyCetele.kart(o, () => { secili = o.id; ciz(); });
        if (o.id === secili) k.classList.add("on");
        // Oda sahibi oyunları tek tek silebilir (süren oyun hariç)
        if (yetkili() && !(durum.oyun && o.id === durum.oyun.id && !durum.oyun.bitis)) {
          k.classList.add("silinir");
          k.append(h("button", {
            sinif: "cetele-sil", title: "Bu oyunu çeteleden sil",
            onclick: (e) => { e.stopPropagation(); if (confirm("Bu oyun çeteleden silinsin mi? Geri alınamaz.")) sil(o.id); }
          }, "✕"));
        }
        return k;
      }));
      hepsiniSil.hidden = !yetkili() || !hepsi.some((o) => !(durum.oyun && o.id === durum.oyun.id && !durum.oyun.bitis));
      const oyun = hepsi.find((o) => o.id === secili);
      ayrinti.replaceChildren(...(oyun ? [OkeyCetele.ciz(oyun)] : []));
    }

    async function yukle() {
      try {
        const yanit = await fetch(sunucuAdresi() + "/cetele/" + encodeURIComponent(odaId));
        if (!yanit.ok) throw new Error(yanit.status);
        oyunlar = (await yanit.json()).oyunlar || [];
        ciz();
      } catch (e) {
        if (!oyunlar && !(durum && durum.oyun)) bos("Çetele şu an okunamadı. Biraz sonra yeniden dene.");
      }
    }

    const yetkili = () => !!(durum && durum.ben.yetkili);
    function sil(id) {
      gonder(id ? { t: "ceteleSil", id } : { t: "ceteleSil" });
      if (id === secili) secili = null;
      oyunlar = (oyunlar || []).filter((o) => id && o.id !== id);
      setTimeout(yukle, 600);
      ciz();
    }
    const hepsiniSil = h("button", {
      sinif: "cetele-hepsini-sil", title: "Odanın bütün okey çetelesini sil (süren oyun kalır)",
      onclick: () => { if (confirm("Odanın bütün okey çetelesi silinsin mi? Süren oyun kalır. Geri alınamaz.")) sil(null); }
    }, "🗑 Hepsini sil");

    const ad = document.getElementById("odaAdi");
    const zaman = setInterval(() => { if (!liste.isConnected) clearInterval(zaman); else if (!document.hidden) yukle(); }, 20000);
    masa.pencere("Okey çetelesi" + (ad && ad.textContent.trim() ? " · " + ad.textContent.trim() : ""),
      h("div", { sinif: "cetele koyu oda-cetelesi" },
        h("section", { sinif: "stack oyun-listesi" }, h("h2", { sinif: "sec" }, "Oyunlar", hepsiniSil), liste), ayrinti),
      [{ yazi: "Kapat", ana: true }], "tam", () => clearInterval(zaman));
    ciz();
    yukle();
  }

  const ceteleGoster = ceteleSayfasi;

  function temaPaneli() {
    // Kapat düğmesinin yanında kullanılan temanın adı yazar
    const adEtiketi = masa.h("span", { sinif: "tema-adi" }, "Tema: " + OkeyTema.kayitli().ad);
    masa.pencere("Taş ve masa teması", OkeyTema.panel((t) => { temaKaydet(t); adEtiketi.textContent = "Tema: " + t.ad; }),
      [{ oge: adEtiketi }, { yazi: "Kapat", ana: true }], true, () => OkeyTema.uygula(OkeyTema.kayitli()));
  }

  // Giriş yapmışsa tema hesabına da yazılır (her cihazda aynı tema gelsin). Paylaşım koduyla saklanır.
  function temaKaydet(t) {
    try {
      if (kullanici && db) db.ref("kullanicilar/" + kullanici.uid + "/okeyTema").set({ id: String(t.id || "ozel").slice(0, 40), kod: OkeyTema.kod(t) }).catch(() => { });
    } catch (e) { }
  }
  function temayiYukle() {
    OkeyTema.uygula(OkeyTema.kayitli());
    try {
      if (!kullanici || !db) return;
      db.ref("kullanicilar/" + kullanici.uid + "/okeyTema").get().then((s) => {
        const v = s.val();
        const t = v && OkeyTema.koddan(v.kod);
        if (t) OkeyTema.sec(Object.assign(t, { id: v.id }));
      }).catch(() => { });
    } catch (e) { }
  }

  function ayarPaneli() {
    const { h } = masa;
    const a = durum.ayar;
    const oyunSuruyor = durum.oyun && !durum.oyun.bitis;
    const turSec = h("select", { disabled: !!oyunSuruyor, onchange: (e) => gonder({ t: "ayar", esli: e.target.value === "esli" }) },
      h("option", { value: "tekli", selected: !a.esli ? "" : null }, "Tekli (herkes kendine)"),
      h("option", { value: "esli", selected: a.esli ? "" : null }, "Eşli (karşılıklı eş)"));
    const elSec = h("select", { disabled: !!oyunSuruyor, onchange: (e) => gonder({ t: "ayar", elSayisi: Number(e.target.value) }) },
      [5, 7, 9, 11, 15, 21, 0].map((n) => h("option", { value: n, selected: a.elSayisi === n ? "" : null }, n ? n + " el" : "Sınırsız")));
    const sureSec = h("select", { disabled: !durum.ben.yetkili, onchange: (e) => gonder({ t: "ayar", sure: Number(e.target.value) }) },
      [15, 20, 30, 45, 60, 90, 120].map((n) => h("option", { value: n, selected: a.sure === n ? "" : null }, n + " saniye")));
    const atilanSec = h("select", { onchange: (e) => gonder({ t: "ayar", atilanlarGorunur: e.target.value === "acik" }) },
      h("option", { value: "acik", selected: a.atilanlarGorunur !== false ? "" : null }, "Açık (üstüne gelince hepsi görünür)"),
      h("option", { value: "kapali", selected: a.atilanlarGorunur === false ? "" : null }, "Kapalı (sadece en üstteki)"));
    const satir = (etiket, oge, not) => h("label", { sinif: "tema-alan", stil: { marginBottom: "10px" } }, h("span", {}, etiket), oge, not ? h("small", { stil: { color: "#93a59a", fontWeight: 600 } }, not) : null);
    masa.pencere("Masa ayarları", h("div", { sinif: "tema-paneli" },
      satir("Oyun türü", turSec, oyunSuruyor ? "Oyun sürerken değişmez" : "Masayı kuran seçer"),
      satir("Bir oyun kaç el", elSec, oyunSuruyor ? "Oyun sürerken değişmez" : null),
      satir("Tur süresi", sureSec, durum.ben.yetkili ? "Oda sahibi değiştirir; sonraki turdan geçerli" : "Sadece oda sahibi değiştirebilir"),
      satir("Yanlarda atılan taşları görme", atilanSec, "Masadaki herkes için geçerli, hemen değişir")));
  }

  function kurallariGoster() {
    const { h } = masa;
    masa.pencere("Kurallar (kısa)", h("div", {}, ...[
      "Sıra saat yönünün tersine döner. Taşını sağına atarsın; solundakinin attığını alabilirsin.",
      "Soldan aldığın taşla o tur açmak (açtıysan işlemek) zorundasın. Denemek için alabilirsin: vazgeçersen taşa çift tıkla ya da sola geri sürükle, ceza yok; sonra desteden çek. Elinde ikizi varsa ikiziyle açmak da olur.",
      "Soldan aldığın taşla elini açarsan taşı atana taşın 10 katı ceza yazılır. Elini önceden açtıysan soldan alıp per koyman ya da işlemen ceza yazdırmaz.",
      "Açmak için yan yana dizdiğin geçerli perlerin toplamı en az 101 (ya da 5 çift). Katlamalı: senden önce açanın puanını geçmelisin.",
      "Seri 13'te biter: 12-13-1 geçmez, 1-2-3 geçer.",
      "Açtığın türün dışındakini (seri açtıysan çift, çift açtıysan per) ancak masada o türle açmış başka biri varsa koyabilirsin.",
      "7 ya da daha çok çiftle açan olursa diğer herkese (eşlide iki rakibe) 101 ceza yazılır.",
      "Masadaki bir perdeki okeyin yerine asıl taşı koyup okeyi alabilirsin; perin sahibine ceza yazılmaz.",
      "İşlek taş (masadaki bir pere uyan taş) atılırsa ceza kendiliğinden yazılmaz: kime atıldıysa onun sırası bitene kadar masadaki herkes (eşlide takım arkadaşı da, botlar da) taşı yığından bir pere sürükleyip gösterebilir. Gerçekten işlekse atana 101 ceza yazılır ve o taş artık kimse tarafından alınamaz. İşlek değilse bir şey olmaz. Kimse fark etmezse açmış biri o taşı alıp işleyebilir.",
      "Son taşını işlek atan da bitirir; el sonunda 101 işlek cezası yazılır. El deste bitince kapanırsa son atılan taş işlekse onu atana da yazılır.",
      "Okey atmak 101 ceza (bitiş taşı değilse). Okeyle bitirirsen herkesin puanı katlanır.",
      "Ortadaki gösterge alınamaz; göstergeyle çift yapılmaz.",
      "Taşı sürükleyip ıstakada yerini değiştir, 'Attığın' alanına bırakıp at (ya da çift tıkla), masadaki bir pere bırakıp işle. Sağ tık taşı yatırır."
    ].map((x) => h("p", {}, "• " + x))));
  }

  const olaylar = {
    desteCek: () => gonder({ t: "cek" }),
    soldanAl: () => gonder({ t: "soldanAl" }),
    tasAt: (id) => gonder(durum && durum.el && durum.el.yandanId === id ? { t: "geriBirak" } : { t: "at", id }),
    geriBirak: () => gonder({ t: "geriBirak" }),
    tasTasi,
    perTasi,
    ac,
    isle: (id, per) => gonder({ t: "isle", id, per }),
    islekGoster: (per) => gonder({ t: "islekGoster", per }),
    seriDiz: () => { if (oturuyorum() && durum.el) { yuvalar = K.istakayaYerlestir(K.seriDiz(benimTaslarim(), durum.el.okey), YUVA, SATIR); uygula(); } },
    ciftDiz: () => { if (oturuyorum() && durum.el) { yuvalar = K.istakayaYerlestir(K.ciftDiz(benimTaslarim(), durum.el.okey, gostergeIcin(durum.el)), YUVA, SATIR); uygula(); } },
    yanciOl: (v) => { const s = sunucudaki(v); gonder({ t: "yanci", koltuk: durum.ben.yanci === s ? null : s }); },
    masayaDon: () => gonder({ t: "yanci", koltuk: null }),
    otur: (v) => gonder({ t: "otur", koltuk: sunucudaki(v) }),
    botEkle: (v) => gonder({ t: "bot", koltuk: sunucudaki(v) }),
    botCikar: (v) => gonder({ t: "botCikar", koltuk: sunucudaki(v) }),
    sonrakiEl: () => gonder({ t: durum && durum.el ? "sonraki" : "basla" }),
    cetele: ceteleGoster,
    kurallar: kurallariGoster
  };

  // ---------- oda düğmesi ve katman ----------
  function dugmeyiGuncelle() {
    if (!tus) return;
    const sayac = tus.querySelector(".okey-sayac");
    if (!durum) { sayac.textContent = ""; return; }
    const oturan = durum.koltuklar.filter((x) => !x.bos).length;
    sayac.textContent = oturan + "/4" + (durum.izleyici ? " · " + durum.izleyici + " izliyor" : "");
  }

  function masayiAc(ac) {
    acik = ac;
    const oda = document.getElementById("oda");
    oda.classList.toggle("okey-acik", acik);
    tus.classList.toggle("acik", acik);
    tus.title = acik ? "Fotoğraflara dön" : "Okey masasını aç";
    if (acik) {
      if (!masa) { temayiYukle(); masa = OkeyMasa(kok, olaylar); }
      baglan();
      uygula();
    }
  }

  function kur() {
    const oda = document.getElementById("oda");
    const odaAdi = document.getElementById("odaAdi");
    if (!oda || !odaAdi || document.getElementById("okeyTus")) return;
    tus = document.createElement("button");
    tus.id = "okeyTus";
    tus.className = "tus-cerceve okey-ac-tus";
    tus.title = "Okey masasını aç";
    tus.innerHTML = '🀄<span class="etiket"> Okey</span> <span class="okey-sayac"></span>';
    tus.addEventListener("click", () => masayiAc(!acik));
    odaAdi.after(tus);
    kok = document.createElement("div");
    kok.id = "okeyKatmani";
    kok.className = "okey-katmani";
    oda.insertBefore(kok, oda.querySelector(".oda-ust"));
    // Giriş yapılınca/çıkılınca masaya yeni kimlikle merhaba denir
    if (typeof oturumDegisince === "function") oturumDegisince(() => { if (ws && ws.readyState === 1) merhaba(); });
    if (new URLSearchParams(location.search).has("okey")) masayiAc(true);
  }

  // Odadan çıkarıldı (başka sekmede/cihazda odaya girdi ya da odadan atıldı): masa kapanır, bağlantı kesilir.
  // Kalk gönderilmez (aynı kişi başka sekmede masada olabilir); sunucu bağlantısı kalmayan oyuncuyu "bağlantı yok"
  // sayar, el sürmüyorsa 2 dk sonra koltuğu boşaltır, el sürüyorsa yerine bot ya da başkası oturabilir.
  function ayril() {
    masayiAc(false);
    const eski = ws;
    ws = null;
    durum = null;
    if (eski) { eski.onclose = null; eski.onmessage = null; eski.close(); }
    dugmeyiGuncelle();
  }

  kur();
  window.okeyMasasi = { ac: () => masayiAc(true), kapat: () => masayiAc(false), ayril };
})();
