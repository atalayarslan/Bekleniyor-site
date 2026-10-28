// Oda görünümü: herkesin aynı anda dinlediği müzik, arama, sıra ve geçmiş.

let odaId = null;
let odaRef = null;
let muzikRef = null;
let odaBilgi = null;
let odaTasarim = null;
let odaFotolar = null;
let simdiki = null;           // odada şu an çalan şarkı
let siraVerisi = {};
let oncekiListesi = [];       // geri düğmesi için son çalınan şarkılar
let radyoKapali = false;      // sıra bitince benzer şarkı eklensin mi
let gecmisListesi = [];
let ilerlemeSurukleniyor = false;
let oynatici = null;
let oynaticiHazir = false;
let yuklenenId = null;        // YouTube oynatıcısına yüklü video
let katildi = false;
let asansorSustur = false;
let isim = "Misafir";
let benimKaydim = null;
let odadakiler = [];          // [{ ad, foto }] şu an odada olanlar
let katilanlarYuklendi = false;
let odadakiHamSayi = 0;          // görünmeyen eski kayıtlar dahil
const asansor = $("elevatorMusic");
const basariSesi = $("successSound");

// ---------- Yardımcılar ----------

function konumHesapla(sarki) {
  if (!sarki) return 0;
  if (sarki.duraklatildi) return sarki.konum || 0;
  return Math.max(0, (sunucuZamani() - sarki.baslangic) / 1000);
}

function odaSahibiMi() {
  return !!(kullanici && odaBilgi && odaBilgi.sahip === kullanici.uid);
}

function duzenleyebilirMi() {
  return odaSahibiMi() || yonetici;
}

function odaVarsayilanAdi() {
  return odaId === ANA_ODA ? "Ana Oda ⭐" : "Oda";
}

function siraListesi() {
  return Object.keys(siraVerisi).sort().map((k) => Object.assign({ anahtar: k }, siraVerisi[k]));
}

// ---------- Başlangıç ----------

function odayiBaslat(id) {
  odaId = id;
  $("oda").hidden = false;
  document.title = "Bekleniyor · oda";
  odaTasariminiUygula();
  odaBasligiCiz();

  const sorun = db ? null : "Firebase bağlantısı kurulamadı.";
  if (sorun) {
    $("kurulumUyarisi").textContent = sorun;
    $("kurulumUyarisi").hidden = false;
    return;
  }

  odaRef = db.ref("odalar/" + id);
  muzikRef = odaRef.child("muzik");

  let bilgiGeldi = false;
  odaRef.child("bilgi").on("value", (s) => {
    odaBilgi = s.val();
    if (!bilgiGeldi && !odaBilgi && id !== ANA_ODA) odaBulunamadi();
    bilgiGeldi = true;
    odaBasligiCiz();
    yetkileriGuncelle();
  });
  odaRef.child("tasarim").on("value", (s) => { odaTasarim = s.val(); odaTasariminiUygula(); });
  db.ref("odaFotolari/" + id).on("value", (s) => { odaFotolar = s.val(); odaTasariminiUygula(); });

  // Müzik düğümünün tamamını dinlemek, işlemlerin (transaction) her zaman dolu veriyle başlamasını sağlar.
  muzikRef.on("value", (s) => {
    const m = s.val() || {};
    simdiki = m.simdiki || null;
    siraVerisi = m.sira || {};
    oncekiListesi = Object.values(m.onceki || {});
    radyoKapali = m.radyoKapali === true;
    sarkiDegisinceCubuguGoster();
    ekraniAcikTut();
    arayuzuGuncelle();
    siraCiz();
    senkronla();
    muzikBakimi();
  });

  // Sadece gerçekten yeni basılmış bir "Sonunda"yı kutla.
  let sonKutlama = null;
  muzikRef.child("kutlama").on("value", (s) => {
    const deger = s.val() || 0;
    if (sonKutlama !== null && deger > sonKutlama + 3000 && sunucuZamani() - deger < 15000) kutla();
    sonKutlama = Math.max(sonKutlama || 0, deger);
  });

  odaRef.child("katilanlar").on("value", (s) => {
    odadakiler = katilanListesi(s.val());
    odadakiHamSayi = Object.keys(s.val() || {}).length;
    katilanlarYuklendi = true;
    $("kisiSayisi").replaceChildren(...(odadakiler.length ? [avatarYigini(odadakiler, 3), odadakiler.length + " kişi bekliyor"] : []));
  });

  db.ref("odaGecmisi/" + id).limitToLast(100).on("value", (s) => {
    const veri = s.val() || {};
    gecmisListesi = Object.keys(veri).sort().reverse().map((k) => veri[k]);
    gecmisCiz();
  });

  db.ref(".info/connected").on("value", (s) => { if (s.val() && katildi) varliginiBildir(); });

  oturumDegisince(() => {
    yetkileriGuncelle();
    listeleriBaslat();
    if (katildi) varliginiBildir();
    if (!$("isimKutusu").value && kisaAd()) $("isimKutusu").value = kisaAd();
  });

  $("isimKutusu").value = hafizadanOku("isim") || "";
  const kayitliSes = hafizadanOku("ses");
  if (kayitliSes !== null) $("sesAyari").value = kayitliSes;
  asansor.volume = Number($("sesAyari").value) / 100;

  akisAdresiniDinle();
  odaOlaylariniBagla();
  medyaTuslariniBagla();
  duzenOlaylariniBagla();
  sahneyiPanellereBagla();
  cubukDavranisiniBagla();
  klavyeKisayollariniBagla();
  listelerCiz();
  siraCiz();
  gecmisCiz();
  arayuzuGuncelle();

  // Yönetici tarafından bu odaya taşındıysa katılma ekranı beklemeden odaya girilir
  if (new URLSearchParams(location.search).has("tasindi")) {
    history.replaceState(null, "", "?oda=" + encodeURIComponent(id));
    setTimeout(() => {
      if (katildi) return;
      odayaKatil();
      bildir("Yönetici seni bu odaya taşıdı 🎧 (müzik başlamazsa ▶'ye bas)");
    }, 1200);
  }

  const betik = document.createElement("script");
  betik.src = "https://www.youtube.com/iframe_api";
  document.body.append(betik);
}

// Bir yan panel açılıp kapandığında sahneyi (daire, fotoğraflar, üst çubuk) kalan alana kaydırır.
function sahneyiPanellereBagla() {
  const guncelle = () => {
    $("oda").classList.toggle("sag-acik", $("listePaneli").classList.contains("acik"));
    $("oda").classList.toggle("sol-acik", $("duzenPaneli").classList.contains("acik"));
  };
  const gozlemci = new MutationObserver(guncelle);
  gozlemci.observe($("listePaneli"), { attributes: true, attributeFilter: ["class"] });
  gozlemci.observe($("duzenPaneli"), { attributes: true, attributeFilter: ["class"] });
  guncelle();
}

// Alt çubuk: normalde gizli, fare alttaki şeride ya da tutamağa gelince açılır, çubuktan çıkınca kapanır.
// 📌 ile sabitlenir (tercih tarayıcıda hatırlanır). Şarkı değişince birkaç saniye görünür.
let cubukKapatmaZamanlayici = null;

function cubuguAc(sure) {
  clearTimeout(cubukKapatmaZamanlayici);
  $("oda").classList.add("cubuk-acik");
  if (sure) cubukKapatmaZamanlayici = setTimeout(cubuguKapat, sure);
}

function cubuguKapat() {
  clearTimeout(cubukKapatmaZamanlayici);
  // Fare çubuktaysa, ilerleme sürükleniyorsa ya da bir menü açıksa kapanmaz
  if ($("calar").matches(":hover") || ilerlemeSurukleniyor || !$("acilirMenu").hidden) {
    cubukKapatmaZamanlayici = setTimeout(cubuguKapat, 800);
    return;
  }
  $("oda").classList.remove("cubuk-acik");
}

function cubukDavranisiniBagla() {
  const sabitle = (acik) => {
    $("oda").classList.toggle("cubuk-sabit", acik);
    $("sabitleTus").title = acik ? "Sabitlemeyi kaldır" : "Çubuğu sabitle";
    hafizayaYaz("cubukSabit", acik ? "1" : "0");
  };
  sabitle(hafizadanOku("cubukSabit") === "1");
  $("sabitleTus").addEventListener("click", () => sabitle(!$("oda").classList.contains("cubuk-sabit")));

  const ac = () => cubuguAc();
  $("calarBolgesi").addEventListener("mouseenter", ac);
  $("calarTutamak").addEventListener("mouseenter", ac);
  $("calarTutamak").addEventListener("click", ac);
  $("calar").addEventListener("mouseenter", () => clearTimeout(cubukKapatmaZamanlayici));
  $("calar").addEventListener("mouseleave", () => { cubukKapatmaZamanlayici = setTimeout(cubuguKapat, 600); });
}

let sonGosterilenKimlik = null;
function sarkiDegisinceCubuguGoster() {
  const kimlik = sarkiKimligi(simdiki);
  if (!katildi || !kimlik || kimlik === sonGosterilenKimlik) return;
  const ilk = sonGosterilenKimlik === null;
  sonGosterilenKimlik = kimlik;
  if (!ilk && !$("calar").matches(":hover")) cubuguAc(4000);
}

// ---------- Telefonda ekran kapanınca ----------
// Telefon tarayıcıları ekran kapanınca ya da sayfa arka plana geçince videoları durdurur; YouTube da gömülü
// oynatıcıda arka planda çalmaya izin vermez (Premium özelliği). Yapılabilenler:
//  - müzik çalarken telefon ekranının kendiliğinden kararmasını engellemek (Wake Lock),
//  - sayfa arka plana geçince oynatmayı bir kez daha denemek (bazı Android tarayıcılarında işe yarar),
//  - sayfaya geri dönülünce beklemeden odadaki yere yetişmek.
let ekranKilidi = null;

async function ekraniAcikTut() {
  const gerekli = katildi && !!simdiki && !simdiki.duraklatildi && document.visibilityState === "visible" &&
    matchMedia("(hover: none)").matches;
  if (gerekli && !ekranKilidi && navigator.wakeLock) {
    try {
      ekranKilidi = await navigator.wakeLock.request("screen");
      ekranKilidi.addEventListener("release", () => { ekranKilidi = null; });
    } catch (e) { }
  } else if (!gerekli && ekranKilidi) {
    ekranKilidi.release().catch(() => { });
    ekranKilidi = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") senkronla();
  else if (katildi && oynaticiHazir && simdiki && !simdiki.duraklatildi) {
    setTimeout(() => { try { oynatici.playVideo(); } catch (e) { } }, 400);
  }
  ekraniAcikTut();
});

// Space: oynat / duraklat (yazı kutularında yazarken çalışmaz)
function klavyeKisayollariniBagla() {
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || !katildi || e.ctrlKey || e.altKey || e.metaKey) return;
    const hedef = e.target;
    if (hedef.closest && hedef.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
    if (!$("pencere").hidden || !$("yonetimPaneli").hidden) return;
    e.preventDefault();
    $("oynatTus").click();
  });
}

