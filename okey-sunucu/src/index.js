// Bekleniyor okey sunucusu (Cloudflare Worker). Her oda için bir masa (Durable Object) vardır.
//   wss://…/masa/<oda>   masaya bağlanma (WebSocket)
//   GET  /cetele/<oda>   odanın okey çetelesi (herkes okuyabilir)
//   GET  /saglik         { ok: true }
// Sadece sitenin adreslerinden gelen bağlantılar kabul edilir.

export { OkeyMasasi } from "./masa.js";

const IZINLI = ["https://atalayarslan.github.io", "http://localhost:8000", "http://localhost:8002", "http://127.0.0.1:8002"];
const ODA = /^[A-Za-z0-9_-]{1,64}$/;

function cors(istek, yanit) {
  const kaynak = istek.headers.get("Origin");
  const y = new Response(yanit.body, yanit);
  y.headers.set("Access-Control-Allow-Origin", IZINLI.includes(kaynak) ? kaynak : IZINLI[0]);
  y.headers.set("Vary", "Origin");
  y.headers.set("Cache-Control", "no-store");
  return y;
}

export default {
  async fetch(istek, env) {
    const url = new URL(istek.url);
    const [, yol, oda] = url.pathname.split("/");
    if (yol === "saglik") return cors(istek, Response.json({ ok: true }));
    if ((yol !== "masa" && yol !== "cetele") || !ODA.test(oda || "")) return new Response("Bulunamadı", { status: 404 });
    const kaynak = istek.headers.get("Origin");
    if (yol === "masa" && !IZINLI.includes(kaynak)) return new Response("İzin yok", { status: 403 });
    const masa = env.MASA.get(env.MASA.idFromName(oda));
    const ic = new URL("https://masa/" + yol + "?oda=" + encodeURIComponent(oda));
    const yanit = await masa.fetch(new Request(ic, istek));
    return yol === "cetele" ? cors(istek, yanit) : yanit;
  }
};
