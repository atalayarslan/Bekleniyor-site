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
  Object.assign(E, { gosterge: t(3, 13), okey: { r: 3, n: 1 }, gostergeMasada: false, sira, asama, yandan: null, sonAtilan: null, kilitliler: [] });
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

// 2c2) Çiftteki okey de alınır: kırmızı 13 + okey çiftine asıl kırmızı 13 konup okey alınır
{
  const E = el(1, "at");
  E.acti[1] = "seri";
  const okeyTas = t(3, 1);
  E.perler = [{ sahip: 2, tur: "cift", taslar: [t(0, 13), okeyTas] }];
  const onUc = t(0, 13);
  const yanlis = t(1, 13);
  E.eller[1] = [onUc, yanlis, t(2, 2)];
  assert.strictEqual(masa.isle(1, yanlis.id, 0), "Bu taş o pere işlenmiyor");
  assert.strictEqual(masa.isle(1, onUc.id, 0), undefined);
  assert.ok(E.eller[1].some((x) => x.id === okeyTas.id), "çiftteki okey ele geçmedi");
  assert.deepStrictEqual(E.perler[0].taslar.map((x) => x.n + "/" + x.r), ["13/0", "13/0"]);
  assert.strictEqual(E.perler[0].tur, "cift");
  console.log("✓ çiftteki okey aynı taşla değiştirilip alındı; başka renk 13 olmadı");
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

// 2g) Koltuk değiştirme: oyun sürerken olmaz, oyun yokken boş koltuğa geçilir
{
  const ws = { send: () => { }, serializeAttachment: () => { } };
  const kayit = masa.m.koltuklar.slice();
  const oyun = masa.m.oyun;
  const ben = { kim: "m:ali", ad: "Ali", foto: "" };
  masa.m.koltuklar = [{ kim: "m:ali", ad: "Ali", foto: "", ayrildi: null }, null, kayit[2], null];
  masa.m.oyun = { bitis: null, oyuncular: [] };
  masa.m.el.bitti = true;
  assert.strictEqual(await masa.isle_(ben, ws, { t: "otur", koltuk: 1 }), "Oyun sürerken koltuk değiştirilemez");
  masa.m.oyun.bitis = Date.now();
  assert.strictEqual(await masa.isle_(ben, ws, { t: "otur", koltuk: 2 }), "Bu koltuk dolu");
  assert.strictEqual(await masa.isle_(ben, ws, { t: "otur", koltuk: 3 }), undefined);
  assert.strictEqual(masa.m.koltuklar[3].kim, "m:ali");
  assert.strictEqual(masa.m.koltuklar[0], null);
  masa.m.koltuklar = kayit;
  masa.m.oyun = oyun;
  console.log("✓ oyun sürerken koltuk değişmedi; oyun bitince boş koltuğa geçildi");
}

// 3) Önceden açmış oyuncu soldan (işlek) taş alıp per koyar: atana ceza yok
{
  const E = el(1, "cek");
  E.acti[1] = "seri";
  const sol = t(2, 13);
  E.atilanlar[0] = [sol];
  E.sonAtilan = { atan: 0, tasId: sol.id, gosterildi: false };
  E.eller[1] = [t(0, 13), t(1, 13), t(2, 2), t(1, 7)];
  assert.strictEqual(masa.soldanAl(1), undefined);
  assert.strictEqual(masa.ac(1, [[E.eller[1][0].id, E.eller[1][1].id, sol.id]]), undefined);
  assert.strictEqual(E.cezalar[0], 0, "önceden açmış oyuncu soldan aldı, atana ceza yazıldı");
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
// 6) İşlek "fark eden söyler": atınca ceza yok; gösterilirse 101 ve taş kilitlenir; yanlış gösterene ceza yok
{
  const ws = { send: () => { }, serializeAttachment: () => { } };
  const kayit = masa.m.koltuklar.slice();
  const E = el(0, "at");
  // İnsanlar: 0 atan, 1 sıradaki, 2 karşıdaki; 3 bot olmasın (botlar hemen gösterir, ayrıca denenir)
  masa.m.koltuklar = [0, 1, 2, 3].map((h) => ({ kim: "m:o" + h, ad: "O" + h, foto: "", ayrildi: null }));
  const seri = [t(0, 3), t(0, 4), t(0, 5)];
  E.perler = [Object.assign({ sahip: 2, taslar: seri }, K.perCoz(seri, E.okey, masa.ayar()))];
  E.acti[2] = "seri";
  const islek = t(0, 6);
  E.eller[0] = [islek, t(1, 9), t(2, 11)];
  assert.strictEqual(masa.at(0, islek.id), undefined);
  assert.deepStrictEqual(E.cezalar, [0, 0, 0, 0], "işlek atınca ceza kendiliğinden yazıldı");
  assert.strictEqual(E.sira, 1);
  // Atan kendi taşını gösteremez; işlenmeyen pere gösterilirse ceza yok
  assert.strictEqual(await masa.isle_({ kim: "m:o0" }, ws, { t: "islekGoster", per: 0 }), "Kendi attığın taşı gösteremezsin");
  const kut = [t(0, 9), t(1, 9), t(2, 9)];
  E.perler.push(Object.assign({ sahip: 2, taslar: kut }, K.perCoz(kut, E.okey, masa.ayar())));
  masa.olaylar = [];
  assert.strictEqual(await masa.isle_({ kim: "m:o2" }, ws, { t: "islekGoster", per: 1 }), undefined);
  assert.ok(masa.olaylar.some((o) => o.tur === "islekDegil"));
  assert.deepStrictEqual(E.cezalar, [0, 0, 0, 0], "yanlış gösterene/atana ceza yazıldı");
  // Karşıdaki (sırası olmayan) doğru pere gösterir: atana 101, taş kilitli, sıradaki alamaz
  assert.strictEqual(await masa.isle_({ kim: "m:o2" }, ws, { t: "islekGoster", per: 0 }), undefined);
  assert.deepStrictEqual(E.cezalar, [101, 0, 0, 0]);
  assert.ok(E.kilitliler.includes(islek.id));
  assert.strictEqual(masa.soldanAl(1), "Bu taş işlek diye gösterildi, alınamaz");
  assert.strictEqual(await masa.isle_({ kim: "m:o3" }, ws, { t: "islekGoster", per: 0 }), "Gösterilecek taş yok");
  console.log("✓ işlek atınca ceza yok; yanlış gösterende ceza yok; gösterilince atana 101, taş kilitli");

  // Gösterme süresi sıradakinin sırası bitince biter
  E.asama = "cek";
  E.deste = [t(3, 7), t(3, 8)];
  E.eller[1] = [t(2, 2), t(1, 11)];
  masa.cek(1);
  const yeni = E.eller[1].at(-1);
  masa.at(1, yeni.id);
  const once = E.sonAtilan;
  assert.ok(once && once.atan === 1, "yeni atılan taş gösterilebilir olmalı");

  // Kimse fark etmezse açmış oyuncu işlek taşı alıp işler: ceza yok
  const E2 = el(0, "at");
  masa.m.koltuklar = [0, 1, 2, 3].map((h) => ({ kim: "m:o" + h, ad: "O" + h, foto: "", ayrildi: null }));
  E2.perler = [Object.assign({ sahip: 2, taslar: seri }, K.perCoz(seri, E2.okey, masa.ayar()))];
  E2.acti[1] = "seri";
  const islek2 = t(0, 6);
  E2.eller[0] = [islek2, t(1, 9)];
  E2.eller[1] = [t(2, 2), t(1, 7)];
  masa.at(0, islek2.id);
  assert.strictEqual(masa.soldanAl(1), undefined);
  assert.strictEqual(masa.isle(1, islek2.id, 0), undefined);
  assert.deepStrictEqual(E2.cezalar, [0, 0, 0, 0]);
  console.log("✓ kimse fark etmeyince açmış oyuncu işlek taşı aldı ve işledi, ceza yok");

  // Bot masadaysa işlek taşı hemen gösterir (eşlide takım arkadaşınınkini göstermez)
  const E3 = el(0, "at");
  masa.m.koltuklar = [{ kim: "m:o0", ad: "O0", foto: "", ayrildi: null }, { kim: "m:o1", ad: "O1", foto: "", ayrildi: null },
    { kim: "bot:2", ad: "Bot Zeynep", foto: "", ayrildi: null, bot: true }, { kim: "m:o3", ad: "O3", foto: "", ayrildi: null }];
  E3.perler = [Object.assign({ sahip: 1, taslar: seri }, K.perCoz(seri, E3.okey, masa.ayar()))];
  const islek3 = t(0, 6);
  E3.eller[0] = [islek3, t(1, 9)];
  masa.m.ayar.esli = true;
  masa.at(0, islek3.id);
  assert.deepStrictEqual(E3.cezalar, [0, 0, 0, 0], "eşlide bot takım arkadaşının taşını gösterdi");
  masa.m.ayar.esli = false;
  const E4 = el(0, "at");
  E4.perler = [Object.assign({ sahip: 1, taslar: seri }, K.perCoz(seri, E4.okey, masa.ayar()))];
  const islek4 = t(0, 6);
  E4.eller[0] = [islek4, t(1, 9)];
  masa.at(0, islek4.id);
  assert.deepStrictEqual(E4.cezalar, [101, 0, 0, 0], "bot işlek taşı göstermedi");
  console.log("✓ bot işlek taşı hemen gösterdi (eşlide takım arkadaşınınkini göstermedi)");

  // Son taşı işlek atan bitirir, el sonunda 101 yer
  const E5 = el(0, "at");
  masa.m.koltuklar = [0, 1, 2, 3].map((h) => ({ kim: "m:o" + h, ad: "O" + h, foto: "", ayrildi: null }));
  E5.perler = [Object.assign({ sahip: 2, taslar: seri }, K.perCoz(seri, E5.okey, masa.ayar()))];
  E5.acti[0] = "seri";
  const islek5 = t(0, 6);
  E5.eller[0] = [islek5];
  assert.strictEqual(masa.at(0, islek5.id), undefined);
  assert.ok(E5.bitti && E5.sonuc.bitiren === 0, "bitiremedi");
  assert.strictEqual(E5.cezalar[0], 101, "son işlek taşın cezası yazılmadı");
  // Deste biterse son atılan işlek taş da cezalı
  const E6 = el(0, "at");
  E6.perler = [Object.assign({ sahip: 2, taslar: seri }, K.perCoz(seri, E6.okey, masa.ayar()))];
  const islek6 = t(0, 6);
  E6.eller[0] = [islek6, t(1, 9)];
  E6.deste = [];
  masa.at(0, islek6.id);
  masa.cek(1);
  assert.ok(E6.bitti && E6.sonuc.bitiren == null);
  assert.strictEqual(E6.cezalar[0], 101, "deste bitince son işlek taşın cezası yazılmadı");
  masa.m.koltuklar = kayit;
  console.log("✓ son taşı işlek atan bitirdi ve 101 yedi; deste bitince son atılan işlek de cezalı");
}

console.log("\n✓ kural denemesi geçti");