function odaBulunamadi() {
  $("katilEkrani").querySelector(".katil-kart").replaceChildren(
    el("h2", {}, "Oda bulunamadı"),
    el("p", {}, "Bu oda silinmiş ya da link yanlış olabilir."),
    el("a", { className: "tus-ana genis", href: "./", style: { display: "inline-block", textDecoration: "none" } }, "Lobiye dön")
  );
}

function odaTasariminiUygula() {
  if (duzenAcik) return;
  tasarimiUygula(tasarimiTamamla(odaTasarim, odaId), gecerliFotolar(odaId, odaFotolar));
}

function odaBasligiCiz() {
  const ad = (odaBilgi && odaBilgi.ad) || odaVarsayilanAdi();
  $("odaAdi").textContent = ad;
  $("katilBaslik").textContent = ad;
  $("miniAlt").textContent = ad;
  $("odadanCikTus").title = "“" + ad + "” odasından çık (müzik durur)";
  document.title = document.body.classList.contains("mini-mod") ? "Bekleniyor" : ad + " · Bekleniyor";
}

// ---------- Lobiye göz atma (mini oynatıcı) ----------
// Odaya katıldıktan sonra "← Lobi"ye basınca sayfa yenilenmez: müzik çalmaya devam eder,
// lobi açılır ve sağ altta küçük bir oynatıcı görünür. Ona basınca odaya geri dönülür.
let lobiAcildi = false;

function lobiyeGozAt(adresiDegistir = true) {
  if (!katildi) return false;
  if (!lobiAcildi) {
    lobiAcildi = true;
    lobiyiBaslat();
    siralamayiBaslat();
  }
  menuKapat();
  document.body.classList.add("mini-mod");
  $("lobi").hidden = false;
  $("lobi").scrollTop = 0;
  if (adresiDegistir) history.pushState(null, "", "./");
  odaBasligiCiz();
  arayuzuGuncelle();
  return true;
}

function odayaGeriDon(adresiDegistir = true) {
  document.body.classList.remove("mini-mod");
  $("lobi").hidden = true;
  if (adresiDegistir) history.pushState(null, "", "?oda=" + odaId);
  odaBasligiCiz();
}

function miniyiGuncelle() {
  $("miniBaslik").textContent = simdiki ? simdiki.baslik || "Bilinmeyen şarkı" : "Asansör müziği";
  // Şarkı yokken (ya da henüz YouTube'da bulunmadıysa) video yerine kapak görünür
  const kapakli = !simdiki || !gecerliId(simdiki.videoId);
  $("miniGoruntu").classList.toggle("kapakli", kapakli);
  $("miniGoruntu").style.backgroundImage = kapakli ? 'url("' + $("kapak").src + '")' : "";
}

function yetkileriGuncelle() {
  $("duzenTus").hidden = !duzenleyebilirMi();
  $("odaYonetimTus").hidden = !yonetici;
}

// ---------- Katılma ve varlık ----------

// Yönetici odadaki kaydıma komut yazabilir: "cikar" → odadan çıkarım, "tasi" → o odaya geçerim
function komutlariDinle(kayit) {
  kayit.on("value", (s) => {
    const v = s.val();
    if (!katildi || kayit !== benimKaydim || !v) return;
    if (v.cikar === true) {
      odadanCikarildi("Yönetici seni bu odadan çıkardı. İstersen tekrar katılabilirsin.");
    } else if (typeof v.tasi === "string" && gecerliOdaId(v.tasi) && v.tasi !== odaId) {
      odadanCikarildi("Yönetici seni başka bir odaya taşıyor…");
      location.href = "?oda=" + encodeURIComponent(v.tasi) + "&tasindi=1";
    }
  });
}

function varliginiBildir() {
  if (!odaRef) return;
  if (!benimKaydim) {
    benimKaydim = odaRef.child("katilanlar").push();
    komutlariDinle(benimKaydim);
  }
  benimKaydim.onDisconnect().remove();
  // Sekme kapansa bile ayrılma zamanı yazılır; odaya sonra giren, son kişinin ne zaman çıktığını bilir
  muzikRef.child("sonAyrilma").onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
  // Giriş yapmışsa profil fotoğrafı da görünür; misafirler sadece adla
  const kayit = { ad: isim, zaman: firebase.database.ServerValue.TIMESTAMP };
  if (kullanici && guvenliFoto(kullanici.photoURL)) kayit.foto = guvenliFoto(kullanici.photoURL);
  benimKaydim.set(kayit);
  aktifOturumuYaz();
}

// Odadaki kayıt dakikada bir tazelenir; tazelenmeyen kayıt 3 dakika sonra listelerden düşer (temel.js)
setInterval(() => {
  if (katildi && benimKaydim) benimKaydim.child("zaman").set(firebase.database.ServerValue.TIMESTAMP).catch(() => { });
}, 60000);

// ---------- Tek oda kuralı ----------
// Bir kişi aynı anda tek bir yerde odada sayılır. Aynı tarayıcıda başka bir sekmede ya da (Google ile
// girdiyse) başka bir cihazda bir odaya girerse, eski sekme odadan çıkar ve oradaki müzik durur.
// Böylece tarayıcının arka planda açık tuttuğu eski sekmeler insanları başka odalarda göstermez.
const SEKME = Math.random().toString(36).slice(2, 12);
const sekmeKanali = "BroadcastChannel" in window ? new BroadcastChannel("bekleniyor") : null;
let katilmaZamani = 0;
let aktifOturumUid = null;

if (sekmeKanali) {
  sekmeKanali.onmessage = (e) => {
    if (katildi && e.data && e.data.tur === "katildim" && e.data.sekme !== SEKME) {
      odadanCikarildi("Bu tarayıcıda başka bir sekmede odaya girdin, burada müzik durdu. Burada dinlemek için tekrar katıl.");
    }
  };
}

// Sadece gerçekten katılınca (ya da odadayken Google ile giriş yapınca) yazılır; bağlantı kopup
// gelince yazılmaz, yoksa geri uyanan eski bir sekme yeni sekmeyi odadan atardı.
function aktifOturumuYaz() {
  if (!kullanici || aktifOturumUid === kullanici.uid) return;
  aktifOturumUid = kullanici.uid;
  const ref = db.ref("aktifOturum/" + kullanici.uid);
  ref.set({ sekme: SEKME, oda: String(odaId).slice(0, 60), zaman: firebase.database.ServerValue.TIMESTAMP }).catch(() => { });
  ref.on("value", (s) => {
    const v = s.val();
    if (katildi && v && v.sekme !== SEKME && v.zaman > katilmaZamani) {
      odadanCikarildi("Hesabınla başka bir yerde (başka sekme ya da cihaz) bir odaya girdin, burada müzik durdu. Burada dinlemek için tekrar katıl.");
    }
  });
}

function odadanCikarildi(mesaj) {
  katildi = false;
  if (benimKaydim) {
    benimKaydim.off();
    benimKaydim.onDisconnect().cancel();
    benimKaydim.remove().catch(() => { });
    benimKaydim = null;
  }
  muzikRef.child("sonAyrilma").onDisconnect().cancel();
  muzikRef.child("sonAyrilma").set(firebase.database.ServerValue.TIMESTAMP).catch(() => { });
  if (aktifOturumUid) db.ref("aktifOturum/" + aktifOturumUid).off();
  aktifOturumUid = null;
  try { oynatici.stopVideo(); } catch (e) { }
  yuklenenId = null;
  asansor.pause();
  if (document.body.classList.contains("mini-mod")) odayaGeriDon();
  $("kurulumUyarisi").textContent = mesaj;
  $("kurulumUyarisi").hidden = false;
  $("katilEkrani").hidden = false;
  arayuzuGuncelle();
}

function odayaKatil() {
  isim = $("isimKutusu").value.trim().slice(0, 20) || kisaAd() || "Misafir";
  hafizayaYaz("isim", isim);
  katildi = true;
  katilmaZamani = sunucuZamani() - 1000;
  aktifOturumUid = null;
  $("kurulumUyarisi").hidden = true;
  $("katilEkrani").hidden = true;
  if (sekmeKanali) sekmeKanali.postMessage({ tur: "katildim", sekme: SEKME });
  // Odada kimse yokken müzik durmuş sayılır: otomatik başlamaz, ▶ ile kaldığı yerden devam eder.
  // (Görünmeyen eski kayıtlar da sayılır; yoksa güncellenmemiş bir sekmedeki biri yokmuş sanılıp müzik dururdu)
  if (katilanlarYuklendi && !odadakiHamSayi) bosOdadaDuraklat();
  varliginiBildir();
  senkronla();
  arayuzuGuncelle();
  muzikBakimi();
  ekraniAcikTut();
}

// Son kişinin çıktığı andaki konumda şarkıyı duraklatır.
function bosOdadaDuraklat() {
  if (!muzikRef || !simdiki || simdiki.duraklatildi) return;
  muzikRef.transaction((m) => {
    if (!m || !m.simdiki || m.simdiki.duraklatildi) return;
    const ayrilma = m.sonAyrilma && m.sonAyrilma > m.simdiki.baslangic ? m.sonAyrilma : sunucuZamani();
    m.simdiki.konum = Math.max(0, (ayrilma - m.simdiki.baslangic) / 1000);
    m.simdiki.duraklatildi = true;
    return m;
  }).then((sonuc) => {
    if (sonuc.committed) bildir("Odada kimse yokken müzik durdu. Devam etmek için ▶'ye bas");
  }).catch(() => { });
}

// Spotify şarkısını bulma, sıradakini hazırlama ve sıra bitince benzer şarkı ekleme.
// Müzik verisi değişince, odaya katılınca ve birkaç saniyede bir çağrılır.
function muzikBakimi() {
  if (!katildi || !muzikRef) return;
  simdikiyiCoz();
  siradakiniHazirla();
  radyoyuDoldur();
  akisiOncedenHazirla();
}

setInterval(muzikBakimi, 5000);

// ---------- Oda işlemleri (herkese yansır) ----------

function gecmiseYaz(sarki) {
  if (!sarki || !gecerliId(sarki.videoId)) return;
  db.ref("odaGecmisi/" + odaId).push(Object.assign(sarkiKaydi(sarki), {
    ekleyen: String(sarki.ekleyen || "").slice(0, 40),
    zaman: firebase.database.ServerValue.TIMESTAMP
  })).catch(() => { });
}

