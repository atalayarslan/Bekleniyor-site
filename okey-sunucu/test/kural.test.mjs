// Kural denemesi (sunucusuz): çift açan sonradan per koyabilir, seri açan çift koyamaz; soldan alınan taş için
// atana ceza sadece alan o taşla elini açtıysa yazılır (önceden açmış oyuncu alıp kullanırsa ceza yok).
// Çalıştırma: node test/kural.test.mjs
import assert from "node:assert";
import { OkeyMasasi } from "../src/masa.js";
import K from "../../js/okey/kurallar.js";

const depo = new Map();
const ctx = {
  storage: { get: async (a) => depo.get(a), put: async (a, v) => { depo.set(a, v); }, setAlarm: () => { }, deleteAlarm: () => { } },
  getWebSockets: () => [],
  blockConcurrencyWhile: (f) => f()
};
const masa = new OkeyMasasi(ctx, {});
await new Promise((r) => setTimeout(r, 10));
masa.m.ayar.elSayisi = 0;
masa.m.koltuklar = [0, 1, 2, 3].map((h) => ({ kim: "bot:" + h, ad: "Bot " + h, foto: "", ayrildi: null, bot: true }));

let no = 0;
const t = (r, n) => ({ id: "x" + no++, r, n });   // r: 0 kırmızı, 1 mavi, 2 siyah, 3 sarı
const kim = (g) => g.map((x) => x.id);

// Yeni el; okey sarı 1 (gösterge sarı 13, masada değil), kimse açmamış
function el(sira, asama) {
  masa.olaylar = [];
  masa.yeniEl();
  const E = masa.m.el;
  Object.assign(E, { gosterge: t(3, 13), okey: { r: 3, n: 1 }, gostergeMasada: false, sira, asama, yandan: null, bekleyenIslek: null });
  E.eller = [[], [], [], []];
  E.atilanlar = [[], [], [], []];
  return E;
}

// 1) Çift açan per koyar: sadece masada perle açan başka biri varsa
{
  const E = el(0, "at");
  E.acti[0] = "cift";
  const per = [t(0, 13), t(1, 13), t(2, 13)];
  E.eller[0] = [...per, t(0, 5), t(1, 9)];
  assert.strictEqual(masa.ac(0, [kim(per)]), "Masada perle açan yokken çift açan per koyamaz");
  E.acti[2] = "seri";
  assert.strictEqual(masa.ac(0, [kim(per)]), undefined);
  assert.strictEqual(E.eller[0].length, 2);
  assert.ok(E.perler.some((p) => p.sahip === 0 && p.taslar.length === 3));
  console.log("✓ çift açan, masada perle açan yokken per koyamadı; biri perle açınca 13-13-13'ü koydu");
}

// 2) Seri açan çift koyar: sadece masada çift açan başka biri varsa
{
  const E = el(0, "at");
  E.acti[0] = "seri";
  const cift = [t(0, 5), t(0, 5)];
  E.eller[0] = [...cift, t(1, 9)];
  assert.strictEqual(masa.ac(0, [kim(cift)]), "Masada çift açan yokken seri açan çift koyamaz");
  E.acti[3] = "cift";
  assert.strictEqual(masa.ac(0, [kim(cift)]), undefined);
  console.log("✓ seri açan, masada çift açan yokken çift koyamadı; biri çift açınca 5-5'i koydu");
}

// 2b) 7 ya da daha çok çiftle açan: diğerlerine 101 ceza (eşlide sadece rakiplere)
for (const esli of [false, true]) {
  masa.m.ayar.esli = esli;
  const E = el(0, "at");
  const ciftler = [1, 2, 3, 4, 5, 6, 7].map((n) => [t(0, n), t(0, n)]);
  E.eller[0] = [...ciftler.flat(), t(1, 9)];
  assert.strictEqual(masa.ac(0, ciftler.map(kim)), undefined);
  assert.deepStrictEqual(E.cezalar, esli ? [0, 101, 0, 101] : [0, 101, 101, 101]);
  masa.m.ayar.esli = false;
}
{
  const E = el(0, "at");
  const ciftler = [1, 2, 3, 4, 5, 6].map((n) => [t(0, n), t(0, n)]);
  E.eller[0] = [...ciftler.flat(), t(1, 9)];
  assert.strictEqual(masa.ac(0, ciftler.map(kim)), undefined);
  assert.deepStrictEqual(E.cezalar, [0, 0, 0, 0]);
  console.log("✓ 7 çiftle açınca herkese (eşlide iki rakibe) 101 ceza; 6 çiftte ceza yok");
}

// 2c) Yerden okey alınır, perin sahibine ceza yok
{
  const E = el(1, "at");
  E.acti[1] = "seri";
  const okeyTas = t(3, 1);                 // sarı 1 = okey
  const seri = [t(0, 3), okeyTas, t(0, 5)]; // okey kırmızı 4'ün yerinde
  E.perler = [Object.assign({ sahip: 2, taslar: seri }, K.perCoz(seri, E.okey, masa.ayar()))];
  const dort = t(0, 4);
  E.eller[1] = [dort, t(2, 2), t(1, 7)];
  assert.strictEqual(masa.isle(1, dort.id, 0), undefined);
  assert.ok(E.eller[1].some((x) => x.id === okeyTas.id), "okey ele geçmedi");
  assert.deepStrictEqual(E.cezalar, [0, 0, 0, 0]);
  console.log("✓ okey yerden alındı, perin sahibine ceza yazılmadı");
}

