// Ortak altyapı: Firebase bağlantısı, Google girişi, küçük yardımcılar ve pencereler.

const AYARLAR = window.AYARLAR || {};
const $ = (id) => document.getElementById(id);
const YONETICI_EPOSTA = (AYARLAR.yoneticiEposta || "").toLowerCase();
const ANA_ODA = "ana";
const ODA_HAKKI = 2;

let db = null;
let auth = null;
let sunucuFarki = 0;          // yerel saat ile Firebase saati arasındaki fark (ms)
let kullanici = null;         // Google ile giriş yapmış kullanıcı (yoksa null)
let yonetici = false;
let yasakli = false;
const oturumDinleyicileri = [];

// ---------- Yardımcılar ----------

function sunucuZamani() {
  return Date.now() + sunucuFarki;
}

function gecerliId(id) {
  return typeof id === "string" && /^[\w-]{11}$/.test(id);
}

function gecerliOdaId(id) {
  return typeof id === "string" && /^[a-z0-9-]{3,40}$/.test(id);
}

const BOS_KAPAK = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2e2e2e"/>' +
  '<text x="32" y="42" font-size="28" text-anchor="middle" fill="#888">♪</text></svg>');

function kapakAdresi(id) {
  return gecerliId(id) ? "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg" : BOS_KAPAK;
}

function sureYaz(saniye) {
  if (!isFinite(saniye) || saniye < 0) saniye = 0;
  return Math.floor(saniye / 60) + ":" + String(Math.floor(saniye % 60)).padStart(2, "0");
}

function tarihYaz(ms) {
  if (!ms) return "";
  const t = new Date(ms);
  const bugun = new Date();
  const saat = t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (t.toDateString() === bugun.toDateString()) return "bugün " + saat;
  return t.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) + " " + saat;
}

function htmlCoz(metin) {
  return new DOMParser().parseFromString(metin, "text/html").documentElement.textContent;
}

function rastgeleKimlik(uzunluk) {
  const harfler = "abcdefghijkmnpqrstuvwxyz23456789";
  let sonuc = "";
  const sayilar = crypto.getRandomValues(new Uint32Array(uzunluk));
  for (const s of sayilar) sonuc += harfler[s % harfler.length];
  return sonuc;
}

function slugYap(metin) {
  const harita = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };
  return metin.toLocaleLowerCase("tr")
    .replace(/[çğıİöşü]/g, (h) => harita[h] || h)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "oda";
}