// Bir ya da daha fazla şarkıyı sıraya ekler; oda boşsa ilki hemen çalmaya başlar.
// Spotify'dan gelen (henüz YouTube karşılığı olmayan) şarkılar da eklenebilir; çalma sırası gelince aranır.
async function sarkilariEkle(liste, ekleyen) {
  if (!muzikRef) return;
  const kayitlar = liste.filter((s) => gecerliId(s.videoId) || s.arama || s.baslik)
    .map((s) => Object.assign(sarkiKaydi(s), { ekleyen: String(ekleyen || isim).slice(0, 40) }));
  if (!kayitlar.length) return;
  // Oda sessizse ilk şarkı hemen başlayacak: önce sunucuda hazır olsun
  if (!simdiki) await akisaHazirla(kayitlar[0].videoId);
  const anahtarlar = kayitlar.map(() => muzikRef.child("sira").push().key);
  let baslayan = null;
  return muzikRef.transaction((m) => {
    m = m || {};
    baslayan = null;
    let i = 0;
    if (!m.simdiki) {
      m.simdiki = Object.assign({}, kayitlar[0], { baslangic: sunucuZamani(), duraklatildi: false, konum: 0 });
      baslayan = m.simdiki;
      i = 1;
    }
    m.sira = m.sira || {};
    for (; i < kayitlar.length; i++) m.sira[anahtarlar[i]] = kayitlar[i];
    return m;
  }).then((sonuc) => {
    if (!sonuc.committed) return;
    if (baslayan) gecmiseYaz(baslayan);
    if (!ekleyen) bildir(kayitlar.length === 1 ? "Eklendi: " + kayitlar[0].baslik : kayitlar.length + " şarkı sıraya eklendi");
  }).catch((e) => bildir("Eklenemedi: " + e.message));
}

// Sadece biten şarkı hâlâ çalıyorsa ilerler; böylece birden fazla kişi aynı anda tetiklese de tek şarkı atlanır.
async function sonrakineGec(bitenKimlik) {
  if (!muzikRef) return;
  const siradaki = siraListesi()[0];
  if (siradaki) await akisaHazirla(siradaki.videoId);
  let baslayan = null;
  muzikRef.transaction((m) => {
    baslayan = null;
    if (!m) return m;
    if (!m.simdiki || sarkiKimligi(m.simdiki) !== bitenKimlik) return;
    m.onceki = oncekiyeEkle(m.onceki, m.simdiki);
    const anahtarlar = Object.keys(m.sira || {}).sort();
    if (!anahtarlar.length) {
      m.simdiki = null;
      return m;
    }
    const sonraki = m.sira[anahtarlar[0]];
    delete m.sira[anahtarlar[0]];
    m.simdiki = Object.assign({}, sonraki, { baslangic: sunucuZamani(), duraklatildi: false, konum: 0 });
    baslayan = m.simdiki;
    return m;
  }).then((sonuc) => {
    if (sonuc.committed && baslayan) gecmiseYaz(baslayan);
  }).catch(() => { });
}

// Geri düğmesi için odada son 5 şarkı tutulur.
const ONCEKI_SINIRI = 5;

function oncekiyeEkle(onceki, sarki) {
  const liste = Object.values(onceki || {});
  if (!sarki || !gecerliId(sarki.videoId)) return liste.length ? liste : null;
  liste.push(Object.assign(sarkiKaydi(sarki), { ekleyen: String(sarki.ekleyen || "").slice(0, 40) }));
  return liste.slice(-ONCEKI_SINIRI);
}

// Sıranın en başına eklenecek şarkı için, mevcut anahtarların hepsinden önce sıralanan bir anahtar.
function sirabasiAnahtari() {
  return "!" + String(9e15 - Date.now()).padStart(16, "0");
}

// Seçilen şarkıyı hemen çalar; çalan şarkı kapanır, sıra olduğu gibi devam eder.
// Şarkı sıradan seçildiyse sıradan çıkarılır. Spotify şarkısıysa önce YouTube'da bulunur.
async function hemenCal(sarki, siraAnahtari) {
  if (!muzikRef) return;
  if (!gecerliId(sarki.videoId)) {
    bildir("“" + sarki.baslik + "” YouTube'da aranıyor…");
    try {
      sarki = await sarkiyiCoz(sarki);
    } catch (e) {
      return bildir(e.message);
    }
  }
  const kayit = Object.assign(sarkiKaydi(sarki), { ekleyen: String(sarki.ekleyen || isim).slice(0, 40) });
  await akisaHazirla(kayit.videoId);
  let baslayan = null;
  muzikRef.transaction((m) => {
    m = m || {};
    if (m.simdiki) m.onceki = oncekiyeEkle(m.onceki, m.simdiki);
    if (siraAnahtari && m.sira) delete m.sira[siraAnahtari];
    m.simdiki = Object.assign({}, kayit, { baslangic: sunucuZamani(), duraklatildi: false, konum: 0 });
    baslayan = m.simdiki;
    return m;
  }).then((sonuc) => {
    if (!sonuc.committed) return;
    gecmiseYaz(baslayan);
    bildir("Şimdi çalıyor: " + kayit.baslik);
  }).catch((e) => bildir("Çalınamadı: " + e.message));
}

// Spotify gibi: şarkı 3 saniyeyi geçtiyse başa sarar, değilse önceki şarkıya döner.
// Çalan şarkı kaybolmasın diye sıranın en başına geri konur.
async function geriGit() {
  if (!muzikRef || !simdiki) return;
  if (konumHesapla(simdiki) > 3 || !oncekiListesi.length) {
    konumaGit(0);
    return;
  }
  await akisaHazirla(oncekiListesi[oncekiListesi.length - 1].videoId);
  let baslayan = null;
  muzikRef.transaction((m) => {
    baslayan = null;
    if (!m || !m.simdiki) return m;
    const liste = Object.values(m.onceki || {});
    if (!liste.length) return;
    const onceki = liste.pop();
    m.onceki = liste.length ? liste : null;
    m.sira = m.sira || {};
    m.sira[sirabasiAnahtari()] = Object.assign(sarkiKaydi(m.simdiki), { ekleyen: String(m.simdiki.ekleyen || "").slice(0, 40) });
    m.simdiki = Object.assign({}, onceki, { baslangic: sunucuZamani(), duraklatildi: false, konum: 0 });
    baslayan = m.simdiki;
    return m;
  }).then((sonuc) => {
    if (sonuc.committed && baslayan) gecmiseYaz(baslayan);
  }).catch(() => { });
}

// ---------- Spotify şarkılarını YouTube'da bulma ----------

// "Sanatçı - Şarkı" metnini YouTube'da arar. Bulunan sonuç "eslesmeler" altında herkes için saklanır;
// böylece aynı şarkı bir daha aranmaz ve arama hakkı harcanmaz.
async function sarkiyiCoz(sarki) {
  if (gecerliId(sarki.videoId)) return sarki;
  const metin = sarki.arama || ((sarki.kanal ? sarki.kanal + " - " : "") + sarki.baslik);
  const anahtar = eslesmeAnahtari(metin);
  let videoId = null;
  try { videoId = (await db.ref("eslesmeler/" + anahtar).get()).val(); } catch (e) { }
  if (!gecerliId(videoId)) {
    const { sonuclar } = await youtubeAra(metin);
    if (!sonuclar.length) throw new Error("“" + sarki.baslik + "” YouTube'da bulunamadı");
    videoId = sonuclar[0].videoId;
    db.ref("eslesmeler/" + anahtar).set(videoId).catch(() => { });
  }
  const sonuc = Object.assign({}, sarki, { videoId });
  delete sonuc.arama;
  return sonuc;
}

// Çalma sırası bir Spotify şarkısına gelince odadaki biri onu YouTube'da bulur ve herkes için yazar.
let cozulenKimlik = null;
async function simdikiyiCoz() {
  if (!simdiki || gecerliId(simdiki.videoId)) return;
  const kimlik = sarkiKimligi(simdiki);
  if (cozulenKimlik === kimlik) return;
  cozulenKimlik = kimlik;
  // Herkes aynı anda aramasın diye küçük, rastgele bir bekleme
  await new Promise((r) => setTimeout(r, Math.random() * 1200));
  if (!simdiki || sarkiKimligi(simdiki) !== kimlik) return;
  try {
    const bulunan = await sarkiyiCoz(simdiki);
    await akisaHazirla(bulunan.videoId);
    await muzikRef.child("simdiki").transaction((s) => {
      if (!s || sarkiKimligi(s) !== kimlik) return;
      s.videoId = bulunan.videoId;
      delete s.arama;
      s.baslangic = sunucuZamani();
      s.konum = 0;
      return s;
    });
    gecmiseYaz(Object.assign({}, simdiki, { videoId: bulunan.videoId }));
  } catch (e) {
    bildir(e.message + ", sıradakine geçiliyor");
    sonrakineGec(kimlik);
  }
}

// Sıradaki şarkı Spotify şarkısıysa, çalan şarkı sürerken önceden bulunur; geçişte bekleme olmaz.
let hazirlananKimlik = null;
async function siradakiniHazirla() {
  if (!simdiki || !gecerliId(simdiki.videoId)) return;
  const siradaki = siraListesi()[0];
  if (!siradaki || gecerliId(siradaki.videoId)) return;
  const kimlik = sarkiKimligi(siradaki);
  if (hazirlananKimlik === kimlik) return;
  hazirlananKimlik = kimlik;
  try {
    const bulunan = await sarkiyiCoz(siradaki);
    muzikRef.child("sira/" + siradaki.anahtar).transaction((s) => {
      if (!s || sarkiKimligi(s) !== kimlik) return;
      s.videoId = bulunan.videoId;
      delete s.arama;
      return s;
    });
  } catch (e) { }
}

// ---------- Sıra bitince benzer şarkılar ----------

// Çalan şarkının sanatçısından benzer şarkılar bulur. Önce YouTube araması (önbellekli),
// yetmezse odanın geçmişinden yakında çalınmamış şarkılar.
function sanatciAdi(sarki) {
  const kanal = String(sarki.kanal || "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").replace(/\s*(Official|Resmi)\s*$/i, "").trim();
  if (kanal) return kanal;
  const tire = String(sarki.baslik || "").split(" - ");
  return tire.length > 1 ? tire[0].trim() : "";
}

let radyoKimligi = null;
async function radyoyuDoldur() {
  if (radyoKapali || !simdiki || !gecerliId(simdiki.videoId) || siraListesi().length) return;
  const kimlik = simdiki.videoId;
  if (radyoKimligi === kimlik) return;
  radyoKimligi = kimlik;
  // Aynı şarkı için odada sadece bir kişi öneri arasın
  const sahiplen = await muzikRef.child("radyoIcin").transaction((v) => (v === kimlik ? undefined : kimlik));
  if (!sahiplen.committed) return;

  const yakinda = new Set([kimlik, ...gecmisListesi.slice(0, 40).map((s) => s.videoId)]);
  const oneriler = [];
  const sanatci = sanatciAdi(simdiki);
  if (sanatci) {
    try {
      const { sonuclar } = await youtubeAra(sanatci);
      for (const s of karistir(sonuclar)) {
        if (!yakinda.has(s.videoId) && !/\b(mix|full album|playlist|1 hour|live stream)\b/i.test(s.baslik)) {
          oneriler.push(s);
          yakinda.add(s.videoId);
        }
        if (oneriler.length >= 4) break;
      }
    } catch (e) { }
  }
  for (const s of karistir(gecmisListesi.slice(10))) {
    if (oneriler.length >= 5) break;
    if (!yakinda.has(s.videoId)) { oneriler.push(s); yakinda.add(s.videoId); }
  }
  if (oneriler.length && !siraListesi().length) sarkilariEkle(oneriler, "📻 Benzer");
}