// 2d) 12-13-1 serisi geçmez, gösterge çifti yok
{
  const ayar = masa.ayar();
  assert.strictEqual(K.perCoz([t(0, 12), t(0, 13), t(0, 1)], { r: 3, n: 1 }, ayar), null);
  assert.ok(K.perCoz([t(0, 1), t(0, 2), t(0, 3)], { r: 3, n: 5 }, ayar));
  const E = el(0, "at");
  E.gostergeMasada = true;
  E.gosterge = t(1, 2);
  const ayni = t(1, 2);
  const ciftler = [1, 3, 4, 5].map((n) => [t(0, n), t(0, n)]);
  E.eller[0] = [...ciftler.flat(), ayni, t(2, 9)];
  assert.strictEqual(masa.ac(0, [...ciftler.map(kim), [ayni.id]]), "Geçersiz çift");
  assert.ok(E.gostergeMasada, "gösterge masadan alındı");
  console.log("✓ 12-13-1 geçmedi, 1-2-3 geçti; gösterge alınamadı");
}

// 2e) Elin tamamındaki çiftler (yan yana dizilmeseler de) sayılır
{
  const okey = { r: 3, n: 1 };
  const el = [t(2, 11), t(0, 7), t(1, 2), t(2, 11), t(0, 9), t(3, 1)];   // yeşil(siyah) 11 çifti ayrık, bir okey
  assert.strictEqual(K.eldekiCiftler(el, okey).length, 2);              // 11-11 ve okey + en yüksek tek (9)
  console.log("✓ eldeki çiftler yerlerine bakılmadan sayıldı");
}

// 2f) Botun yerine oturan kişinin adı çeteleye geçer
{
  el(0, "at");
  masa.m.oyun.oyuncular = masa.m.koltuklar.map((x) => ({ ad: x.ad }));
  const ws = { send: () => { }, serializeAttachment: () => { } };
  const kayit = masa.m.koltuklar.slice();
  masa.m.koltuklar[2] = { kim: "bot:2", ad: "Bot Zeynep", foto: "", ayrildi: null, bot: true };
  await masa.isle_({ kim: "m:deniz", ad: "Deniz", foto: "" }, ws, { t: "otur", koltuk: 2 });
  assert.strictEqual(masa.m.koltuklar[2].ad, "Deniz");
  assert.strictEqual(masa.m.oyun.oyuncular[2].ad, "Deniz");
  masa.m.koltuklar = kayit;
  console.log("✓ botun yerine oturan Deniz çetelede de Deniz göründü");
}

// 3) Önceden açmış oyuncu soldan (işlek) taş alıp per koyar: atana ceza yok
{
  const E = el(1, "cek");
  E.acti[1] = "seri";
  const sol = t(2, 13);
  E.atilanlar[0] = [sol];
  E.bekleyenIslek = { atan: 0, tas: sol };
  E.eller[1] = [t(0, 13), t(1, 13), t(2, 2), t(1, 7)];
  assert.strictEqual(masa.soldanAl(1), undefined);
  assert.strictEqual(masa.ac(1, [[E.eller[1][0].id, E.eller[1][1].id, sol.id]]), undefined);
  assert.strictEqual(E.cezalar[0], 0, "önceden açmış oyuncu soldan aldı, atana ceza yazıldı");
  assert.strictEqual(E.bekleyenIslek, null);
  assert.strictEqual(E.yandan, null);
  console.log("✓ önceden açmış oyuncu soldan alıp per koydu: atana ceza yok (işlek de yazılmadı)");
}

// 4) Önceden açmış oyuncu soldan alıp işler: atana ceza yok
{
  const E = el(1, "cek");
  E.acti[1] = "seri";
  const seri = [t(0, 3), t(0, 4), t(0, 5)];
  E.perler = [Object.assign({ sahip: 2, taslar: seri }, K.perCoz(seri, E.okey, masa.ayar()))];
  const sol = t(0, 6);
  E.atilanlar[0] = [sol];
  E.eller[1] = [t(2, 2), t(1, 7)];
  masa.soldanAl(1);
  assert.strictEqual(masa.isle(1, sol.id, 0), undefined);
  assert.strictEqual(E.perler[0].taslar.length, 4);
  assert.strictEqual(E.cezalar[0], 0, "önceden açmış oyuncu soldan alıp işledi, atana ceza yazıldı");
  console.log("✓ önceden açmış oyuncu soldan alıp işledi: atana ceza yok");
}

// 5) Açmamış oyuncu soldan aldığı taşla açar: atana taş×10 ceza
{
  const E = el(1, "cek");
  const sol = t(2, 13);
  E.atilanlar[0] = [sol];
  const g13 = [t(0, 13), t(1, 13)], g12 = [t(0, 12), t(1, 12), t(2, 12)], g11 = [t(0, 11), t(1, 11), t(2, 11)], g10 = [t(0, 10), t(1, 10), t(2, 10)];
  E.eller[1] = [...g13, ...g12, ...g11, ...g10, t(2, 2)];
  masa.soldanAl(1);
  assert.strictEqual(masa.ac(1, [[...kim(g13), sol.id], kim(g12), kim(g11), kim(g10)]), undefined);
  assert.strictEqual(E.acti[1], "seri");
  assert.strictEqual(E.cezalar[0], 130, "açtıran taş cezası yazılmadı");
  console.log("✓ açmamış oyuncu soldan aldığı 13 ile açtı: atana 130 ceza");
}
console.log("\n✓ kural denemesi geçti");
