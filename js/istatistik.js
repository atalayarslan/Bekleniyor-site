// Kullanıcı süreleri ve lobideki sıralama tablosu.
// Giriş yapmış her kullanıcı için iki süre tutulur: sitede geçirilen süre ve müzik dinleme süresi.
// Süreler tarayıcıda saniye saniye birikir, dakikada bir veritabanına eklenir. Veritabanı kuralları,
// son kayıttan bu yana geçen gerçek süreden fazlasının eklenmesine izin vermez (hile yapılamaz).

let istatistikRef = null;
let benimIstatistigim = null;
let birikenSitede = 0;
let birikenDinleme = 0;
let siralamaVerisi = {};
// Sıralama "Dinleme" ile açılır: sitenin işi birlikte dinlemek (sekmeyi açık bırakmayı ödüllendiren "Sitede" sonda)
let siralamaTuru = "dinleme";

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

  // Arka plandaki sekmede tarayıcı sayacı yavaşlatır (dakikada bire kadar): süre saniye saymakla değil, geçen gerçek
  // zamanla eklenir (bilgisayar uykudan dönünce uyuduğu süre sayılmasın diye bir seferde en fazla 2 dk).
  let sonTik = Date.now();
  setInterval(() => {
    const simdi = Date.now();
    const gecen = Math.min(120, Math.max(0, Math.round((simdi - sonTik) / 1000)));
    sonTik = simdi;
    if (!kullanici || !sayanSekmeyim()) return;
    const durum = suankiDurum();
    if (durum.sitede) birikenSitede += gecen;
    if (durum.dinleme) birikenDinleme += gecen;
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

// Site açık olduğu sürece (sekme arkada ya da pencere küçültülmüş olsa da) sitede sayılır; şarkı çaldıkça dinlemede
// sayılır (sekme arkada olsa da), sadece ses tamamen kapalıysa durur
function suankiDurum() {
  return { sitede: true, dinleme: muzikDinleniyor() };
}

// Aynı tarayıcıda birden çok sekme açıksa süre iki kat sayılmasın: sadece bir sekme sayar. Sayan sekme her saniye
// tarayıcı hafızasına "buradayım" yazar; 5 sn yazmazsa (kapandıysa) başka sekme devralır.
const SEKME_KIMLIGI = Math.random().toString(36).slice(2);
function sayanSekmeyim() {
  try {
    const simdi = Date.now();
    const kayit = JSON.parse(localStorage.getItem("istatistikSekme") || "null");
    if (kayit && kayit.id !== SEKME_KIMLIGI && simdi - kayit.zaman < 5000) return false;
    localStorage.setItem("istatistikSekme", JSON.stringify({ id: SEKME_KIMLIGI, zaman: simdi }));
    return true;
  } catch (e) {
    return true;
  }
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
  // Herkesin süresi her saniye canlı artsın (sadece lobi görünürken çizilir). Oyun sekmesi saniyede bir
  // çizilmez: süresi yok, üstelik "Tekrar dene" düğmesi tıklanırken yerine yenisi konup tıklama kaybolurdu.
  setInterval(() => { if (!$("lobi").hidden && siralamaTuru !== "oyun") siralamayiCiz(); }, 1000);
}

// Oyun galibiyetleri (okey + bilardo) oyun sunucusunda tutulur (okey-sunucu/src/galibiyet.js); dakikada bir okunur.
// Sunucuya ulaşılamazsa (ya da 10 sn'de cevap gelmezse) "alınamadı" yazar ve tekrar denenebilir; daha önce
// alınmış bir liste varsa o gösterilmeye devam eder.
let galibiyetler = null, galibiyetZamani = 0, galibiyetIstegi = null, galibiyetHatasi = false;
let oyunSiralamaSecimi = "okey";   // Oyunlar sekmesinde hangi oyunun sıralaması görünür
function oyunSunucusu() {
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return "http://127.0.0.1:8787";
  return String(AYARLAR.okeySunucu || "").replace(/\/+$/, "");
}
function galibiyetleriGetir() {
  if (galibiyetIstegi || Date.now() - galibiyetZamani < 60000) return;
  galibiyetIstegi = (async () => {
    const iptal = new AbortController();
    const zaman = setTimeout(() => iptal.abort(), 10000);
    try {
      const kart = await kimlikKarti();
      const yanit = await fetch(oyunSunucusu() + "/galibiyetler", Object.assign({ signal: iptal.signal },
        kart ? { headers: { "Authorization": "Bearer " + kart } } : {}));
      if (!yanit.ok) throw new Error("HTTP " + yanit.status);
      galibiyetler = (await yanit.json()).liste || [];
      galibiyetHatasi = false;
    } catch (e) {
      galibiyetHatasi = true;
    }
    clearTimeout(zaman);
    galibiyetZamani = Date.now();
    galibiyetIstegi = null;
    siralamayiCiz();
  })();
}

function galibiyetleriYenidenDene() {
  galibiyetHatasi = false;
  galibiyetZamani = 0;
  siralamayiCiz();
}

function oyunSiralamasiniCiz(kutu) {
  galibiyetleriGetir();
  if (!galibiyetler && galibiyetHatasi) {
    kutu.replaceChildren(el("div", { className: "bos-kutu" },
      el("p", {}, "Oyun galibiyetleri şu an alınamadı. Oyun sunucusuna ulaşılamıyor olabilir."),
      el("button", { type: "button", className: "tus-cerceve", onclick: galibiyetleriYenidenDene }, "Tekrar dene")));
    return;
  }
  if (!galibiyetler) { kutu.replaceChildren(el("div", { className: "bos-kutu" }, "Galibiyetler yükleniyor…")); return; }
  // Okey ve bilardo ayrı sıralanır; üstte iki küçük seçim düğmesi
  const secim = el("div", { className: "oyun-secim", role: "group", "aria-label": "Oyun seç" },
    ...[["okey", "🀄 Okey"], ["bilardo", "🎱 Bilardo"]].map(([oyun, yazi]) => el("button", {
      type: "button", className: oyun === oyunSiralamaSecimi ? "secili" : "", "aria-pressed": String(oyun === oyunSiralamaSecimi),
      onclick: () => { oyunSiralamaSecimi = oyun; siralamayiCiz(); }
    }, yazi)));
  const oyun = oyunSiralamaSecimi;
  const liste = galibiyetler.filter((v) => (v[oyun] || 0) > 0).sort((a, b) => b[oyun] - a[oyun]);
  if (!liste.length) {
    kutu.replaceChildren(secim, el("div", { className: "bos-kutu" }, oyun === "okey"
      ? "Henüz kimse okey oyunu kazanmadı. Okeyde, masada seçilen el sayısı bitince en düşük puanlı kazanır."
      : "Henüz kimse bilardo kazanmadı. Bir odada masaya otur, ilk sen kazan."));
    return;
  }
  const madalya = ["🥇", "🥈", "🥉"];
  const enYuksek = liste[0][oyun] || 1;
  kutu.replaceChildren(secim, ...liste.slice(0, 10).map((v, i) => el("div", { className: "siralama-satiri" },
    el("div", { className: "sira-no" }, madalya[i] || String(i + 1)),
    avatarOgesi({ ad: v.ad, foto: v.foto }),
    el("div", { className: "siralama-bilgi" },
      el("div", { className: "siralama-ad" }, (v.ad || "İsimsiz").split(" ")[0]),
      el("div", { className: "siralama-cubuk" }, el("div", { style: { width: Math.max(4, v[oyun] / enYuksek * 100) + "%" } }))),
    el("div", { className: "siralama-sure", title: (oyun === "okey" ? "Okey" : "Bilardo") + ": " + v[oyun] + " galibiyet" }, v[oyun] + " 🏆"))));
}

function siralamayiCiz() {
  const kutu = $("siralama");
  if (!kutu) return;
  $("siralamaSecim").querySelectorAll("button").forEach((b) => {
    b.classList.toggle("secili", b.dataset.tur === siralamaTuru);
    b.setAttribute("aria-pressed", String(b.dataset.tur === siralamaTuru));   // seçili sekme ekran okuyucuya da söylenir
  });
  if (siralamaTuru === "oyun") { oyunSiralamasiniCiz(kutu); return; }
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
    // Lobiyi herkes giriş yapmış görür; "giriş yap" demeye gerek yok
    kutu.replaceChildren(el("div", { className: "bos-kutu" }, siralamaTuru === "dinleme"
      ? "Henüz kimse müzik dinlemedi. Bir odaya girip dinledikçe burada görünürsün."
      : "Henüz kimse süre biriktirmedi. Sitede vakit geçirdikçe burada görünürsün."));
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