function simdikiniDegistir(degistir) {
  if (!muzikRef) return;
  muzikRef.child("simdiki").transaction((s) => {
    if (!s) return s;
    degistir(s);
    return s;
  });
}

function duraklat() {
  simdikiniDegistir((s) => {
    if (s.duraklatildi) return;
    s.konum = konumHesapla(s);
    s.duraklatildi = true;
  });
}

function devamEt() {
  simdikiniDegistir((s) => {
    if (!s.duraklatildi) return;
    s.baslangic = sunucuZamani() - (s.konum || 0) * 1000;
    s.duraklatildi = false;
  });
}

function konumaGit(saniye) {
  simdikiniDegistir((s) => {
    if (s.duraklatildi) s.konum = saniye;
    else s.baslangic = sunucuZamani() - saniye * 1000;
  });
}

function siraKaristir() {
  muzikRef.child("sira").transaction((sira) => {
    if (!sira) return sira;
    const yeni = {};
    for (const s of karistir(Object.values(sira))) yeni[muzikRef.child("sira").push().key] = s;
    return yeni;
  });
}

// ---------- Bu cihazdaki oynatıcıyı odaya uydurma ----------

function senkronla() {
  if (!katildi) return;

  if (!simdiki) {
    if (oynaticiHazir && yuklenenId) {
      oynatici.stopVideo();
      yuklenenId = null;
    }
    if (asansorSustur) asansor.pause();
    else asansor.play().catch(() => { });
    return;
  }

  asansor.pause();
  if (!oynaticiHazir) return;

  // Spotify şarkısı henüz YouTube'da bulunmadıysa bekle
  if (!gecerliId(simdiki.videoId)) {
    if (yuklenenId) {
      oynatici.stopVideo();
      yuklenenId = null;
    }
    return;
  }

  const hedef = konumHesapla(simdiki);
  // Reklam sırasında sarmak ya da oynatmak reklamı bozabilir; reklam bitince odaya yetişilir
  if (reklamKesin && simdiki.videoId === yuklenenId) return;
  if (simdiki.videoId !== yuklenenId) {
    yuklenenId = simdiki.videoId;
    if (simdiki.duraklatildi) oynatici.cueVideoById({ videoId: yuklenenId, startSeconds: hedef });
    else oynatici.loadVideoById({ videoId: yuklenenId, startSeconds: hedef });
    return;
  }

  // Odada kimse yokken şarkı çoktan bitmiş olabilir. Süresinin ötesine sarmaya çalışmak YouTube'da
  // başa sarmaya dönüşüp şarkıyı 1-2 saniyede bir başa aldığı için doğrudan sıradakine geçilir.
  const sure = oynatici.getDuration() || 0;
  if (!simdiki.duraklatildi && sure > 0 && hedef >= sure - 0.5) {
    sonrakineGec(sarkiKimligi(simdiki));
    return;
  }

  const durum = oynatici.getPlayerState();
  const fark = Math.abs(oynatici.getCurrentTime() - hedef);
  if (simdiki.duraklatildi) {
    if (durum === YT.PlayerState.PLAYING || durum === YT.PlayerState.BUFFERING) oynatici.pauseVideo();
    if (fark > 1) oynatici.seekTo(hedef, true);
  } else {
    if (fark > 2.5) oynatici.seekTo(hedef, true);
    if (durum !== YT.PlayerState.PLAYING && durum !== YT.PlayerState.BUFFERING && durum !== YT.PlayerState.ENDED) {
      oynatici.playVideo();
    }
  }
}

// ---------- Reklamsız akış ----------
// Odanın sahibi bilgisayarında akış sunucusunu (akis-sunucusu/, "Bekleniyor akışı başlat.bat") açtıysa
// adresi Firebase'de "ayarlar/akis" altında durur. Sunucu cevap veriyorsa şarkılar YouTube oynatıcısı
// yerine o sunucudan, sitenin kendi <video> öğesiyle çalınır: reklam çıkmaz. Telefonlarda sadece ses
// (<audio>) çalınır; böylece ekran kapalıyken de çalabilir. Sunucu kapalıysa ya da bir şarkıda sorun
// çıkarsa o şarkı her zamanki gibi YouTube'dan çalar.
const TELEFON = matchMedia("(hover: none)").matches;
const AKIS_ADRESI = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;
let akisAdresi = null;
let akisCalisiyor = false;
const akistanCalmayanlar = new Set(); // bu oturumda sunucudan çalınamayan şarkılar

async function akisSunucusunuDene() {
  if (!akisAdresi) {
    akisCalisiyor = false;
    return;
  }
  const iptal = new AbortController();
  const zaman = setTimeout(() => iptal.abort(), 4000);
  try {
    const yanit = await fetch(akisAdresi + "/saglik", { signal: iptal.signal, cache: "no-store" });
    akisCalisiyor = yanit.ok && (await yanit.json()).ok === true;
  } catch (e) {
    akisCalisiyor = false;
  }
  clearTimeout(zaman);
}

setInterval(akisSunucusunuDene, 60000);

function akisAdresiniDinle() {
  db.ref("ayarlar/akis").on("value", (s) => {
    const v = s.val();
    // Kendi bilgisayarında denerken (localhost) yerel sunucu kullanılır; ?yerelAkis=8791 ile başka port
    const yerelPort = Number(new URLSearchParams(location.search).get("yerelAkis")) || 8790;
    akisAdresi = v && AKIS_ADRESI.test(v.adres) ? v.adres
      : location.hostname === "localhost" ? "http://127.0.0.1:" + yerelPort : null;
    akisSunucusunuDene();
  });
}

// Ses herkeste ayrı bir akıştan çalar ("ses"). Bilgisayarlarda üstüne 720p sessiz görüntü ("video720")
// sese senkron oynatılır; YouTube görüntü+sesi birlikte en fazla 360p verdiği için kalite böyle artar.
// Odadakiler farklı cihazlarda olabildiği için ikisi de her zaman hazırlanır.
const AKIS_TURLERI = ["ses", "video720"];

// Sıradaki 3 şarkının sadece başı sunucuda önceden indirilir (atlanabilecekleri için tamamı değil);
// şarkı değişince hemen çalmaya başlar.
const oncedenHazirlananlar = new Set();
function akisiOncedenHazirla() {
  if (!akisCalisiyor) return;
  for (const sarki of siraListesi().slice(0, 3)) {
    if (!gecerliId(sarki.videoId) || oncedenHazirlananlar.has(sarki.videoId)) continue;
    oncedenHazirlananlar.add(sarki.videoId);
    for (const tur of AKIS_TURLERI) {
      fetch(akisAdresi + "/hazirla?kismi=1&v=" + sarki.videoId + "&tur=" + tur, { cache: "no-store" }).catch(() => { });
    }
  }
}

// YouTube her şarkıyı vermeden önce birkaç saniye bekletiyor. Şarkı odada başlatılmadan (saat işlemeye
// başlamadan) önce sunucuda çalmaya hazır olması beklenir; böylece kimse şarkının ilk saniyelerini kaçırmaz.
// Bu sırada çalan şarkı çalmaya devam eder. Sunucu yoksa ya da 20 saniyede hazır olmazsa beklenmez.
async function akisaHazirla(videoId) {
  if (!akisCalisiyor || !gecerliId(videoId) || akistanCalmayanlar.has(videoId)) return;
  const iptal = new AbortController();
  const zaman = setTimeout(() => iptal.abort(), 20000);
  const uyari = setTimeout(() => bildir("Şarkı hazırlanıyor…"), 900);
  await Promise.all(AKIS_TURLERI.map((tur) =>
    fetch(akisAdresi + "/hazirla?bekle=1&v=" + videoId + "&tur=" + tur, { signal: iptal.signal, cache: "no-store" }).catch(() => { })));
  clearTimeout(zaman);
  clearTimeout(uyari);
}

