// Bekleniyor oyun sunucusu (Cloudflare Worker). Her oda için bir okey masası ve bir bilardo masası (Durable Object) vardır.
//   wss://…/masa/<oda>     okey masasına bağlanma (WebSocket; ilk mesajda Google girişli Firebase kimlik kartı gerekir)
//   wss://…/bilardo/<oda>  bilardo masasına bağlanma (aynı giriş şartı)
//   GET  /cetele/<oda>     odanın okey çetelesi ("Authorization: Bearer <kimlik kartı>" gerekir)
//   GET  /saglik           { ok: true }
// Sadece sitenin adreslerinden gelen bağlantılar ve sadece Google hesabıyla giriş yapmış kişiler kabul edilir.

import { istektekiKart } from "./kimlik.js";
export { OkeyMasasi } from "./masa.js";
export { BilardoMasasi } from "./bilardo.js";

const IZINLI = ["https://atalayarslan.github.io", "http://localhost:8000", "http://localhost:8002", "http://127.0.0.1:8002"];
const ODA = /^[A-Za-z0-9_-]{1,64}$/;

function cors(istek, yanit) {
  const kaynak = istek.headers.get("Origin");
  const y = new Response(yanit.body, yanit);
  y.headers.set("Access-Control-Allow-Origin", IZINLI.includes(kaynak) ? kaynak : IZINLI[0]);
  y.headers.set("Access-Control-Allow-Headers", "Authorization");
  y.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  y.headers.set("Vary", "Origin");
  y.headers.set("Cache-Control", "no-store");
  return y;
}

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    const [, yol, oda] = url.pathname.split("/");
    if (istek.method === "OPTIONS") return cors(istek, new Response(null, { status: 204 }));
    if (yol === "saglik") return cors(istek, Response.json({ ok: true }));
    if ((yol !== "masa" && yol !== "cetele" && yol !== "bilardo") || !ODA.test(oda || "")) return new Response("Bulunamadı", { status: 404 });
    const kaynak = istek.headers.get("Origin");
    if ((yol === "masa" || yol === "bilardo") && !IZINLI.includes(kaynak)) return new Response("İzin yok", { status: 403 });
    // Çetele: sadece Google girişli kişiler okuyabilir (yerel deneme sunucusunda giriş istenmez)
    if (yol === "cetele" && env.MISAFIR_IZNI !== "1" && !(await istektekiKart(istek))) {
      return cors(istek, Response.json({ hata: "Google hesabınla giriş yap" }, { status: 401 }));
    }
    const ad = yol === "bilardo" ? env.BILARDO : env.MASA;
    const masa = ad.get(ad.idFromName(oda));
    const ic = new URL("https://masa/" + yol + "?oda=" + encodeURIComponent(oda));
    const yanit = await masa.fetch(new Request(ic, istek));
    return yol === "cetele" ? cors(istek, yanit) : yanit;
  }
};
