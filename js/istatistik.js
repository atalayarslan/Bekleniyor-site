// Kullanıcı süreleri ve lobideki sıralama tablosu.
// Giriş yapmış her kullanıcı için iki süre tutulur: sitede geçirilen süre ve müzik dinleme süresi.
// Süreler tarayıcıda saniye saniye birikir, dakikada bir veritabanına eklenir. Veritabanı kuralları,
// son kayıttan bu yana geçen gerçek süreden fazlasının eklenmesine izin vermez (hile yapılamaz).

let istatistikRef = null;
let benimIstatistigim = null;
let birikenSitede = 0;
let birikenDinleme = 0;
let siralamaVerisi = {};
let siralamaTuru = "sitede";

function sureMetni(saniye) {
  // Örnek: "1 g 2 sa 10 sn" — sıfır olan birimler yazılmaz
  saniye = Math.max(0, Math.floor(saniye || 0));
  const parcalar = [
    [Math.floor(saniye / 86400), "g"],
    [Math.floor((saniye % 86400) / 3600), "sa"],
    [Math.floor((saniye % 3600) / 60), "dk"],
    [saniye % 60, "sn"]
  ].filter(([deger]) => deger > 0).map(([deger, birim]) => deger + " " + birim);
  return parcalar.length ? parcalar.join(" ") : "0 sn";
}

// Şu an müzik dinleniyor mu: odaya katılmış, şarkı gerçekten çalıyor ve ses kapalı değil.
function muzikDinleniyor() {
  return typeof katildi !== "undefined" && katildi && simdiki && oynaticiHazir && window.YT &&
    oynatici.getPlayerState() === YT.PlayerState.PLAYING && Number($("sesAyari").value) > 0;
}

function istatistikBaslat() {
  if (!db) return;
  oturumDegisince(() => {
    istatistikGonder();
    if (istatistikRef) istatistikRef.off();
    istatistikRef = null;
    benimIstatistigim = null;
    if (kullanici) {
      istatistikRef = db.ref("istatistik/" + kullanici.uid);
      istatistikRef.on("value", (s) => { benimIstatistigim = s.val(); });
    }
  });

  setInterval(() => {
    if (!kullanici) return;
    const durum = suankiDurum();
    if (durum.sitede) birikenSitede++;
    if (durum.dinleme) birikenDinleme++;
    // Saymaya başlayınca ya da durunca (değişiklik 3 sn sürerse; şarkı bir anlık yüklenirken değil)
    // hemen kaydedilir; başkalarının ekranındaki canlı sayaç doğru kalsın
    const farkli = sonDurum && (durum.sitede !== sonDurum.sitede || durum.dinleme !== sonDurum.dinleme);
    durumFarkiSuresi = farkli ? durumFarkiSuresi + 1 : 0;
    if (durumFarkiSuresi >= 3) {
      durumFarkiSuresi = 0;
      istatistikGonder();
    }
  }, 1000);

  setInterval(istatistikGonder, 60000);
  addEventListener("pagehide", () => istatistikGonder(true));
}

// Sekme görünürken ya da arka planda müzik çalarken sitede sayılır; müzik çalarken dinlemede
function suankiDurum() {
  const dinliyor = muzikDinleniyor();
  return { sitede: document.visibilityState === "visible" || dinliyor, dinleme: dinliyor };
}

let sonDurum = null;          // en son kaydedilen "sayıyor mu" durumu
let durumFarkiSuresi = 0;

// kapaniyor: sayfa kapanıyor, artık saymıyorum diye yazılır
function istatistikGonder(kapaniyor) {
  if (!kullanici || !istatistikRef) return;
  const durum = kapaniyor === true ? { sitede: false, dinleme: false } : suankiDurum();
  const degisti = !sonDurum || durum.sitede !== sonDurum.sitede || durum.dinleme !== sonDurum.dinleme;
  if (!birikenSitede && !birikenDinleme && !degisti) return;
  const eski = benimIstatistigim || {};
  const sitede = birikenSitede;
  const dinleme = birikenDinleme;
  birikenSitede = 0;
  birikenDinleme = 0;
  sonDurum = durum;
  // Herkese açık tabloda sadece ilk ad ve Google profil fotoğrafı tutulur (soyad ve e-posta değil).
  // sitedeAktif / dinlemeAktif: şu an sayılıyor mu; başkaları bunu görüp süreyi kendi ekranında canlı artırır.
  istatistikRef.set({
    ad: kisaAd() || "İsimsiz",
    foto: guvenliFoto(kullanici.photoURL),
    sitede: (eski.sitede || 0) + sitede,
    dinleme: (eski.dinleme || 0) + dinleme,
    sitedeAktif: durum.sitede,
    dinlemeAktif: durum.dinleme,
    guncelleme: firebase.database.ServerValue.TIMESTAMP
  }).catch(() => { });
}