// YouTube oynatıcısıyla aynı yöntemleri sunan karma oynatıcı: o anki şarkıyı ya akış sunucusundan
// (kendi <video>/<audio> öğemiz) ya da YouTube'dan çalar. Sitenin geri kalanı farkı bilmez.
function karmaOynatici(yt) {
  // Sesi çalan asıl öğe (zaman, duraklatma, bitiş hep ondan okunur)
  const medya = new Audio();
  medya.preload = "auto";
  // Bilgisayarlarda sese senkron sessiz görüntü; telefonlarda görüntü yok (ekran kapalıyken de çalsın)
  const goruntu = TELEFON ? null : $("akisVideo");
  if (goruntu) goruntu.muted = true;
  let mod = "yt";
  let yedekZamanlayici = null;

  const sadeceSes = (acik) => $("videoKutu").classList.toggle("sadece-ses", acik);
  const moduAyarla = (akis) => {
    mod = akis ? "medya" : "yt";
    $("videoKutu").classList.toggle("akis-modu", akis);
    sadeceSes(akis && !goruntu);
  };
  const medyayiBosalt = () => {
    clearTimeout(yedekZamanlayici);
    moduAyarla(false);
    for (const oge of goruntu ? [medya, goruntu] : [medya]) {
      oge.pause();
      oge.removeAttribute("src");
      oge.load();
    }
  };
  // Görüntüyü yükler: önce 720p, açılmazsa 360p, o da olmazsa kapak resmi gösterilir (ses sürer)
  const goruntuyuYukle = (kimlik) => {
    if (!goruntu) return;
    sadeceSes(false);
    goruntu.dataset.tur = "video720";
    goruntu.onerror = () => {
      if (mod !== "medya") return;
      if (goruntu.dataset.tur === "video720") {
        goruntu.dataset.tur = "video";
        goruntu.src = akisAdresi + "/akis?v=" + kimlik + "&tur=video";
      } else {
        sadeceSes(true);
      }
    };
    goruntu.src = akisAdresi + "/akis?v=" + kimlik + "&tur=video720";
  };
  // Görüntü sese bağlı kalır: ses durunca durur, çalınca çalar; 0,3 sn'den fazla kayarsa sese atlar,
  // az kaydıysa hızını biraz değiştirerek yavaşça yetişir.
  setInterval(() => {
    if (!goruntu || mod !== "medya" || !goruntu.currentSrc || goruntu.seeking) return;
    if (medya.paused || medya.ended) {
      if (!goruntu.paused) goruntu.pause();
      if (Math.abs(goruntu.currentTime - medya.currentTime) > 0.3) goruntu.currentTime = medya.currentTime;
      return;
    }
    if (goruntu.paused && goruntu.readyState >= 2) goruntu.play().catch(() => { });
    const fark = goruntu.currentTime - medya.currentTime;
    if (Math.abs(fark) > 0.3) {
      goruntu.currentTime = medya.currentTime + 0.1;
      goruntu.playbackRate = 1;
    } else {
      goruntu.playbackRate = Math.abs(fark) < 0.05 ? 1 : fark > 0 ? 0.96 : 1.04;
    }
  }, 250);
  // Sunucudan çalınamayan şarkı YouTube'dan, odanın o anki yerinden devam eder
  const youtubeaDon = (kimlik, oynat) => {
    akistanCalmayanlar.add(kimlik);
    medyayiBosalt();
    akisSunucusunuDene();
    const secenek = { videoId: kimlik, startSeconds: simdiki ? konumHesapla(simdiki) : 0 };
    if (oynat) yt.loadVideoById(secenek);
    else yt.cueVideoById(secenek);
  };
  const yukle = (secenek, oynat) => {
    clearTimeout(yedekZamanlayici);
    const kimlik = secenek.videoId;
    if (!akisCalisiyor || akistanCalmayanlar.has(kimlik)) {
      if (mod === "medya") medyayiBosalt();
      return oynat ? yt.loadVideoById(secenek) : yt.cueVideoById(secenek);
    }
    yt.stopVideo();
    moduAyarla(true);
    medya.onerror = () => { if (mod === "medya") youtubeaDon(kimlik, oynat); };
    medya.onloadedmetadata = () => {
      const bas = simdiki ? konumHesapla(simdiki) : secenek.startSeconds || 0;
      if (bas > 0.5) medya.currentTime = bas;
    };
    medya.src = akisAdresi + "/akis?v=" + kimlik + "&tur=ses";
    goruntuyuYukle(kimlik);
    if (oynat) medya.play().catch(() => { });
    // Sunucu 20 saniyede şarkıyı veremezse YouTube'a dönülür
    yedekZamanlayici = setTimeout(() => {
      if (mod === "medya" && medya.readyState < 2) youtubeaDon(kimlik, oynat);
    }, 20000);
  };

  medya.addEventListener("ended", () => {
    if (simdiki && simdiki.videoId === yuklenenId) sonrakineGec(sarkiKimligi(simdiki));
  });

  return {
    get mod() { return mod; },
    get yt() { return yt; },
    loadVideoById: (s) => yukle(s, true),
    cueVideoById: (s) => yukle(s, false),
    playVideo: () => (mod === "medya" ? medya.play().catch(() => { }) : yt.playVideo()),
    pauseVideo: () => (mod === "medya" ? medya.pause() : yt.pauseVideo()),
    stopVideo: () => {
      if (mod === "medya") medyayiBosalt();
      yt.stopVideo();
    },
    seekTo: (sn, izin) => {
      if (mod === "medya") {
        medya.currentTime = sn;
        if (goruntu && goruntu.currentSrc) goruntu.currentTime = sn;
      } else yt.seekTo(sn, izin);
    },
    getCurrentTime: () => (mod === "medya" ? medya.currentTime : yt.getCurrentTime()),
    getDuration: () => (mod === "medya" ? (isFinite(medya.duration) ? medya.duration : 0) : yt.getDuration()),
    getPlayerState: () => {
      if (mod !== "medya") return yt.getPlayerState();
      if (medya.ended) return YT.PlayerState.ENDED;
      if (medya.paused) return medya.readyState ? YT.PlayerState.PAUSED : YT.PlayerState.CUED;
      return medya.readyState < 3 || medya.seeking ? YT.PlayerState.BUFFERING : YT.PlayerState.PLAYING;
    },
    setVolume: (ses) => {
      medya.volume = Math.max(0, Math.min(1, ses / 100));
      yt.setVolume(ses);
    }
  };
}

// Telefonun kilit ekranında ve bildirimlerde şarkı adı ve oynat/duraklat/atla tuşları
function medyaOturumunuGuncelle() {
  if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
  if (!simdiki) {
    navigator.mediaSession.metadata = null;
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: simdiki.baslik || "",
    artist: simdiki.kanal || "",
    album: (odaBilgi && odaBilgi.ad) || "Bekleniyor",
    artwork: gecerliId(simdiki.videoId)
      ? [{ src: "https://i.ytimg.com/vi/" + simdiki.videoId + "/hqdefault.jpg", sizes: "480x360", type: "image/jpeg" }] : []
  });
  navigator.mediaSession.playbackState = simdiki.duraklatildi ? "paused" : "playing";
}

function medyaTuslariniBagla() {
  if (!("mediaSession" in navigator)) return;
  const tuslar = {
    play: () => simdiki && simdiki.duraklatildi && devamEt(),
    pause: () => simdiki && !simdiki.duraklatildi && duraklat(),
    nexttrack: () => $("atlaTus").click(),
    previoustrack: () => $("geriTus").click()
  };
  for (const [olay, is] of Object.entries(tuslar)) {
    try { navigator.mediaSession.setActionHandler(olay, is); } catch (e) { }
  }
}

function onYouTubeIframeAPIReady() {
  const ayarlar = { controls: 0, disablekb: 1, rel: 0, playsinline: 1 };
  if (location.protocol.startsWith("http")) ayarlar.origin = location.origin;
  const yt = new YT.Player("ytOynatici", {
    width: "100%",
    height: "100%",
    playerVars: ayarlar,
    events: {
      onReady: () => {
        oynaticiHazir = true;
        oynatici.setVolume(Number($("sesAyari").value));
        senkronla();
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED && simdiki && simdiki.videoId === yuklenenId) {
          sonrakineGec(sarkiKimligi(simdiki));
        }
      },
      onError: () => {
        if (!simdiki || oynatici.mod === "medya") return;
        bildir("Bu video sitede çalınamıyor, sıradakine geçiliyor");
        sonrakineGec(sarkiKimligi(simdiki));
      }
    }
  });
  oynatici = karmaOynatici(yt);
}

setInterval(senkronla, 3000);

// ---------- YouTube reklamları ----------
// Gömülü oynatıcı reklam oynattığını siteye bildirmez (YouTube'un API'sinde böyle bir bilgi yok).
// Oda çalarken bu cihazdaki şarkı süresi 3 saniye boyunca hiç ilerlemiyorsa reklam (ya da uzun bir
// yüklenme) var sayılır: video perdesi tıklamaları YouTube'a geçirir ki "Reklamı atla"ya basılabilsin,
// altta da küçük bir uyarı çıkar. Süre yeniden ilerleyince her şey eski hâline döner.
// Birkaç ipucuna birden bakılır:
//  1) şarkı süresi 3 sn boyunca hiç ilerlemiyor (oynatıcı hangi durumu bildirirse bildirsin),
//  2) oynatıcının bildirdiği video yüklenen şarkı değil (reklamın kendi videosu),
//  3) oynatıcı modu boş değil (reklamsızken boş döner),
//  4) süre ilerliyor ama 4 sn'dir odanın 3 sn'den fazla gerisinde (reklamın süresi işliyor olabilir).
// 1-3'te site videoyu sarmaya çalışmaz; 4'te sarmaya devam eder (reklam bitince odaya yetişsin).
// ?tani=reklam ile bu değerler video kutusunun köşesinde canlı görünür.
let reklamVar = false;
let reklamKesin = false;
let sonOkunanSure = -1;
let durgunSure = 0;
let geridekiSure = 0;
const REKLAM_TANI = new URLSearchParams(location.search).get("tani") === "reklam";

function reklamIpuclari() {
  const yt = oynatici.yt;
  const ipucu = { durum: oynatici.getPlayerState(), sn: +(oynatici.getCurrentTime() || 0).toFixed(1),
    sure: Math.round(oynatici.getDuration() || 0), oda: +konumHesapla(simdiki).toFixed(1), vid: "", mod: null };
  try { ipucu.vid = (yt.getVideoData() || {}).video_id || ""; } catch (e) { }
  try { ipucu.mod = yt.getPlayerMode ? yt.getPlayerMode() : null; } catch (e) { }
  return ipucu;
}

setInterval(() => {
  let ipucu = null;
  let kesin = false;
  let geride = false;
  if (katildi && oynaticiHazir && oynatici.mod !== "medya" && simdiki && !simdiki.duraklatildi &&
    gecerliId(simdiki.videoId) && yuklenenId === simdiki.videoId && document.visibilityState === "visible") {
    ipucu = reklamIpuclari();
    durgunSure = ipucu.durum !== YT.PlayerState.ENDED && Math.abs(ipucu.sn - sonOkunanSure) < 0.05 ? durgunSure + 0.5 : 0;
    sonOkunanSure = ipucu.sn;
    geridekiSure = ipucu.oda - ipucu.sn > 3 ? geridekiSure + 0.5 : 0;
    const modDolu = ipucu.mod && typeof ipucu.mod === "object" && Object.keys(ipucu.mod).length > 0;
    kesin = durgunSure >= 3 || (!!ipucu.vid && ipucu.vid !== yuklenenId) || modDolu;
    geride = geridekiSure >= 4;
  } else {
    durgunSure = 0;
    geridekiSure = 0;
    sonOkunanSure = -1;
  }
  if (REKLAM_TANI) reklamTanisiniGoster(ipucu, kesin, geride);
  reklamKesin = kesin;
  const simdiReklam = kesin || geride;
  if (simdiReklam === reklamVar) return;
  reklamVar = simdiReklam;
  document.body.classList.toggle("reklam-var", reklamVar);
  if (!reklamVar) senkronla();
}, 500);

function reklamTanisiniGoster(ipucu, kesin, geride) {
  let kutu = $("reklamTanisi");
  if (!kutu) {
    kutu = el("pre", { id: "reklamTanisi", className: "reklam-tanisi" });
    $("videoKutu").append(kutu);
  }
  kutu.textContent = "reklam: " + (kesin ? "KESİN" : geride ? "geride" : "yok") + "\n" +
    (ipucu ? JSON.stringify(ipucu, null, 1) : "mod: " + (oynatici ? oynatici.mod : "-"));
}

// ---------- Arayüz ----------

const SIMGE_OYNAT = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
const SIMGE_DURAKLAT = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';

function oynatSimgesi(caliyor) {
  const yeni = caliyor ? "duraklat" : "oynat";
  for (const tus of [$("oynatTus"), $("miniOynat")]) {
    if (tus.dataset.simge === yeni) continue;
    tus.dataset.simge = yeni;
    tus.innerHTML = caliyor ? SIMGE_DURAKLAT : SIMGE_OYNAT;
    tus.title = caliyor ? "Duraklat" : "Oynat";
  }
}

