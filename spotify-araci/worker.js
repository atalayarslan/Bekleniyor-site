// Bekleniyor aracısı (Cloudflare Worker, adı: bekleniyor-spotify)
// Tarayıcının doğrudan okuyamadığı (CORS izni olmayan) sayfaları sunucu tarafında okur:
//  ?link=<Spotify şarkı/liste/albüm linki> → Spotify embed sayfasından şarkı adları ve sanatçılar
//  ?mix=<YouTube RD... liste kimliği>       → YouTube Mix'in şarkıları (resmi API Mix'leri doğru vermiyor)
//  ?sanatci=<id1,id2,... en fazla 20>       → her video için YouTube'un "Bu videodaki müzik" sanatçısı
//                                            (yoksa ""); şarkıyı firma yüklediyse bile asıl sanatçı
// Yanıt: { tur, ad, sarkilar: [{ baslik, sanatci, sure?, videoId? }] }  /  { sanatcilar: { id: "Sanatçı" } }
// Not: Cloudflare'in hızlı editöründe yazıldığı için girintisiz tutuldu.
const IZINLI = ["https://atalayarslan.github.io", "http://localhost:8000"];
const TARAYICI = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
// YouTube'un izleme sayfasındaki "Bu videodaki müzik" kartı: videoAttributeViewModel { title: şarkı, subtitle: sanatçı }
async function muzikSanatcisi(id) {
const yt = await fetch("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": TARAYICI }, body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20241001.00.00", hl: "tr", gl: "TR" } }, videoId: id }), cf: { cacheTtl: 86400, cacheEverything: true } });
if (!yt.ok) return "";
const bul = (o) => { if (!o || typeof o !== "object") return null; if (o.videoAttributeViewModel) return o.videoAttributeViewModel; for (const k in o) { const s = bul(o[k]); if (s) return s; } return null; };
const kart = bul(await yt.json());
const yazi = (x) => typeof x === "string" ? x : (x && (x.content || x.simpleText)) || "";
return kart ? yazi(kart.subtitle).slice(0, 80) : "";
}
// Spotify resmi Web API (Client Credentials): liste/albümün tamamı sayfa sayfa (en fazla 300 şarkı) okunur.
// Anahtarlar Cloudflare'de gizli değişken (SPOTIFY_ID, SPOTIFY_SECRET); yoksa ya da API reddederse (Spotify'ın kendi
// editoryal listeleri yeni uygulamalara kapalı) gömme sayfasına dönülür (orası en fazla 100 şarkı verir).
// Şubat 2026'dan beri liste şarkıları (/items) yalnızca giriş yapmış hesabın kendi ya da ortak listeleri için
// veriliyor. Bu yüzden site sahibi bir kez /giris ile Spotify'a bağlanır; yenileme anahtarı KV'de saklanır.
const SPOTIFY_SINIR = 300;
const GERI_ADRES = "https://bekleniyor-spotify.erayaksuhome.workers.dev/geri";
let spotifyJeton = null;
async function jetonIste(env, govde) {
const y = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + btoa(env.SPOTIFY_ID + ":" + env.SPOTIFY_SECRET) }, body: govde });
if (!y.ok) throw new Error("jeton " + y.status + " " + (await y.text()).slice(0, 120));
return y.json();
}
async function spotifyErisim(env) {
if (!env || !env.SPOTIFY_ID || !env.SPOTIFY_SECRET) return null;
if (spotifyJeton && spotifyJeton.bitis > Date.now() + 60000) return spotifyJeton;
const yenileme = env.KV ? await env.KV.get("yenileme") : null;
let j, kullanici = false;
if (yenileme) {
try {
j = await jetonIste(env, "grant_type=refresh_token&refresh_token=" + encodeURIComponent(yenileme));
kullanici = true;
if (j.refresh_token && j.refresh_token !== yenileme) await env.KV.put("yenileme", j.refresh_token);
} catch (h) { j = null; }
}
if (!j) j = await jetonIste(env, "grant_type=client_credentials");
spotifyJeton = { deger: j.access_token, kullanici, bitis: Date.now() + (j.expires_in || 3600) * 1000 };
return spotifyJeton;
}
async function apidenOku(tur, id, env) {
const erisim = await spotifyErisim(env);
if (!erisim) return null;
const basliklar = { "Authorization": "Bearer " + erisim.deger };
const al = async (adres) => { const y = await fetch(adres, { headers: basliklar }); if (!y.ok) throw new Error(String(y.status)); return y.json(); };
const kok = "https://api.spotify.com/v1/" + tur + "s/" + id;
const bilgi = await al(kok + (tur === "playlist" ? "?fields=name&market=TR" : "?market=TR"));
const sarkilar = [];
let adres = tur === "playlist" ? kok + "/items?limit=100&market=TR" : kok + "/tracks?limit=50&market=TR";
while (adres && sarkilar.length < SPOTIFY_SINIR) {
const sayfa = await al(adres);
for (const o of sayfa.items || []) {
const s = tur === "playlist" ? (o.item || o.track) : o;
if (s && s.name) sarkilar.push({ baslik: s.name, sanatci: (s.artists || []).map((a) => a.name).join(", "), sure: Math.round((s.duration_ms || 0) / 1000) });
}
adres = sayfa.next;
}
return { ad: bilgi.name, sarkilar: sarkilar.slice(0, SPOTIFY_SINIR) };
}
export default {
async fetch(istek, env) {
const kaynak = istek.headers.get("Origin") || "";
const cors = { "Access-Control-Allow-Origin": IZINLI.includes(kaynak) ? kaynak : IZINLI[0], "Access-Control-Allow-Methods": "GET, OPTIONS", "Vary": "Origin" };
if (istek.method === "OPTIONS") return new Response(null, { headers: cors });
const yanitla = (veri, durum = 200) => new Response(JSON.stringify(veri), { status: durum, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
const url = new URL(istek.url);
const p = url.searchParams;
const sayfaYaz = (metin) => new Response("<!doctype html><meta charset=utf-8><body style='font:18px sans-serif;padding:40px'>" + metin, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
// Site sahibinin bir kerelik Spotify bağlantısı
if (url.pathname === "/giris") {
const durum = crypto.randomUUID();
await env.KV.put("durum:" + durum, "1", { expirationTtl: 600 });
return Response.redirect("https://accounts.spotify.com/authorize?" + new URLSearchParams({ client_id: env.SPOTIFY_ID, response_type: "code", redirect_uri: GERI_ADRES, scope: "playlist-read-private playlist-read-collaborative", state: durum }), 302);
}
if (url.pathname === "/geri") {
const durum = p.get("state") || "";
if (!durum || !(await env.KV.get("durum:" + durum))) return sayfaYaz("Bağlantı süresi doldu, tekrar dene.");
await env.KV.delete("durum:" + durum);
if (!p.get("code")) return sayfaYaz("Spotify izni verilmedi: " + (p.get("error") || "").replace(/[<>&]/g, ""));
try {
const j = await jetonIste(env, new URLSearchParams({ grant_type: "authorization_code", code: p.get("code"), redirect_uri: GERI_ADRES }).toString());
if (!j.refresh_token) throw new Error("yenileme anahtarı gelmedi");
await env.KV.put("yenileme", j.refresh_token);
spotifyJeton = null;
return sayfaYaz("✅ Spotify bağlandı. Bu sekmeyi kapatabilirsin.");
} catch (h) { return sayfaYaz("Bağlanamadı: " + String(h.message).replace(/[<>&]/g, "")); }
}
const sanatci = p.get("sanatci") || "";
if (sanatci) {
const idler = sanatci.split(",").filter((id) => /^[\w-]{11}$/.test(id)).slice(0, 20);
if (!idler.length) return yanitla({ hata: "Gecersiz video kimligi." }, 400);
const sanatcilar = {};
await Promise.all(idler.map(async (id) => { sanatcilar[id] = await muzikSanatcisi(id).catch(() => ""); }));
return new Response(JSON.stringify({ sanatcilar }), { headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
const mix = p.get("mix") || "";
if (mix) {
if (!/^RD[\w-]{2,60}$/.test(mix)) return yanitla({ hata: "Gecersiz YouTube Mix kimligi." }, 400);
const ilk = mix.length === 13 ? mix.slice(2) : (p.get("v") || "");
// YouTube sitesinin kendi kullandığı "next" uç noktası; izleme sayfası sunucudan çerez onayına yönlenebiliyor
const govde = { context: { client: { clientName: "WEB", clientVersion: "2.20241001.00.00", hl: "tr", gl: "TR" } }, playlistId: mix };
if (ilk) govde.videoId = ilk;
const yt = await fetch("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": TARAYICI }, body: JSON.stringify(govde) });
if (!yt.ok) return yanitla({ hata: "YouTube Mix acilamadi (" + yt.status + ")." }, 502);
let liste;
try { liste = (await yt.json()).contents.twoColumnWatchNextResults.playlist.playlist; } catch (h) { return yanitla({ hata: "YouTube Mix okunamadi." }, 502); }
const sarkilar = (liste.contents || []).map((o) => o.playlistPanelVideoRenderer).filter((r) => r && r.videoId).map((r) => ({ videoId: r.videoId, baslik: (r.title && (r.title.simpleText || (r.title.runs || []).map((x) => x.text).join(""))) || "", sanatci: (r.shortBylineText && r.shortBylineText.runs && r.shortBylineText.runs[0].text) || "" }));
return yanitla({ tur: "mix", ad: liste.title || "YouTube Mix", sarkilar });
}
const link = p.get("link") || "";
const e = link.match(/open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|playlist|album)\/([A-Za-z0-9]{22})/);
if (!e) return yanitla({ hata: "Gecerli bir Spotify sarki, liste ya da album linki degil." }, 400);
if (e[1] !== "track") {
let sebep = "";
const api = await apidenOku(e[1], e[2], env).catch((h) => { sebep = String(h && h.message || h); return null; });
if (p.get("tani")) return yanitla({ tani: { anahtarVar: !!(env && env.SPOTIFY_ID && env.SPOTIFY_SECRET), jeton: !!spotifyJeton, girisli: !!(spotifyJeton && spotifyJeton.kullanici), sebep, sarki: api ? api.sarkilar.length : 0 } });
if (api && api.sarkilar.length) return yanitla({ tur: e[1], kaynak: "api", ad: api.ad || "Spotify listesi", sarkilar: api.sarkilar });
}
const sayfa = await fetch("https://open.spotify.com/embed/" + e[1] + "/" + e[2], { headers: { "User-Agent": TARAYICI, "Accept-Language": "tr,en;q=0.8" }, cf: { cacheTtl: 3600, cacheEverything: true } });
if (!sayfa.ok) return yanitla({ hata: "Spotify sayfasi acilamadi (" + sayfa.status + "). Liste gizli olabilir." }, 502);
const html = await sayfa.text();
const v = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (!v) return yanitla({ hata: "Spotify sayfasinin bicimi degismis." }, 502);
let x;
try { x = JSON.parse(v[1]).props.pageProps.state.data.entity; } catch (h) { return yanitla({ hata: "Spotify verisi cozulemedi." }, 502); }
if (e[1] === "track") return yanitla({ tur: "track", ad: x.name, sarkilar: [{ baslik: x.name, sanatci: (x.artists || []).map((a) => a.name).join(", "), sure: Math.round((x.duration || 0) / 1000) }] });
return yanitla({ tur: e[1], ad: x.name || x.title || "Spotify listesi", sarkilar: (x.trackList || []).map((s) => ({ baslik: s.title, sanatci: s.subtitle || "", sure: Math.round((s.duration || 0) / 1000) })) });
}
};
