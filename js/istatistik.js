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
  saniye = Math.max(0, Math.floor(saniye || 0));
  if (saniye < 60) return saniye + " sn";
  const dakika = Math.floor(saniye / 60);
  if (dakika < 60) return dakika + " dk";
  const saat = Math.floor(dakika / 60);
  return saat + " sa " + (dakika % 60) + " dk";
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
    const dinliyor = muzikDinleniyor();
    // Sekme görünürken ya da arka planda müzik çalarken sitede sayılır
    if (document.visibilityState === "visible" || dinliyor) birikenSitede++;
    if (dinliyor) birikenDinleme++;
  }, 1000);

  setInterval(istatistikGonder, 60000);
  addEventListener("pagehide", istatistikGonder);
}

function istatistikGonder() {
  if (!kullanici || !istatistikRef || (!birikenSitede && !birikenDinleme)) return;
  const eski = benimIstatistigim || {};
  const sitede = birikenSitede;
  const dinleme = birikenDinleme;
  birikenSitede = 0;
  birikenDinleme = 0;
  istatistikRef.set({
    ad: (kullanici.displayName || "İsimsiz").slice(0, 60),
    foto: (kullanici.photoURL || "").slice(0, 500),
    sitede: (eski.sitede || 0) + sitede,
    dinleme: (eski.dinleme || 0) + dinleme,
    guncelleme: firebase.database.ServerValue.TIMESTAMP
  }).catch(() => { });
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
}

function siralamayiCiz() {
  const kutu = $("siralama");
  if (!kutu) return;
  $("siralamaSecim").querySelectorAll("button").forEach((b) => b.classList.toggle("secili", b.dataset.tur === siralamaTuru));
  const kayitlar = Object.entries(siralamaVerisi)
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
    el("img", { className: "avatar", src: v.foto || BOS_KAPAK, alt: "", referrerPolicy: "no-referrer" }),
    el("div", { className: "siralama-bilgi" },
      el("div", { className: "siralama-ad" }, (v.ad || "İsimsiz").split(" ")[0]),
      el("div", { className: "siralama-cubuk" }, el("div", { style: { width: Math.max(4, (v[siralamaTuru] || 0) / enYuksek * 100) + "%" } }))),
    el("div", { className: "siralama-sure" }, sureMetni(v[siralamaTuru])));
  const satirlar = gosterilen.map(satir);
  // İlk 10'da değilsen kendi sıran en altta ayrıca gösterilir
  if (benimSiram >= 10) satirlar.push(satir(kayitlar[benimSiram], benimSiram));
  kutu.replaceChildren(...satirlar);
}