function arayuzuGuncelle() {
  if (!$("oda") || $("oda").hidden) return;
  if (simdiki) {
    $("kapak").src = kapakAdresi(simdiki.videoId);
    $("sarkiAdi").textContent = simdiki.baslik || "Bilinmeyen şarkı";
    $("sarkiAlt").textContent = !gecerliId(simdiki.videoId) ? "YouTube'da aranıyor…"
      : (simdiki.kanal ? simdiki.kanal + " · " : "") + "ekleyen: " + (simdiki.ekleyen || "?");
    oynatSimgesi(!simdiki.duraklatildi);
    $("simdikiListeye").hidden = false;
  } else {
    $("kapak").src = odaId === ANA_ODA ? "1.png" : BOS_KAPAK;
    $("sarkiAdi").textContent = "Asansör müziği";
    $("sarkiAlt").textContent = "Sırada şarkı yok — ☰ ile ekle";
    oynatSimgesi(katildi && !asansorSustur);
    $("gecenSure").textContent = "0:00";
    $("toplamSure").textContent = "0:00";
    ilerlemeyiCiz(0);
    $("simdikiListeye").hidden = true;
  }
  miniyiGuncelle();
  medyaOturumunuGuncelle();
  // Telefonda sadece ses çalarken video kutusunda şarkının kapağı görünür
  $("videoKutu").style.setProperty("--kapak", simdiki && gecerliId(simdiki.videoId)
    ? 'url("https://i.ytimg.com/vi/' + simdiki.videoId + '/hqdefault.jpg")' : "none");
  $("perdeBaslik").textContent = simdiki ? simdiki.baslik || "" : "";
  $("videoPerdesi").classList.toggle("durdu", !!simdiki && !!simdiki.duraklatildi);
  $("geriTus").disabled = !simdiki;
  $("atlaTus").disabled = !simdiki;
  $("geriTus").title = oncekiListesi.length ? "Önceki şarkı (çalan şarkı 3 sn'yi geçtiyse başa sarar)" : "Başa sar";
}

function sesiAyarla(ses) {
  $("sesAyari").value = ses;
  $("sesAyari").style.setProperty("--dolu", ses + "%");
  $("sesTus").textContent = ses === 0 ? "🔇" : ses < 50 ? "🔉" : "🔊";
  asansor.volume = ses / 100;
  if (oynaticiHazir) oynatici.setVolume(ses);
  hafizayaYaz("ses", ses);
}

function ilerlemeyiCiz(oran) {
  const yuzde = Math.max(0, Math.min(1, oran)) * 100 + "%";
  $("ilerlemeDolu").style.width = yuzde;
  $("ilerlemeTopu").style.left = yuzde;
}

function sarkiSuresi() {
  return simdiki && oynaticiHazir ? oynatici.getDuration() || 0 : 0;
}

setInterval(() => {
  if (!simdiki || !oynaticiHazir || ilerlemeSurukleniyor) return;
  const sure = sarkiSuresi();
  const gecen = Math.min(konumHesapla(simdiki), sure || Infinity);
  $("gecenSure").textContent = sureYaz(gecen);
  $("toplamSure").textContent = sureYaz(sure);
  ilerlemeyiCiz(sure ? gecen / sure : 0);
}, 250);

// İlerleme çubuğu: üzerinde gezerken baloncukta süreyi gösterir, tıklayınca ya da sürükleyince oraya sarar.
function ilerlemeOlaylariniBagla() {
  const cubuk = $("ilerleme");
  const balon = $("ilerlemeBalonu");
  const oranBul = (e) => {
    const kutu = cubuk.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - kutu.left) / kutu.width));
  };
  const balonuGoster = (oran) => {
    const sure = sarkiSuresi();
    if (!sure) { balon.hidden = true; return; }
    balon.hidden = false;
    balon.textContent = sureYaz(oran * sure);
    balon.style.left = (oran * 100) + "%";
  };
  cubuk.addEventListener("pointermove", (e) => {
    const oran = oranBul(e);
    balonuGoster(oran);
    if (ilerlemeSurukleniyor) {
      ilerlemeyiCiz(oran);
      $("gecenSure").textContent = sureYaz(oran * sarkiSuresi());
    }
  });
  cubuk.addEventListener("pointerleave", () => { if (!ilerlemeSurukleniyor) balon.hidden = true; });
  cubuk.addEventListener("pointerdown", (e) => {
    if (!simdiki || !sarkiSuresi()) return;
    ilerlemeSurukleniyor = true;
    cubuk.classList.add("surukleniyor");
    cubuk.setPointerCapture(e.pointerId);
    ilerlemeyiCiz(oranBul(e));
    balonuGoster(oranBul(e));
  });
  const birak = (e) => {
    if (!ilerlemeSurukleniyor) return;
    ilerlemeSurukleniyor = false;
    cubuk.classList.remove("surukleniyor");
    if (e.type === "pointerup") konumaGit(oranBul(e) * sarkiSuresi());
    if (!cubuk.matches(":hover")) balon.hidden = true;
  };
  cubuk.addEventListener("pointerup", birak);
  cubuk.addEventListener("pointercancel", birak);
}

// dugmeler: [{ yazi, baslik, is(olay) }]; tikla verilirse satırın kendisine tıklamak onu çalar.
function sarkiSatiri(sarki, altYazi, dugmeler, tikla) {
  const caliyor = simdiki && simdiki.videoId === sarki.videoId;
  const satir = el("div", { className: "sarki-satiri" + (tikla ? " tiklanir" : "") + (caliyor ? " caliyor" : "") },
    el("div", { className: "kapak-kutu" },
      kapakResmi(sarki),
      tikla ? el("span", { className: "kapak-oynat" }, "▶") : null),
    el("div", { className: "sarki-bilgi" },
      el("div", { className: "sarki-adi", title: sarki.baslik }, sarki.baslik),
      el("div", { className: "sarki-alt" }, altYazi)),
    el("div", { className: "sarki-tuslari" }, dugmeler.map((d) => el("button", {
      type: "button", title: d.baslik, onclick: (e) => { e.stopPropagation(); d.is(e); }
    }, d.yazi)))
  );
  if (tikla) {
    satir.title = "Hemen çal";
    satir.tabIndex = 0;
    satir.addEventListener("click", tikla);
    satir.addEventListener("keydown", (e) => { if (e.key === "Enter") tikla(); });
  }
  return satir;
}

function listeDugmesi(sarki) {
  return { yazi: "☆", baslik: "Listeye ekle", is: (e) => listeyeEkleMenusu(sarki, e.currentTarget) };
}

// Sıradaki bir şarkıyı yeni yerine taşır. Sıra anahtar sırasıyla çaldığı için
// şarkılar yeni sırayla, giderek büyüyen yeni anahtarlara yazılır.
function siradaTasi(anahtar, yeniYer) {
  if (!muzikRef) return;
  const siraRef = muzikRef.child("sira");
  muzikRef.transaction((m) => {
    if (!m || !m.sira || !m.sira[anahtar]) return;
    const anahtarlar = Object.keys(m.sira).sort();
    const liste = anahtarlar.map((k) => m.sira[k]);
    const [sarki] = liste.splice(anahtarlar.indexOf(anahtar), 1);
    liste.splice(Math.min(yeniYer, liste.length), 0, sarki);
    m.sira = {};
    liste.forEach((s) => { m.sira[siraRef.push().key] = s; });
    return m;
  }).catch((e) => bildir("Taşınamadı: " + e.message));
}

// Satırın solundaki ⠿ tutamağından tutulup yukarı/aşağı sürüklenir; bırakınca yeni yeri herkese yansır.
let siraSurukleniyor = false;

function siraSuruklemesiEkle(satir, anahtar, kutu) {
  const tutamak = el("span", { className: "tutma-yeri", title: "Tutup sürükleyerek yerini değiştir" }, "⠿");
  satir.prepend(tutamak);
  tutamak.addEventListener("click", (e) => e.stopPropagation());
  tutamak.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    siraSurukleniyor = true;
    satir.classList.add("tasiniyor");
    const eskiYer = [...kutu.children].indexOf(satir);
    const panel = $("listePaneli");
    const tasi = (ev) => {
      // Fare hangi satırın ortasının üstündeyse satır onun önüne geçer
      const once = [...kutu.children].find((s) => {
        if (s === satir) return false;
        const r = s.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (once) { if (satir.nextSibling !== once) kutu.insertBefore(satir, once); }
      else if (kutu.lastElementChild !== satir) kutu.append(satir);
      // Panelin kenarına gelince liste kayar
      const p = panel.getBoundingClientRect();
      if (ev.clientY < p.top + 60) panel.scrollTop -= 12;
      else if (ev.clientY > p.bottom - 60) panel.scrollTop += 12;
    };
    // Satır DOM'da yer değiştirince fare yakalaması (pointer capture) düşer; bu yüzden pencere dinlenir
    const birak = () => {
      removeEventListener("pointermove", tasi);
      removeEventListener("pointerup", birak);
      removeEventListener("pointercancel", birak);
      siraSurukleniyor = false;
      satir.classList.remove("tasiniyor");
      const yeniYer = [...kutu.children].indexOf(satir);
      if (yeniYer !== eskiYer) siradaTasi(anahtar, yeniYer);
      else siraCiz();
    };
    addEventListener("pointermove", tasi);
    addEventListener("pointerup", birak);
    addEventListener("pointercancel", birak);
  });
}

function siraCiz() {
  const kutu = $("sira");
  if (!kutu || siraSurukleniyor) return;
  const sira = siraListesi();
  $("siraSayisi").textContent = sira.length || "";
  $("radyoTus").textContent = "📻 Benzer şarkılar: " + (radyoKapali ? "Kapalı" : "Açık");
  $("radyoTus").classList.toggle("acik-durum", !radyoKapali);
  if (!sira.length) {
    kutu.replaceChildren(el("div", { className: "not" }, radyoKapali
      ? "Sıra boş. Ara sekmesinden ya da listelerinden şarkı ekle."
      : "Sıra boş. Şarkı eklemezsen çalan şarkıya benzer şarkılar otomatik eklenir."));
    return;
  }
  kutu.replaceChildren(...sira.map((s, i) => {
    const satir = sarkiSatiri(s, (i + 1) + ". · " + (gecerliId(s.videoId) ? "" : "Spotify · ") + "ekleyen: " + (s.ekleyen || "?"), [
      listeDugmesi(s),
      { yazi: "✕", baslik: "Sıradan çıkar", is: () => muzikRef.child("sira/" + s.anahtar).remove() }
    ], () => hemenCal(s, s.anahtar));
    siraSuruklemesiEkle(satir, s.anahtar, kutu);
    return satir;
  }));
}

function gecmisCiz() {
  const kutu = $("gecmis");
  if (!kutu) return;
  if (!gecmisListesi.length) {
    kutu.replaceChildren(el("div", { className: "not" }, "Bu odada henüz şarkı çalınmadı."));
    return;
  }
  kutu.replaceChildren(
    el("div", { className: "not" }, "Son " + gecmisListesi.length + " şarkı. Buradan eklemek arama hakkı harcamaz."),
    ...gecmisListesi.map((s) => sarkiSatiri(s, tarihYaz(s.zaman) + (s.ekleyen ? " · " + s.ekleyen : ""), [
      listeDugmesi(s),
      { yazi: "+", baslik: "Sıraya ekle", is: () => sarkilariEkle([s]) }
    ], () => hemenCal(Object.assign({}, s, { ekleyen: isim })))));
}

function sonuclariGoster(liste, ust) {
  $("sonuclar").replaceChildren(
    ...(ust ? [ust] : []),
    ...liste.map((s) => sarkiSatiri(s, s.kanal || "", [
      listeDugmesi(s),
      { yazi: "+", baslik: "Sıraya ekle", is: () => sarkilariEkle([s]) }
    ], () => hemenCal(s))));
}

