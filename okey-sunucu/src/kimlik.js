// Firebase kimlik kartı (ID token) doğrulama. Tarayıcı giriş yaptıysa Firebase'den aldığı kartı gönderir;
// burada Google'ın açık anahtarlarıyla imzası, süresi, proje ve yayıncı kontrol edilir. Doğruysa kullanıcının
// uid'i, adı, fotoğrafı ve e-postası güvenilir kabul edilir. (Firebase'in "üçüncü taraf JWT doğrulama" kuralları.)

const PROJE = "bekleniyor-e16eb";
const ANAHTAR_ADRESI = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let anahtarlar = null;        // { kid: CryptoKey }
let anahtarBitis = 0;

async function anahtarlariAl() {
  if (anahtarlar && Date.now() < anahtarBitis) return anahtarlar;
  const yanit = await fetch(ANAHTAR_ADRESI);
  const { keys } = await yanit.json();
  const yeni = {};
  for (const jwk of keys) {
    yeni[jwk.kid] = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  }
  const yas = /max-age=(\d+)/.exec(yanit.headers.get("cache-control") || "");
  anahtarlar = yeni;
  anahtarBitis = Date.now() + (yas ? Number(yas[1]) * 1000 : 3600 * 1000);
  return anahtarlar;
}

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

// Doğruysa { uid, ad, foto, eposta, epostaDogrulandi } döner, değilse null
export async function kartiDogrula(kart) {
  try {
    const [b, g, i] = String(kart).split(".");
    if (!b || !g || !i) return null;
    const baslik = json(b);
    const icerik = json(g);
    if (baslik.alg !== "RS256") return null;
    const simdi = Math.floor(Date.now() / 1000);
    if (icerik.aud !== PROJE || icerik.iss !== "https://securetoken.google.com/" + PROJE) return null;
    if (!icerik.sub || icerik.exp <= simdi || icerik.iat > simdi + 300) return null;
    let anahtar = (await anahtarlariAl())[baslik.kid];
    if (!anahtar) { anahtarBitis = 0; anahtar = (await anahtarlariAl())[baslik.kid]; }   // anahtarlar yenilenmiş olabilir
    if (!anahtar) return null;
    const dogru = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", anahtar, b64url(i), new TextEncoder().encode(b + "." + g));
    if (!dogru) return null;
    return {
      uid: icerik.sub, ad: icerik.name || "", foto: icerik.picture || "",
      eposta: (icerik.email || "").toLowerCase(), epostaDogrulandi: !!icerik.email_verified
    };
  } catch (e) {
    return null;
  }
}
