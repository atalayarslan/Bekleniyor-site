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
const masa = new OkeyMasasi(ctx, { MISAFIR_IZNI: "1" });   // yerel deneme: misafir kimliği kabul edilir
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
assert.strictEqual(son[0].devralinabilir, true, "bağlantısı olmayanın yerine hemen bot konabilmeli");
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
// Siteyi kapatıp giden: el sürerken yerine hemen bot konabilir, sonra gelen botun yerine oturabilir
{
  const yedek = JSON.parse(JSON.stringify(masa.m.koltuklar[1]));
  const ws2 = soket();
  await masa.webSocketMessage(ws2, JSON.stringify({ t: "merhaba", misafir: { id: "denizdenizdeni", ad: "Deniz" } }));
  masa.m.koltuklar[0] = { kim: "m:denizdenizdeni", ad: "Deniz", foto: "", ayrildi: null };   // Deniz masada oturuyor
  await masa.webSocketMessage(ws2, JSON.stringify({ t: "bot", koltuk: 1 }));
  assert.ok(masa.m.koltuklar[1].bot, "gidenin yerine hemen bot konamadı");
  soketler.length = 0;
  masa.m.koltuklar[0] = { kim: "bot:0", ad: "Bot Ayşe", foto: "", ayrildi: null, bot: true };
  masa.m.koltuklar[1] = yedek;
  console.log("✓ siteyi kapatıp gidenin yerine beklemeden bot kondu");
}
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

// Canlı sunucu (MISAFIR_IZNI yok): kimlik kartsız ya da sahte kartla gelen bağlanamaz, hiçbir şey görmez
{
  const canli = new OkeyMasasi(ctx, {});
  await new Promise((r) => setTimeout(r, 10));
  const sahteKart = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.aW1aYQ";
  for (const mesaj of [{ t: "merhaba", misafir: { id: "kotukotukotu", ad: "Kötü" } }, { t: "merhaba", kart: sahteKart }]) {
    const w = soket();
    let kapandi = false;
    w.close = () => { kapandi = true; };
    await canli.webSocketMessage(w, JSON.stringify(mesaj));
    assert.ok(kapandi, "girişsiz bağlantı kapatılmadı");
    assert.ok(!w.deserializeAttachment(), "girişsiz bağlantıya kimlik verildi");
    assert.ok(w.giden.every((m) => m.t === "hata"), "girişsiz bağlantıya masa durumu gitti");
    await canli.webSocketMessage(w, JSON.stringify({ t: "otur", koltuk: 0 }));
    assert.ok(!canli.m.koltuklar[0] || canli.m.koltuklar[0].kim !== "m:kotukotukotu", "girişsiz biri oturdu");
  }
  console.log("✓ canlı ayarda misafir ve sahte kimlik kartı reddedildi, masa durumu gönderilmedi");
}
console.log("\n✓ kopuk koltuk denemesi geçti");
