// Okey masasında yönetim denemesi (sunucusuz): oyunu bitirme, oyuncuyu masadan kaldırma, el sürerken bot çıkarma.
// Yetki: masayı kuran (ilk oturan) ya da oda sahibi. Çalıştırma: node test/yonetim.test.mjs
import assert from "node:assert";
import { OkeyMasasi } from "../src/masa.js";

const depo = new Map();
const soketler = [];
const ctx = {
  storage: { get: async (a) => depo.get(a), put: async (a, v) => { depo.set(a, v); }, setAlarm: () => { }, deleteAlarm: () => { } },
  getWebSockets: () => soketler,
  blockConcurrencyWhile: (f) => f()
};
function soket() {
  let ek = null;
  const ws = { giden: [], send: (s) => ws.giden.push(JSON.parse(s)), serializeAttachment: (a) => { ek = a; }, deserializeAttachment: () => ek };
  soketler.push(ws);
  return ws;
}
const masa = new OkeyMasasi(ctx, { MISAFIR_IZNI: "1" });
await new Promise((r) => setTimeout(r, 10));
const gonder = (ws, m) => masa.webSocketMessage(ws, JSON.stringify(m));
const hata = (ws) => { const h = ws.giden.filter((x) => x.t === "hata").at(-1); return h && h.metin; };

const ali = soket(), veli = soket();
await gonder(ali, { t: "merhaba", misafir: { id: "aliali123456", ad: "Ali" } });
await gonder(veli, { t: "merhaba", misafir: { id: "veliveli1234", ad: "Veli" } });
await gonder(ali, { t: "otur", koltuk: 0 });          // Ali masayı kurar
await gonder(veli, { t: "otur", koltuk: 1 });
await gonder(ali, { t: "bot", koltuk: 2 });
await gonder(ali, { t: "bot", koltuk: 3 });
assert.strictEqual(masa.m.kurucu, "m:aliali123456");

// Kuran olmayan kaldıramaz ve bitiremez
await gonder(veli, { t: "kaldir", koltuk: 0 });
assert.match(hata(veli), /masayı kuran/);
// Kendini kaldıramaz
await gonder(ali, { t: "kaldir", koltuk: 0 });
assert.match(hata(ali), /Kalk/);

// El başlar
await gonder(ali, { t: "basla" });
assert.ok(masa.m.el && !masa.m.el.bitti, "el başlamadı");

// El sürerken bot çıkarılırsa el bitince kalkar (o zamana kadar oynar)
await gonder(veli, { t: "botCikar", koltuk: 2 });
assert.strictEqual(masa.m.koltuklar[2].cikacak, true);
assert.ok(masa.m.koltuklar[2].bot, "bot hemen kalkmamalı");
const g = veli.giden.filter((x) => x.t === "guncel").at(-1);
assert.strictEqual(g.durum.koltuklar[2].cikacak, true);

// El sürerken oyuncu kaldırılırsa eli masada kalır, koltuk devralınabilir olur
await gonder(ali, { t: "kaldir", koltuk: 1 });
assert.strictEqual(masa.m.koltuklar[1].kim, "bos:1");
assert.ok(masa.m.el && !masa.m.el.bitti, "el sürmeli");
assert.ok(ali.giden.at(-1).durum.koltuklar[1].devralinabilir, "koltuk devralınabilir olmalı");

// Oyunu bitir: el kapanır, kalkanın tutulan koltuğu ve kalkacak bot boşalır
await gonder(veli, { t: "bitir" });
assert.match(hata(veli), /masayı kuran/);
await gonder(ali, { t: "bitir" });
assert.strictEqual(masa.m.el, null);
assert.strictEqual(masa.m.koltuklar[1], null);
assert.strictEqual(masa.m.koltuklar[2], null);
assert.ok(masa.m.koltuklar[3] && masa.m.koltuklar[3].bot, "çıkarılmayan bot kalır");
assert.ok(!masa.m.oyun || masa.m.oyun.bitis, "oyun bitmiş olmalı");
await gonder(ali, { t: "bitir" });
assert.match(hata(ali), /Süren oyun yok/);

// El yokken kaldırma: koltuk hemen boşalır
await gonder(veli, { t: "otur", koltuk: 1 });
await gonder(ali, { t: "kaldir", koltuk: 1 });
assert.strictEqual(masa.m.koltuklar[1], null);

// El yokken bot çıkarma: hemen kalkar
await gonder(ali, { t: "botCikar", koltuk: 3 });
assert.strictEqual(masa.m.koltuklar[3], null);

console.log("okey yönetim: tamam");
