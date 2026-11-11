// Bilardo masası (sunucu) denemesi: sahte depolamayla kurulur; teke tek ve eşli oyunlar botlarla sonuna kadar oynanır,
// insan oyuncunun atış mesajları doğrulanır (sıra, geçersiz sayılar, beyazı koyma kuralları).
// Çalıştırma: node --no-warnings test/bilardo.masa.test.mjs
import assert from "node:assert";
import { BilardoMasasi } from "../src/bilardo.js";

function masaKur() {
  const depo = new Map();
  const ctx = {
    storage: { get: async (a) => depo.get(a), put: async (a, v) => { depo.set(a, v); }, setAlarm: () => { }, deleteAlarm: () => { } },
    getWebSockets: () => [],
    blockConcurrencyWhile: (f) => f()
  };
  return new BilardoMasasi(ctx, { MISAFIR_IZNI: "1" });
}
const bekle = () => new Promise((r) => setTimeout(r, 5));
const bot = (h) => ({ kim: "bot:" + h, ad: "Bot " + h, foto: "", ayrildi: null, bot: true });

// 1) Teke tek ve eşli: botlar oyunu bitirir; eşlide takımın iki oyuncusu sırayla atar
for (const koltuklar of [[0, 1], [0, 1, 3], [0, 1, 2, 3]]) {
  for (let oyun = 0; oyun < 10; oyun++) {
    const masa = masaKur();
    await bekle();
    for (const h of koltuklar) masa.m.koltuklar[h] = bot(h);
    masa.olaylar = [];
    assert.strictEqual(masa.basla(), undefined);
    const O = masa.m.oyun;
    const atanlar = [[], []];
    let n = 0;
    while (!O.bitti) {
      assert(n++ < 500, "oyun bitmedi");
      O.atisBitis = 0;
      const k = O.sira;
      if (masa.sonAtan !== k) atanlar[k % 2].push(k);   // takımın her yeni sırası
      masa.sonAtan = k;
      masa.olaylar = [];
      masa.botOyna(k);
      assert(masa.olaylar.some((o) => o.tur === "vurus"), "bot atmadı");
    }
    assert(O.kazanan === 0 || O.kazanan === 1);
    if (koltuklar.length >= 3) {
      // Takımın sıra aldığı her seferde atan değişir (aynı oyuncu üst üste ancak sokup devam ederse atar)
      for (const t of [0, 1]) {
        if (koltuklar.filter((h) => h % 2 === t).length < 2) continue;   // tek kişilik takım hep aynı kişi
        atanlar[t].forEach((k, i) => i && assert.notStrictEqual(k, atanlar[t][i - 1], "eşlide takımın oyuncuları sırayla atmalı"));
      }
    }
  }
}

