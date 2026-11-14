// Oyun galibiyetleri (bütün odalar için tek liste): oyun bitince masa sunucusu kazananları ve oynayanları yazar.
// Sadece Google hesabıyla oynayanlar sayılır (botlar ve misafirler sayılmaz). Kayıt sunucudadır, oyuncunun
// tarayıcısından yazılamaz; böylece kimse kendine galibiyet ekleyemez.
//   GET /galibiyetler  → { liste: [{ ad, foto, okey, bilardo, oyun }] } (en çok galibiyetten aza; giriş gerekir)
// Depo: MEDYA KV'sindeki "galibiyetler" anahtarı (KV günlük yazma sınırı oyun bitişleri için fazlasıyla yeter).

const ANAHTAR = "galibiyetler";
const EN_FAZLA = 500;

// oyun: "okey" | "bilardo"; oyuncular: [{ kim, ad, foto, kazandi }]
export async function galibiyetYaz(env, oyun, oyuncular) {
  if (!env || !env.MEDYA) return;
  const sayilir = (kim) => /^u:/.test(kim || "") || (env.MISAFIR_IZNI === "1" && /^m:/.test(kim || ""));
  const yazilacak = (oyuncular || []).filter((o) => o && sayilir(o.kim));
  if (!yazilacak.length) return;
  try {
    const kayit = (await env.MEDYA.get(ANAHTAR, { type: "json" })) || {};
    for (const o of yazilacak) {
      const id = o.kim.slice(2);
      const s = kayit[id] || (kayit[id] = { ad: "", foto: "", okey: 0, bilardo: 0, oyun: 0 });
      s.ad = String(o.ad || s.ad || "Oyuncu").slice(0, 40);
      if (/^https:\/\/lh\d\.googleusercontent\.com\//.test(o.foto || "")) s.foto = o.foto;
      s.oyun++;
      if (o.kazandi) s[oyun] = (s[oyun] || 0) + 1;
      s.zaman = Date.now();
    }
    // En son oynayan 500 kişi tutulur
    const idler = Object.keys(kayit);
    if (idler.length > EN_FAZLA) {
      idler.sort((a, b) => (kayit[a].zaman || 0) - (kayit[b].zaman || 0));
      for (const id of idler.slice(0, idler.length - EN_FAZLA)) delete kayit[id];
    }
    await env.MEDYA.put(ANAHTAR, JSON.stringify(kayit));
  } catch (e) { }
}

export async function galibiyetleriVer(env) {
  const kayit = (env.MEDYA && (await env.MEDYA.get(ANAHTAR, { type: "json" }))) || {};
  const liste = Object.values(kayit)
    .map((s) => ({ ad: s.ad, foto: s.foto || "", okey: s.okey || 0, bilardo: s.bilardo || 0, oyun: s.oyun || 0 }))
    .filter((s) => s.okey + s.bilardo > 0)
    .sort((a, b) => (b.okey + b.bilardo) - (a.okey + a.bilardo) || a.oyun - b.oyun)
    .slice(0, 50);
  return { liste };
}