// Firebase anahtarlarında . # $ [ ] / kullanılamaz.
function guvenliAnahtar(metin) {
  return metin.replace(/[.#$[\]/]/g, "_").slice(0, 100);
}

// Şarkı kaydı. Spotify'dan gelen şarkıların henüz YouTube karşılığı yoktur; onlarda videoId yerine
// "arama" (Sanatçı - Şarkı) bulunur ve şarkı ilk çalınacağı zaman YouTube'da aranır.
function sarkiKaydi(s) {
  const kayit = {
    baslik: String(s.baslik || "Bilinmeyen şarkı").slice(0, 200),
    kanal: String(s.kanal || "").slice(0, 100)
  };
  if (gecerliId(s.videoId)) kayit.videoId = s.videoId;
  else kayit.arama = String(s.arama || ((s.kanal ? s.kanal + " - " : "") + kayit.baslik)).slice(0, 200);
  return kayit;
}

// Aynı şarkıyı tanımak için: YouTube kimliği, yoksa arama metni.
function sarkiKimligi(s) {
  return s ? (gecerliId(s.videoId) ? s.videoId : "?" + (s.arama || "")) : "";
}

function hafizadanOku(anahtar) {
  try { return localStorage.getItem(anahtar); } catch (e) { return null; }
}

function hafizayaYaz(anahtar, deger) {
  try { localStorage.setItem(anahtar, deger); } catch (e) { }
}

// Küçük DOM kurucu: el("div", { className: "x", onclick: fn }, "metin", altEleman)
function el(etiket, ozellikler, ...cocuklar) {
  const e = document.createElement(etiket);
  for (const [ad, deger] of Object.entries(ozellikler || {})) {
    if (deger === undefined || deger === null || deger === false) continue;
    if (ad.startsWith("on")) e.addEventListener(ad.slice(2), deger);
    else if (ad === "style" && typeof deger === "object") Object.assign(e.style, deger);
    else if (ad in e && ad !== "list") e[ad] = deger;
    else e.setAttribute(ad, deger === true ? "" : deger);
  }
  for (const c of cocuklar.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : String(c));
  }
  return e;
}

function dosyaIndir(dosyaAdi, veri) {
  const blob = new Blob([JSON.stringify(veri, null, 2)], { type: "application/json" });
  const adres = URL.createObjectURL(blob);
  el("a", { href: adres, download: dosyaAdi }).click();
  setTimeout(() => URL.revokeObjectURL(adres), 1000);
}

function dosyaSec(kabul) {
  return new Promise((coz) => {
    const girdi = el("input", { type: "file", accept: kabul });
    girdi.addEventListener("change", () => coz(girdi.files[0] || null));
    girdi.click();
  });
}

let bildirimZamanlayici;
function bildir(metin) {
  const kutu = $("bildirim");
  kutu.textContent = metin;
  kutu.classList.add("gorunur");
  clearTimeout(bildirimZamanlayici);
  bildirimZamanlayici = setTimeout(() => kutu.classList.remove("gorunur"), 3200);
}

// ---------- Pencereler ----------

function pencereAc(baslik, icerik, dugmeler) {
  const kart = $("pencereKart");
  kart.replaceChildren(
    el("h2", {}, baslik),
    ...(Array.isArray(icerik) ? icerik : [icerik]),
    el("div", { className: "pencere-tuslari" }, dugmeler.map((d) =>
      el("button", { className: d.ana ? "tus-ana" : d.tehlike ? "tus-tehlike" : "tus-cerceve", onclick: d.is }, d.yazi)))
  );
  $("pencere").hidden = false;
  const ilkGirdi = kart.querySelector("input");
  if (ilkGirdi) setTimeout(() => ilkGirdi.focus(), 30);
}

function pencereKapat() {
  $("pencere").hidden = true;
}

function onayla(baslik, mesaj, evetYazisi = "Evet", tehlikeli = false) {
  return new Promise((coz) => {
    pencereAc(baslik, el("p", {}, mesaj), [
      { yazi: "Vazgeç", is: () => { pencereKapat(); coz(false); } },
      { yazi: evetYazisi, ana: !tehlikeli, tehlike: tehlikeli, is: () => { pencereKapat(); coz(true); } }
    ]);
  });
}

function metinSor(baslik, aciklama, varsayilan = "", enFazla = 60) {
  return new Promise((coz) => {
    const girdi = el("input", { className: "metin-kutusu", value: varsayilan, maxLength: enFazla });
    const bitir = (deger) => { pencereKapat(); coz(deger); };
    girdi.addEventListener("keydown", (e) => { if (e.key === "Enter") bitir(girdi.value.trim() || null); });
    pencereAc(baslik, [aciklama ? el("p", {}, aciklama) : null, girdi].filter(Boolean), [
      { yazi: "Vazgeç", is: () => bitir(null) },
      { yazi: "Tamam", ana: true, is: () => bitir(girdi.value.trim() || null) }
    ]);
  });
}

$("pencere").addEventListener("mousedown", (e) => { if (e.target === $("pencere")) pencereKapat(); });

// Bir düğmenin yanında açılan küçük menü
function menuAc(hedef, ogeler) {
  const menu = $("acilirMenu");
  menu.replaceChildren(...ogeler.map((o) => o.baslik
    ? el("div", { className: "menu-baslik" }, o.baslik)
    : el("button", { onclick: () => { menuKapat(); o.is(); } }, o.yazi)));
  menu.hidden = false;
  const kutu = hedef.getBoundingClientRect();
  const genislik = menu.offsetWidth;
  const yukseklik = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(kutu.right - genislik, innerWidth - genislik - 8)) + "px";
  menu.style.top = (kutu.bottom + yukseklik + 8 < innerHeight ? kutu.bottom + 4 : kutu.top - yukseklik - 4) + "px";
}