// 2) İnsan oyuncunun mesajları
{
  const masa = masaKur();
  await bekle();
  const ben = { kim: "m:abcdefghijkl", ad: "Ali" };
  masa.olaylar = [];
  assert.strictEqual(masa.isle_(ben, null, { t: "basla" }), "Oyunu başlatmak için masaya otur");
  masa.isle_(ben, { serializeAttachment() { } }, { t: "otur", koltuk: 0 });
  assert.strictEqual(masa.m.kurucu, ben.kim);
  assert.match(masa.isle_(ben, null, { t: "basla" }), /en az 2/);
  masa.m.koltuklar[2] = bot(2);
  assert.match(masa.isle_(ben, null, { t: "basla" }), /İki takımda da/);
  masa.m.koltuklar[2] = null;
  masa.isle_(ben, null, { t: "bot", koltuk: 1 });
  assert(masa.m.koltuklar[1].bot);
  masa.m.kiran = 0;   // ben kırayım
  assert.strictEqual(masa.isle_(ben, null, { t: "basla" }), undefined);
  const O = masa.m.oyun;
  assert.strictEqual(O.sira, 0);
  assert.strictEqual(masa.isle_(ben, null, { t: "vur", yx: "1", yy: 0, guc: 1, ust: 0, yan: 0 }), "Geçersiz atış");
  assert.strictEqual(masa.isle_(ben, null, { t: "vur", yx: 0, yy: 0, guc: 1, ust: 0, yan: 0 }), "Geçersiz atış");
  assert.strictEqual(masa.isle_(ben, null, { t: "vur", yx: 1, yy: 0, guc: 1, ust: 0, yan: 0, beyaz: { x: 600, y: 250 } }), "Kırışta beyaz çizginin gerisinde olmalı");
  assert.strictEqual(masa.isle_(ben, null, { t: "vur", yx: 1, yy: 0, guc: 1, ust: 0, yan: 0, beyaz: { x: 2, y: 250 } }), "Beyaz oraya konamaz");
  masa.olaylar = [];
  assert.strictEqual(masa.isle_(ben, null, { t: "vur", yx: 1, yy: 0, guc: 1, ust: 0, yan: 0, beyaz: { x: 200, y: 250 } }), undefined);
  const v = masa.olaylar.find((o) => o.tur === "vurus");
  assert.deepStrictEqual(v.once[0], { x: 200, y: 250 });
  // Faulsüz kırıştan sonra elde top kalmaz (kırışın "elde"si biter)
  const sonuc = masa.olaylar.find((o) => o.tur === "sonuc");
  if (!sonuc.faul) assert.strictEqual(O.elde, false, "faulsüz atıştan sonra elde top olmamalı");
  else assert.strictEqual(O.elde, true);
  assert(O.atisBitis > Date.now(), "toplar dururken yeni atış olmamalı");
  if (O.sira === 0) assert.strictEqual(masa.isle_(ben, null, { t: "vur", yx: 1, yy: 0, guc: 0.5, ust: 0, yan: 0 }), "Toplar henüz durmadı");
  else assert.strictEqual(masa.isle_(ben, null, { t: "vur", yx: 1, yy: 0, guc: 0.5, ust: 0, yan: 0 }), "Sıra sende değil");
  // Elde top yokken beyaz yerleştirilemez
  O.atisBitis = 0; O.sira = 0; O.elde = false;
  if (O.toplar[0]) assert.strictEqual(masa.isle_(ben, null, { t: "vur", yx: 1, yy: 0, guc: 0.3, ust: 0, yan: 0, beyaz: { x: 300, y: 100 } }), "Beyazı sadece elde top varken yerleştirebilirsin");
  // Kalkınca (insan kalmadı) masa boşalır
  masa.isle_(ben, null, { t: "kalk" });
  masa.kopuklariIsle();
  assert.deepStrictEqual(masa.m.koltuklar, [null, null, null, null]);
  assert.strictEqual(masa.m.oyun, null);
}
// 3) Oyun sürerken bot çıkarma, oyuncu kaldırma, oyunu bitirme
{
  const masa = masaKur();
  await bekle();
  const ben = { kim: "m:abcdefghijkl", ad: "Ali" };
  const veli = { kim: "m:velivelivel1", ad: "Veli" };
  masa.olaylar = [];
  masa.isle_(ben, { serializeAttachment() { } }, { t: "otur", koltuk: 0 });
  masa.isle_(veli, { serializeAttachment() { } }, { t: "otur", koltuk: 1 });
  masa.isle_(ben, null, { t: "bot", koltuk: 3 });
  masa.m.kiran = 1;
  assert.strictEqual(masa.isle_(ben, null, { t: "basla" }), undefined);
  const O = masa.m.oyun;
  O.sira = 3; O.son[1] = 3;   // sıra botta
  // Bot çıkınca sıra takım arkadaşına (Veli) geçer, oyun sürer
  assert.strictEqual(masa.isle_(veli, null, { t: "botCikar", koltuk: 3 }), undefined);
  assert.strictEqual(masa.m.koltuklar[3], null);
  assert.strictEqual(masa.m.oyun.sira, 1);
  // Kuran olmayan kaldıramaz; kuran kaldırınca o takımda kimse kalmaz, oyun biter
  assert.match(masa.isle_(veli, null, { t: "kaldir", koltuk: 0 }), /masayı kuran/);
  assert.strictEqual(masa.isle_(ben, null, { t: "kaldir", koltuk: 1 }), undefined);
  assert.strictEqual(masa.m.koltuklar[1], null);
  assert.strictEqual(masa.m.oyun, null);
  // Oyunu bitir
  masa.isle_(ben, null, { t: "bot", koltuk: 1 });
  masa.isle_(ben, null, { t: "basla" });
  assert(masa.m.oyun);
  assert.strictEqual(masa.isle_(ben, null, { t: "bitir" }), undefined);
  assert.strictEqual(masa.m.oyun, null);
}
console.log("bilardo masası: tamam");