// Başka birinin süresi: son kaydından bu yana sayıyorsa geçen saniyeler eklenir (en fazla 70 sn;
// 75 sn'dir kaydı gelmeyen kişinin sekmesi kapanmış sayılır ve artmaz)
function canliSure(v, tur) {
  const temel = v[tur] || 0;
  if (!v[tur + "Aktif"] || !v.guncelleme) return temel;
  const gecen = (sunucuZamani() - v.guncelleme) / 1000;
  return gecen > 0 && gecen < 75 ? temel + Math.floor(Math.min(gecen, 70)) : temel;
}

// ---------- Lobideki sıralama ----------

function siralamayiBaslat() {
  if (!db) return;
  db.ref("istatistik").on("value", (s) => { siralamaVerisi = s.val() || {}; siralamayiCiz(); });
  $("siralamaSecim").addEventListener("click", (e) => {
    const tus = e.target.closest("button");
    if (!tus) return;
    siralamaTuru = tus.dataset.tur;
    siralamayiCiz();
  });
  oturumDegisince(siralamayiCiz);
  // Herkesin süresi her saniye canlı artsın (sadece lobi görünürken çizilir)
  setInterval(() => { if (!$("lobi").hidden) siralamayiCiz(); }, 1000);
}

function siralamayiCiz() {
  const kutu = $("siralama");
  if (!kutu) return;
  $("siralamaSecim").querySelectorAll("button").forEach((b) => b.classList.toggle("secili", b.dataset.tur === siralamaTuru));
  const veri = {};
  // Başkaları: kayıtlı süre + (sayıyorlarsa) son kayıttan bu yana geçen saniyeler
  for (const [uid, v] of Object.entries(siralamaVerisi)) {
    veri[uid] = Object.assign({}, v, { sitede: canliSure(v, "sitede"), dinleme: canliSure(v, "dinleme") });
  }
  // Kendi satırın: kayıtlı süre + henüz kaydedilmemiş saniyeler (en doğrusu)
  if (kullanici) {
    const kayitli = siralamaVerisi[kullanici.uid] || {};
    veri[kullanici.uid] = Object.assign({ ad: kisaAd() || "Sen", foto: guvenliFoto(kullanici.photoURL) }, kayitli, {
      sitede: (kayitli.sitede || 0) + birikenSitede,
      dinleme: (kayitli.dinleme || 0) + birikenDinleme
    });
  }
  const kayitlar = Object.entries(veri)
    .map(([uid, v]) => Object.assign({ uid }, v))
    .filter((v) => (v[siralamaTuru] || 0) > 0)
    .sort((a, b) => (b[siralamaTuru] || 0) - (a[siralamaTuru] || 0));
  if (!kayitlar.length) {
    kutu.replaceChildren(el("div", { className: "bos-kutu" }, "Henüz kimse süre kazanmadı. Google ile giriş yapıp odada müzik dinledikçe burada görünürsün."));
    return;
  }
  const enYuksek = kayitlar[0][siralamaTuru] || 1;
  const madalya = ["🥇", "🥈", "🥉"];
  const benimSiram = kullanici ? kayitlar.findIndex((v) => v.uid === kullanici.uid) : -1;
  const gosterilen = kayitlar.slice(0, 10);
  const satir = (v, i) => el("div", { className: "siralama-satiri" + (kullanici && v.uid === kullanici.uid ? " ben" : "") },
    el("div", { className: "sira-no" }, madalya[i] || String(i + 1)),
    avatarOgesi({ ad: v.ad, foto: v.foto }),
    el("div", { className: "siralama-bilgi" },
      el("div", { className: "siralama-ad" }, (v.ad || "İsimsiz").split(" ")[0]),
      el("div", { className: "siralama-cubuk" }, el("div", { style: { width: Math.max(4, (v[siralamaTuru] || 0) / enYuksek * 100) + "%" } }))),
    el("div", { className: "siralama-sure" }, sureMetni(v[siralamaTuru])));
  const satirlar = gosterilen.map(satir);
  // İlk 10'da değilsen kendi sıran en altta ayrıca gösterilir
  if (benimSiram >= 10) satirlar.push(satir(kayitlar[benimSiram], benimSiram));
  kutu.replaceChildren(...satirlar);
}