function sekmeSec(ad) {
  $("panelSekmeleri").querySelectorAll("button").forEach((b) => b.classList.toggle("secili", b.dataset.sekme === ad));
  $("listePaneli").querySelectorAll(".sekme-icerik").forEach((k) => { k.hidden = k.dataset.sekme !== ad; });
}

// ---------- Arama ve link çözme ----------

function youtubeIdBul(metin) {
  const m = metin.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function youtubeListeIdBul(metin) {
  const m = metin.match(/[?&]list=([\w-]{10,64})/);
  return m ? m[1] : null;
}

async function youtubeLinkiniCoz(id) {
  const adres = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id);
  const yanit = await fetch(adres);
  if (!yanit.ok) throw new Error("Video bulunamadı ya da gizli");
  const veri = await yanit.json();
  return { videoId: id, baslik: veri.title, kanal: veri.author_name };
}

// Spotify sesi dışarı vermiyor; Discord botları gibi şarkının adını alıp YouTube'da arıyoruz.
// Spotify aracısı (spotify-araci/worker.js) tanımlıysa sanatçı adı da alınır ("Rust" yerine "Black Label Society - Rust").
async function spotifyAdiniBul(link) {
  if (AYARLAR.spotifyAraci) {
    try {
      const veri = await (await fetch(AYARLAR.spotifyAraci + "?link=" + encodeURIComponent(link))).json();
      const s = veri.sarkilar && veri.sarkilar[0];
      if (s) return (s.sanatci ? s.sanatci + " - " : "") + s.baslik;
    } catch (e) { }
  }
  const yanit = await fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(link));
  if (!yanit.ok) throw new Error("Spotify linki okunamadı");
  return (await yanit.json()).title;
}

async function youtubeIstegi(yol, parametreler) {
  if (!AYARLAR.youtubeApiKey) throw new Error("YouTube API anahtarı tanımlı değil.");
  const yanit = await fetch("https://www.googleapis.com/youtube/v3/" + yol + "?" +
    new URLSearchParams(Object.assign({ key: AYARLAR.youtubeApiKey }, parametreler)));
  const veri = await yanit.json();
  if (veri.error) {
    const neden = veri.error.errors && veri.error.errors[0] && veri.error.errors[0].reason;
    if (neden === "quotaExceeded") {
      throw new Error("Bugünkü YouTube arama hakkı doldu. Yarın yenilenir; o zamana kadar link yapıştırarak, geçmişten ya da listelerinden ekleyebilirsin.");
    }
    throw new Error("YouTube isteği başarısız: " + veri.error.message);
  }
  return veri;
}

// Aynı arama 7 gün içinde tekrar yapılırsa YouTube'a hiç gidilmez (kota harcanmaz).
// Sonuçlar müzik kategorisinden gelir ve izlenme sayısına göre sıralanır; popüler şarkılar üstte çıkar.
async function youtubeAra(sorgu) {
  const anahtar = guvenliAnahtar("p:" + sorgu.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim());
  try {
    const onbellek = (await db.ref("aramaOnbellek/" + anahtar).get()).val();
    if (onbellek && sunucuZamani() - onbellek.zaman < 7 * 864e5) {
      return { sonuclar: Object.values(onbellek.sonuclar || {}), onbellekten: true };
    }
  } catch (e) { }

  const parametreler = { part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "15", q: sorgu };
  let veri = await youtubeIstegi("search", Object.assign({ videoCategoryId: "10" }, parametreler));
  if (!veri.items || !veri.items.length) veri = await youtubeIstegi("search", parametreler);
  let sonuclar = (veri.items || []).map((v) => sarkiKaydi({
    videoId: v.id.videoId,
    baslik: htmlCoz(v.snippet.title),
    kanal: htmlCoz(v.snippet.channelTitle)
  }));
  // İzlenme sayıları (15 video için 1 birim kota). Alakalılık sırası da hafifçe korunur.
  try {
    const istatistik = await youtubeIstegi("videos", { part: "statistics", id: sonuclar.map((s) => s.videoId).join(",") });
    const izlenme = {};
    for (const v of istatistik.items || []) izlenme[v.id] = Number(v.statistics.viewCount || 0);
    const puan = (s, i) => Math.log10((izlenme[s.videoId] || 0) + 10) - i * 0.12;
    sonuclar = sonuclar.map((s, i) => [s, puan(s, i)]).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  } catch (e) { }
  sonuclar = sonuclar.slice(0, 10);
  if (kullanici) {
    db.ref("aramaOnbellek/" + anahtar).set({ zaman: firebase.database.ServerValue.TIMESTAMP, sonuclar }).catch(() => { });
  }
  return { sonuclar, onbellekten: false };
}

// YouTube oynatma listesini okur (her 50 şarkı için 1 birim kota; arama 100 birim).
async function youtubeListesiCek(listeId) {
  // "RD..." listeleri YouTube'un kendi ürettiği Mix'lerdir; resmi API bunlar için alakasız şarkılar döndürür.
  // Bu yüzden Mix'ler aracı (spotify-araci/worker.js) üzerinden YouTube'un kendi verisinden okunur.
  if (/^RD/.test(listeId)) return youtubeMixCek(listeId);
  const bilgi = await youtubeIstegi("playlists", { part: "snippet", id: listeId });
  const ad = (bilgi.items && bilgi.items[0] && bilgi.items[0].snippet.title) || "YouTube listesi";
  const sarkilar = [];
  let sayfa = "";
  do {
    const veri = await youtubeIstegi("playlistItems", Object.assign({ part: "snippet", maxResults: "50", playlistId: listeId }, sayfa ? { pageToken: sayfa } : {}));
    for (const o of veri.items || []) {
      const id = o.snippet.resourceId && o.snippet.resourceId.videoId;
      if (!gecerliId(id) || o.snippet.title === "Deleted video" || o.snippet.title === "Private video") continue;
      sarkilar.push(sarkiKaydi({ videoId: id, baslik: o.snippet.title, kanal: o.snippet.videoOwnerChannelTitle || "" }));
    }
    sayfa = veri.nextPageToken || "";
  } while (sayfa && sarkilar.length < 200);
  if (!sarkilar.length) throw new Error("Listede çalınabilir şarkı bulunamadı");
  return { ad: ad.slice(0, 60), sarkilar };
}

// Yer imi düğmesinin kopyaladığı "watch_videos?video_ids=a,b,c&ad=..." linkindeki video kimlikleri
function youtubeIdListesiBul(metin) {
  const m = metin.match(/[?&]video_ids=([\w,-]+)/);
  if (!m) return null;
  const idler = [...new Set(m[1].split(",").filter(gecerliId))];
  return idler.length ? idler : null;
}

function kopyaListeAdi(metin) {
  const m = metin.match(/[?&]ad=([^&]*)/);
  try { return m ? decodeURIComponent(m[1]).slice(0, 60) : "YouTube listesi"; } catch (e) { return "YouTube listesi"; }
}

// Video kimliklerinin başlıklarını sırasını bozmadan getirir (her 50 video için 1 birim kota).
async function youtubeVideolariCek(idler, ad) {
  const sarkilar = [];
  for (let i = 0; i < idler.length && i < 500; i += 50) {
    const parca = idler.slice(i, i + 50);
    const veri = await youtubeIstegi("videos", { part: "snippet", id: parca.join(",") });
    const harita = {};
    for (const v of veri.items || []) harita[v.id] = v.snippet;
    for (const id of parca) {
      if (harita[id]) sarkilar.push(sarkiKaydi({ videoId: id, baslik: htmlCoz(harita[id].title), kanal: htmlCoz(harita[id].channelTitle) }));
    }
  }
  if (!sarkilar.length) throw new Error("Linkteki videolar bulunamadı");
  return { ad: ad || "YouTube listesi", sarkilar };
}

async function youtubeMixCek(listeId) {
  if (!AYARLAR.spotifyAraci) throw new Error("YouTube Mix listeleri için aracı tanımlı değil (config.js).");
  let veri;
  try {
    veri = await (await fetch(AYARLAR.spotifyAraci + "?mix=" + encodeURIComponent(listeId))).json();
  } catch (e) {
    throw new Error("YouTube Mix okunamadı, biraz sonra tekrar dene.");
  }
  if (veri.hata) throw new Error(veri.hata);
  const sarkilar = (veri.sarkilar || []).filter((s) => gecerliId(s.videoId))
    .map((s) => sarkiKaydi({ videoId: s.videoId, baslik: s.baslik, kanal: s.sanatci }));
  if (!sarkilar.length) throw new Error("Mix'te şarkı bulunamadı");
  return { ad: String(veri.ad || "YouTube Mix").slice(0, 60), sarkilar };
}

// Spotify liste ya da albümünü Cloudflare'deki aracı üzerinden okur (spotify-araci/worker.js).
// Şarkıların YouTube karşılığı henüz yoktur; "Sanatçı - Şarkı" araması olarak saklanır.
async function spotifyListesiCek(link) {
  if (!AYARLAR.spotifyAraci) throw new Error("Spotify aracısı tanımlı değil (config.js).");
  let veri;
  try {
    veri = await (await fetch(AYARLAR.spotifyAraci + "?link=" + encodeURIComponent(link))).json();
  } catch (e) {
    throw new Error("Spotify'a ulaşılamadı, biraz sonra tekrar dene.");
  }
  if (veri.hata) throw new Error(veri.hata);
  const sarkilar = (veri.sarkilar || []).filter((s) => s.baslik).map((s) => sarkiKaydi({
    baslik: s.baslik,
    kanal: s.sanatci,
    arama: (s.sanatci ? s.sanatci.split(",")[0].trim() + " - " : "") + s.baslik
  }));
  if (!sarkilar.length) throw new Error("Spotify listesinde şarkı bulunamadı");
  return { ad: String(veri.ad || "Spotify listesi").slice(0, 60), sarkilar };
}

