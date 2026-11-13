// Oda arka plan videoları. Site videoyu veritabanına sığdırmak için küçültmek zorunda kalıyordu (kalite düşüyordu);
// burada asıl dosya dönüştürülmeden saklanır ve Cloudflare'in önbelleğinden oynatılır.
//   POST /medya                      gövde: video dosyası (MP4 ya da WebM, en fazla 20 MB)
//                                    "Authorization: Bearer <Google girişli Firebase kimlik kartı>" ve sitenin adresi gerekir
//                                    yanıt: { adres: "https://…/medya/<sha256>.mp4" }
//   GET  /medya/<sha256>.<mp4|webm>  videoyu verir (parça parça okuma / Range desteğiyle; iPhone bunu ister)
// Dosyanın adı içeriğinin SHA-256 özetidir: tahmin edilemez, aynı video iki kez saklanmaz.
// Güvenlik: sadece MP4/WebM kabul edilir (dosyanın ilk baytlarından anlaşılır), başka tür olarak sunulmaz (nosniff);
// kişi başına günde en fazla 30 yükleme.

export const MEDYA_SINIRI = 20 * 1024 * 1024;
const GUNLUK_SINIR = 30;
const YOL = /^\/medya\/([a-f0-9]{64})\.(mp4|webm)$/;
const TURLER = { mp4: "video/mp4", webm: "video/webm" };

function turuBul(baytlar) {
  if (baytlar.length < 12) return null;
  // MP4: 4. bayttan itibaren "ftyp"
  if (baytlar[4] === 0x66 && baytlar[5] === 0x74 && baytlar[6] === 0x79 && baytlar[7] === 0x70) return "mp4";
  // WebM (Matroska/EBML): 1A 45 DF A3
  if (baytlar[0] === 0x1a && baytlar[1] === 0x45 && baytlar[2] === 0xdf && baytlar[3] === 0xa3) return "webm";
  return null;
}

const onaltilik = (tampon) => [...new Uint8Array(tampon)].map((b) => b.toString(16).padStart(2, "0")).join("");

// kim: doğrulanmış kişinin uid'i. Yanıt: { durum, govde }
export async function medyaYukle(istek, env, kim) {
  const uzunluk = Number(istek.headers.get("Content-Length") || 0);
  if (uzunluk > MEDYA_SINIRI) return { durum: 413, govde: { hata: "Video en fazla 20 MB olabilir." } };
  const sayac = "sayac:" + kim + ":" + new Date().toISOString().slice(0, 10);
  const bugun = Number(await env.MEDYA.get(sayac)) || 0;
  if (bugun >= GUNLUK_SINIR) return { durum: 429, govde: { hata: "Bugünlük video yükleme sınırına ulaştın, yarın tekrar dene." } };
  const tampon = await istek.arrayBuffer();
  if (!tampon.byteLength) return { durum: 400, govde: { hata: "Dosya boş." } };
  if (tampon.byteLength > MEDYA_SINIRI) return { durum: 413, govde: { hata: "Video en fazla 20 MB olabilir." } };
  const tur = turuBul(new Uint8Array(tampon, 0, Math.min(16, tampon.byteLength)));
  if (!tur) return { durum: 415, govde: { hata: "Sadece MP4 ya da WebM video yüklenebilir." } };
  const ozet = onaltilik(await crypto.subtle.digest("SHA-256", tampon));
  await env.MEDYA.put("v:" + ozet, tampon, { metadata: { tur } });
  await env.MEDYA.put(sayac, String(bugun + 1), { expirationTtl: 2 * 86400 });
  return { durum: 200, govde: { adres: new URL(istek.url).origin + "/medya/" + ozet + "." + tur } };
}

function aralikYaniti(istek, tampon, tur) {
  const toplam = tampon.byteLength;
  const basliklar = {
    "Content-Type": TURLER[tur],
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin"
  };
  const aralik = /^bytes=(\d*)-(\d*)$/.exec(istek.headers.get("Range") || "");
  if (aralik && (aralik[1] || aralik[2])) {
    let bas, son;
    if (aralik[1] === "") { bas = Math.max(0, toplam - Number(aralik[2])); son = toplam - 1; }   // "bytes=-500": son 500 bayt
    else { bas = Number(aralik[1]); son = aralik[2] === "" ? toplam - 1 : Math.min(Number(aralik[2]), toplam - 1); }
    if (bas >= toplam || bas > son) {
      return new Response(null, { status: 416, headers: { ...basliklar, "Content-Range": "bytes */" + toplam } });
    }
    return new Response(tampon.slice(bas, son + 1), {
      status: 206, headers: { ...basliklar, "Content-Range": "bytes " + bas + "-" + son + "/" + toplam, "Content-Length": String(son - bas + 1) }
    });
  }
  return new Response(tampon, { headers: { ...basliklar, "Content-Length": String(toplam) } });
}

export async function medyaVer(istek, env, ctx) {
  const e = YOL.exec(new URL(istek.url).pathname);
  if (!e) return new Response("Bulunamadı", { status: 404 });
  const [, ozet, uzanti] = e;
  // Önce Cloudflare'in bu bölgedeki önbelleği (KV okuma hakkı harcanmaz)
  const onbellek = caches.default;
  const anahtar = new Request(new URL(istek.url).origin + "/medya/" + ozet + "." + uzanti);
  let tam = await onbellek.match(anahtar);
  let tampon, tur;
  if (tam) {
    tampon = await tam.arrayBuffer();
    tur = uzanti;
  } else {
    const { value, metadata } = await env.MEDYA.getWithMetadata("v:" + ozet, { type: "arrayBuffer" });
    if (!value || !metadata || metadata.tur !== uzanti) return new Response("Bulunamadı", { status: 404 });
    tampon = value;
    tur = metadata.tur;
    const kopya = aralikYaniti(new Request(anahtar), tampon, tur);
    const kayit = onbellek.put(anahtar, kopya);
    if (ctx && ctx.waitUntil) ctx.waitUntil(kayit); else await kayit;
  }
  return aralikYaniti(istek, tampon, tur);
}
