// Kopuk koltuk denemesi (sunucusuz): sunucu güncellenince kapanış haberi gelmeden düşen oyuncunun koltuğu
// sonsuza dek "bağlantı yok" kalmamalı; işaretlenir, tutma süresi geçince boşalır, insan kalmadıysa botlar da kalkar.
// Çalıştırma: node test/kopuk.test.mjs
import assert from "node:assert";
import { OkeyMasasi } from "../src/masa.js";

const depo = new Map();
const soketler = [];
let alarm = null;
const ctx = {
  storage: {
    get: async (a) => depo.get(a), put: async (a, v) => { depo.set(a, v); },
    setAlarm: (z) => { alarm = z; }, deleteAlarm: () => { alarm = null; }
  },
  getWebSockets: () => soketler,
  blockConcurrencyWhile: (f) => f()
};
function soket() {
  let ek = null;
  const ws = { giden: [], send: (s) => ws.giden.push(JSON.parse(s)), serializeAttachment: (a) => { ek = a; }, deserializeAttachment: () => ek };
  soketler.push(ws);
  return ws;
}
const masa = new OkeyMasasi(ctx, {});
await new Promise((r) => setTimeout(r, 10));

// Önceki sunucudan kalan masa: A oturuyor ama bağlı değil ve ayrıldı zamanı yok; Slash'ın yanında bir bot var
masa.m.koltuklar = [
  { kim: "m:aaaaaaaaaaaa", ad: "A", foto: "", ayrildi: null },
  null,
  { kim: "bot:2", ad: "Bot Zeynep", foto: "", ayrildi: null, bot: true },
  null
];

const ws = soket();
await masa.webSocketMessage(ws, JSON.stringify({ t: "merhaba", misafir: { id: "slashslashsl", ad: "Slash" } }));
await masa.webSocketMessage(ws, JSON.stringify({ t: "otur", koltuk: 1 }));
assert.ok(masa.m.koltuklar[0].ayrildi > 0, "kopuk A işaretlenmedi");
assert.ok(alarm && alarm >= masa.m.koltuklar[0].ayrildi + 119000, "boşalma alarmı kurulmadı");
let son = ws.giden.at(-1).durum.koltuklar;
assert.strictEqual(son[0].bagli, false);
assert.strictEqual(son[0].devralinabilir, false);
console.log("✓ kapanış haberi gelmeden düşen A işaretlendi, 2 dk sonrası için alarm kuruldu");

// Süre geçmiş gibi: alarm çalar, A'nın koltuğu boşalır, Slash ve bot kalır
masa.m.koltuklar[0].ayrildi -= 121000;
await masa.alarm();
son = ws.giden.at(-1).durum.koltuklar;
assert.ok(son[0].bos, "A'nın koltuğu boşalmadı");
assert.ok(!son[1].bos && !son[2].bos && son[2].bot);
assert.strictEqual(alarm, null, "gereksiz alarm kaldı");
console.log("✓ tutma süresi geçince A'nın koltuğu boşaldı");

// El sürerken düşen oyuncunun koltuğu boşalmaz, el bitince boşalır
for (const h of [0, 3]) await masa.webSocketMessage(ws, JSON.stringify({ t: "bot", koltuk: h }));
await masa.webSocketMessage(ws, JSON.stringify({ t: "basla" }));
assert.ok(masa.m.el && !masa.m.el.bitti, "el başlamadı");
soketler.length = 0;
await masa.webSocketClose(ws);
assert.ok(masa.m.koltuklar[1].ayrildi > 0);
masa.m.koltuklar[1].ayrildi -= 121000;
masa.m.el.sureBitis = Date.now() + 60000;
await masa.alarm();
assert.ok(masa.m.koltuklar[1] && !masa.m.koltuklar[1].bot, "el sürerken koltuk boşaldı");
assert.strictEqual(alarm, masa.m.el.sureBitis, "el sürerken alarm tur süresine kurulmalı");
console.log("✓ el sürerken kopanın koltuğu (ve eli) yerinde kaldı");

masa.olaylar = [];
masa.elKapat(null, null, [0, 0, 0, 0], "deneme");
assert.ok(alarm != null && alarm <= Date.now(), "el bitince boşalma alarmı kurulmadı");
await masa.alarm();
assert.ok(masa.m.koltuklar.every((x) => x === null), "insan kalmayınca botlar da kalkmalı");
assert.ok(masa.m.oyun.bitis, "yarım oyun kapanmadı");
console.log("✓ el bitince kopanın koltuğu boşaldı, masada insan kalmadığı için botlar da kalktı");
console.log("\n✓ kopuk koltuk denemesi geçti");