function menuKapat() {
  $("acilirMenu").hidden = true;
}

document.addEventListener("mousedown", (e) => {
  if (!$("acilirMenu").hidden && !$("acilirMenu").contains(e.target)) menuKapat();
});

// ---------- Firebase ve oturum ----------

function firebaseBaslat() {
  const fb = AYARLAR.firebase || {};
  if (!fb.apiKey || !fb.databaseURL) return "config.js doldurulmamış.";
  if (typeof firebase === "undefined") return "Firebase yüklenemedi, internet bağlantını kontrol et.";
  try {
    firebase.initializeApp(fb);
    db = firebase.database();
    auth = firebase.auth();
    db.ref(".info/serverTimeOffset").on("value", (s) => { sunucuFarki = s.val() || 0; });
    auth.onAuthStateChanged(oturumDegisti);
    return null;
  } catch (e) {
    return "Firebase ayarlarında sorun var: " + e.message;
  }
}

async function oturumDegisti(k) {
  kullanici = k;
  yonetici = false;
  yasakli = false;
  if (k) {
    const eposta = (k.email || "").toLowerCase();
    yonetici = !!YONETICI_EPOSTA && eposta === YONETICI_EPOSTA;
    try {
      const [yonetimKaydi, yasakKaydi] = await Promise.all([
        db.ref("yoneticiler/" + k.uid).get(),
        db.ref("yasakli/" + k.uid).get()
      ]);
      if (yonetimKaydi.val() === true) yonetici = true;
      yasakli = yasakKaydi.val() === true;
    } catch (e) { }
    db.ref("kullanicilar/" + k.uid).update({
      ad: (k.displayName || "İsimsiz").slice(0, 60),
      foto: (k.photoURL || "").slice(0, 500),
      eposta: (k.email || "").slice(0, 100),
      sonGiris: firebase.database.ServerValue.TIMESTAMP
    }).catch(() => { });
  }
  oturumRozetleriniCiz();
  oturumDinleyicileri.forEach((fn) => fn(kullanici));
}

function oturumDegisince(fn) {
  oturumDinleyicileri.push(fn);
}

async function googleIleGiris() {
  if (!auth) return bildir("Giriş şu an kullanılamıyor.");
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      bildir("Giriş yapılamadı: " + (e.message || e.code));
    }
  }
}

function kisaAd() {
  if (!kullanici) return null;
  return (kullanici.displayName || "").split(" ")[0].slice(0, 20) || null;
}

const GOOGLE_SIMGESI = '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function googleTusu(yazi = "Google ile giriş") {
  const tus = el("button", { className: "google-tus", onclick: googleIleGiris });
  tus.innerHTML = GOOGLE_SIMGESI;
  tus.append(yazi);
  return tus;
}

function oturumRozetleriniCiz() {
  document.querySelectorAll(".oturum-kutusu").forEach((kutu) => {
    if (!auth) { kutu.replaceChildren(); return; }
    if (!kullanici) { kutu.replaceChildren(googleTusu()); return; }
    const cip = el("button", { className: "kullanici-cipi", title: kullanici.email || "" },
      el("img", { src: kullanici.photoURL || BOS_KAPAK, alt: "", referrerPolicy: "no-referrer" }),
      el("span", { className: "cip-adi" }, kisaAd() || "Hesabım"));
    cip.addEventListener("click", () => menuAc(cip, [
      { baslik: kullanici.email || "" },
      ...(yonetici ? [{ yazi: "🛡️ Yönetim paneli", is: yonetimiAc }] : []),
      { yazi: "Çıkış yap", is: () => auth.signOut() }
    ]));
    kutu.replaceChildren(cip);
  });
}
