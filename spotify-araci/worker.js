// Bekleniyor · Spotify aracısı (Cloudflare Worker)
//
// Spotify'ın herkese açık "embed" sayfası tarayıcıdan doğrudan okunamıyor (CORS izni yok).
// Bu küçük worker o sayfayı sunucu tarafında okur ve sadece şarkı adlarını ve sanatçıları
// sitemize JSON olarak verir. Spotify hesabı ya da anahtarı gerekmez.
//
// Kullanım: GET https://<worker-adresi>/?link=https://open.spotify.com/playlist/...
// Yanıt:    { tur, ad, sarkilar: [{ baslik, sanatci, sure }] }

const IZINLI_SITELER = [
  "https://atalayarslan.github.io",
  "http://localhost:8000"
];

export default {
  async fetch(istek) {
    const kaynak = istek.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": IZINLI_SITELER.includes(kaynak) ? kaynak : IZINLI_SITELER[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin"
    };
    if (istek.method === "OPTIONS") return new Response(null, { headers: cors });

    const yanitla = (veri, durum = 200) => new Response(JSON.stringify(veri), {
      status: durum,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" }
    });

    const link = new URL(istek.url).searchParams.get("link") || "";
    const eslesme = link.match(/open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|playlist|album)\/([A-Za-z0-9]{22})/);
    if (!eslesme) return yanitla({ hata: "Geçerli bir Spotify şarkı, liste ya da albüm linki değil." }, 400);
    const [, tur, kimlik] = eslesme;

    const sayfa = await fetch("https://open.spotify.com/embed/" + tur + "/" + kimlik, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept-Language": "tr,en;q=0.8" },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    if (!sayfa.ok) return yanitla({ hata: "Spotify sayfası açılamadı (" + sayfa.status + "). Liste gizli olabilir." }, 502);

    const html = await sayfa.text();
    const veri = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!veri) return yanitla({ hata: "Spotify sayfasının biçimi değişmiş, bilgiler okunamadı." }, 502);

    let varlik;
    try {
      varlik = JSON.parse(veri[1]).props.pageProps.state.data.entity;
    } catch (e) {
      return yanitla({ hata: "Spotify verisi çözümlenemedi." }, 502);
    }

    if (tur === "track") {
      return yanitla({
        tur,
        ad: varlik.name,
        sarkilar: [{
          baslik: varlik.name,
          sanatci: (varlik.artists || []).map((a) => a.name).join(", "),
          sure: Math.round((varlik.duration || 0) / 1000)
        }]
      });
    }

    return yanitla({
      tur,
      ad: varlik.name || varlik.title || "Spotify listesi",
      sarkilar: (varlik.trackList || []).map((s) => ({
        baslik: s.title,
        sanatci: s.subtitle || "",
        sure: Math.round((s.duration || 0) / 1000)
      }))
    });
  }
};