async function aramaYap(metin) {
  const not = $("aramaNotu");
  not.textContent = "Aranıyor…";
  $("sonuclar").replaceChildren();
  try {
    const listeKimligi = youtubeListeIdBul(metin);
    const ytId = youtubeIdBul(metin);
    const kopyaIdleri = youtubeIdListesiBul(metin);

    if (kopyaIdleri) {
      const { ad, sarkilar } = await youtubeVideolariCek(kopyaIdleri, kopyaListeAdi(metin));
      not.textContent = "“" + ad + "” (" + sarkilar.length + " şarkı)";
      sonuclariGoster(sarkilar, el("div", { className: "arac-satiri" },
        el("button", { className: "tus-kucuk", onclick: () => sarkilariEkle(sarkilar) }, "▶ Hepsini sıraya ekle"),
        el("button", { className: "tus-kucuk", onclick: () => kullanici ? yeniListe(ad, sarkilar) : bildir("Liste için önce Google ile giriş yap") }, "☆ Listelerime kaydet")));
      return;
    }

    if (listeKimligi && (!ytId || /\/playlist\?/.test(metin))) {
      const { ad, sarkilar } = await youtubeListesiCek(listeKimligi);
      not.textContent = "YouTube listesi: “" + ad + "” (" + sarkilar.length + " şarkı)";
      sonuclariGoster(sarkilar, el("div", { className: "arac-satiri" },
        el("button", { className: "tus-kucuk", onclick: () => sarkilariEkle(sarkilar) }, "▶ Hepsini sıraya ekle"),
        el("button", { className: "tus-kucuk", onclick: () => kullanici ? yeniListe(ad, sarkilar) : bildir("Liste için önce Google ile giriş yap") }, "☆ Listelerime kaydet")));
      return;
    }

    if (ytId) {
      sarkilariEkle([await youtubeLinkiniCoz(ytId)]);
      not.textContent = "";
      $("aramaKutusu").value = "";
      return;
    }

    if (/spotify\.(com|link)\//.test(metin)) {
      if (/open\.spotify\.com\/(intl-[\w-]+\/)?(playlist|album)\//.test(metin)) {
        const { ad, sarkilar } = await spotifyListesiCek(metin);
        not.textContent = "Spotify: “" + ad + "” (" + sarkilar.length + " şarkı). Her şarkı çalınacağı zaman YouTube'da bulunur.";
        sonuclariGoster(sarkilar, el("div", { className: "arac-satiri" },
          el("button", { className: "tus-kucuk", onclick: () => sarkilariEkle(sarkilar) }, "▶ Hepsini sıraya ekle"),
          el("button", { className: "tus-kucuk", onclick: () => kullanici ? yeniListe(ad, sarkilar) : bildir("Liste için önce Google ile giriş yap") }, "☆ Listelerime kaydet")));
        return;
      }
      if (!/open\.spotify\.com\/(intl-[\w-]+\/)?track\//.test(metin)) {
        throw new Error("Bu Spotify linki açılamadı. Şarkı, liste ya da albüm linki yapıştır.");
      }
      const ad = await spotifyAdiniBul(metin);
      $("aramaKutusu").value = ad;
      const { sonuclar } = await youtubeAra(ad);
      not.textContent = "Spotify'daki “" + ad + "” için YouTube sonuçları. Doğru olanı ekle:";
      sonuclariGoster(sonuclar);
      return;
    }

    const { sonuclar, onbellekten } = await youtubeAra(metin);
    not.textContent = !sonuclar.length ? "Sonuç bulunamadı." : onbellekten ? "Kayıtlı sonuçlar (arama hakkı harcanmadı)" : "";
    sonuclariGoster(sonuclar);
  } catch (hata) {
    not.textContent = hata.message;
  }
}

// ---------- Kutlama ----------

function kutla() {
  asansorSustur = true;
  asansor.pause();
  basariSesi.currentTime = 0;
  basariSesi.play().catch(() => { });
  createFireworks();
  arayuzuGuncelle();
}

function createFireworks() {
  for (let i = 0; i < 20; i++) {
    const firework = el("div", { className: "firework", style: { top: Math.random() * 100 + "vh", left: Math.random() * 100 + "vw" } });
    $("oda").appendChild(firework);
    setTimeout(() => firework.remove(), 1000);
  }
}

// ---------- Olaylar ----------

function odaOlaylariniBagla() {
  $("katilTus").addEventListener("click", odayaKatil);
  $("isimKutusu").addEventListener("keydown", (e) => { if (e.key === "Enter") odayaKatil(); });

  $("aramaFormu").addEventListener("submit", (e) => {
    e.preventDefault();
    const metin = $("aramaKutusu").value.trim();
    if (metin) aramaYap(metin);
  });

  $("panelSekmeleri").addEventListener("click", (e) => {
    const tus = e.target.closest("button");
    if (tus) sekmeSec(tus.dataset.sekme);
  });

  // Reklam uyarısı: video görünmüyorsa (panel kapalı) paneli açar ki "Reklamı atla" görülsün
  $("reklamUyari").addEventListener("click", () => {
    if (document.body.classList.contains("mini-mod")) return;
    $("duzenPaneli").classList.contains("acik") && duzenModunuKapat();
    $("listePaneli").classList.add("acik");
  });

  $("listeTus").addEventListener("click", () => {
    $("duzenPaneli").classList.contains("acik") && duzenModunuKapat();
    $("listePaneli").classList.toggle("acik");
  });

  $("listeKapat").addEventListener("click", () => $("listePaneli").classList.remove("acik"));

  // Kişi rozetine tıklayınca odadakiler fotoğraf ve isimleriyle listelenir
  $("kisiSayisi").addEventListener("click", (e) => kisileriGoster(e.currentTarget, odadakiler, odaId));

  // Kutu büyüyüp küçüldükçe (panel, mini oynatıcı, tam ekran) küçük oynatıcının görüntüsü ona sığacak kadar ölçeklenir
  if (window.ResizeObserver) {
    new ResizeObserver(([g]) => {
      const { width, height } = g.contentRect;
      if (width && height) $("videoKutu").style.setProperty("--video-olcek", Math.min(width / 320, height / 180));
    }).observe($("videoKutu"));
  }

  // Videoya tıklamak oynat/duraklat; sağ alttaki tuş ve çift tıklama tam ekran
  // Tarayıcı gerçek tam ekrana izin vermezse video sayfanın tamamını kaplar
  const sayfayiKapla = (acik) => {
    $("videoKutu").classList.toggle("tam-ekran", acik);
    $("videoKutu").classList.toggle("sayfayi-kapla", acik);
    $("tamEkranTus").title = acik ? "Küçült" : "Tam ekran";
  };
  const tamEkran = () => {
    const kutu = $("videoKutu");
    if (document.fullscreenElement) return document.exitFullscreen();
    if (kutu.classList.contains("sayfayi-kapla")) return sayfayiKapla(false);
    (kutu.requestFullscreen ? kutu.requestFullscreen() : Promise.reject()).catch(() => sayfayiKapla(true));
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("videoKutu").classList.contains("sayfayi-kapla")) sayfayiKapla(false);
  });
  let tekTik = null;
  $("videoPerdesi").addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    // Çift tıklamada şarkı bir durup bir başlamasın diye tek tıklama biraz beklenir
    clearTimeout(tekTik);
    tekTik = setTimeout(() => $("oynatTus").click(), 220);
  });
  $("videoPerdesi").addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    clearTimeout(tekTik);
    tamEkran();
  });
  $("tamEkranTus").addEventListener("click", tamEkran);
  document.addEventListener("fullscreenchange", () => {
    const acik = document.fullscreenElement === $("videoKutu");
    $("videoKutu").classList.toggle("tam-ekran", acik);
    $("tamEkranTus").title = acik ? "Küçült" : "Tam ekran";
  });

  // "← Lobi": odaya katıldıysa sayfa yenilenmez, müzik mini oynatıcıda sürer
  $("oda").querySelector(".geri-tus").addEventListener("click", (e) => { if (lobiyeGozAt()) e.preventDefault(); });
  $("lobi").querySelector(".logo").addEventListener("click", (e) => {
    if (!document.body.classList.contains("mini-mod")) return;
    e.preventDefault();
    $("lobi").scrollTo({ top: 0, behavior: "smooth" });
  });
  $("miniGoruntu").addEventListener("click", () => odayaGeriDon());
  $("miniOynat").addEventListener("click", () => $("oynatTus").click());
  $("miniKapat").addEventListener("click", () => { location.href = "./"; });
  $("odadanCikTus").addEventListener("click", () => { location.href = "./"; });
  addEventListener("popstate", () => {
    const istenen = new URLSearchParams(location.search).get("oda");
    const mini = document.body.classList.contains("mini-mod");
    if (istenen === odaId) { if (mini) odayaGeriDon(false); }
    else if (!istenen && katildi) { if (!mini) lobiyeGozAt(false); }
    else location.reload();
  });

  $("oynatTus").addEventListener("click", () => {
    if (simdiki) {
      if (simdiki.duraklatildi) devamEt();
      else duraklat();
    } else {
      asansorSustur = !asansorSustur;
      senkronla();
      arayuzuGuncelle();
    }
  });

  $("atlaTus").addEventListener("click", () => { if (simdiki) sonrakineGec(sarkiKimligi(simdiki)); });
  $("geriTus").addEventListener("click", geriGit);

  ilerlemeOlaylariniBagla();

  let sessizOncesi = 80;
  $("sesAyari").addEventListener("input", (e) => sesiAyarla(Number(e.target.value)));
  $("sesTus").addEventListener("click", () => {
    const ses = Number($("sesAyari").value);
    if (ses > 0) { sessizOncesi = ses; sesiAyarla(0); }
    else sesiAyarla(sessizOncesi || 80);
  });
  sesiAyarla(Number($("sesAyari").value));

  $("simdikiListeye").addEventListener("click", (e) => { if (simdiki) listeyeEkleMenusu(simdiki, e.currentTarget); });

  $("siraKaristir").addEventListener("click", siraKaristir);
  $("radyoTus").addEventListener("click", () => {
    muzikRef.child("radyoKapali").set(radyoKapali ? null : true);
    radyoKimligi = null;
  });
  $("siraKaydet").addEventListener("click", () => topluListeyeKaydet(siraListesi(), (odaBilgi && odaBilgi.ad || "Oda") + " sırası"));
  $("siraTemizle").addEventListener("click", async () => {
    if (await onayla("Sırayı temizle", "Sıradaki tüm şarkılar silinecek (çalan şarkı devam eder).", "Temizle", true)) {
      muzikRef.child("sira").remove();
    }
  });

  $("gecmisKaydet").addEventListener("click", () => topluListeyeKaydet(gecmisListesi, (odaBilgi && odaBilgi.ad || "Oda") + " geçmişi"));
  $("gecmisIndir").addEventListener("click", () => {
    if (!gecmisListesi.length) return bildir("Geçmiş boş");
    dosyaIndir(slugYap((odaBilgi && odaBilgi.ad) || "oda") + "-gecmis.json", {
      tur: "bekleniyor-liste",
      surum: 1,
      ad: ((odaBilgi && odaBilgi.ad) || "Oda") + " geçmişi",
      sarkilar: gecmisListesi.map((s) => Object.assign(sarkiKaydi(s), { zaman: s.zaman, ekleyen: s.ekleyen || "" }))
    });
  });

  $("endButton").addEventListener("click", () => {
    if (simdiki && !simdiki.duraklatildi) duraklat();
    muzikRef.child("kutlama").set(firebase.database.ServerValue.TIMESTAMP);
  });

  $("davetTus").addEventListener("click", async () => {
    const link = location.origin + location.pathname + "?oda=" + odaId;
    try {
      await navigator.clipboard.writeText(link);
      bildir("Davet linki kopyalandı, arkadaşına yapıştır 🔗");
    } catch (e) {
      metinSor("Davet linki", "Bu linki kopyalayıp arkadaşına gönder:", link, 300);
    }
  });

  $("odaYonetimTus").addEventListener("click", yonetimiAc);
}
