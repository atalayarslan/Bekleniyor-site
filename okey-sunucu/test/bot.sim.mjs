// Bot benzetimi (sunucusuz): masa sınıfı sahte depolamayla kurulur, 4 koltuğa bot oturur ve çok sayıda el oynanır.
// Her hamleden sonra taş sayısı (106) denetlenir; botların açıp bitirebildiği görülür.
// Çalıştırma: node test/bot.sim.mjs [el sayısı]   (varsayılan 200)
import assert from "node:assert";
import { OkeyMasasi } from "../src/masa.js";

const EL = Number(process.argv[2]) || 200;
const depo = new Map();
const ctx = {
  storage: {
    get: async (a) => depo.get(a), put: async (a, v) => { depo.set(a, v); },
    setAlarm: () => { }, deleteAlarm: () => { }
  },
  getWebSockets: () => [],
  blockConcurrencyWhile: (f) => f()
};
const masa = new OkeyMasasi(ctx, {});
await new Promise((r) => setTimeout(r, 10));
masa.m.ayar.elSayisi = 0;
masa.m.koltuklar = [0, 1, 2, 3].map((h) => ({ kim: "bot:" + h, ad: "Bot " + h, foto: "", ayrildi: null, bot: true }));

const say = { bitirdi: 0, deste: 0, acti: 0, isledi: 0, hamle: 0 };
for (let el = 0; el < EL; el++) {
  masa.olaylar = [];
  masa.yeniEl();
  const E = masa.m.el;
  while (!E.bitti) {
    E.sureBitis = 0;
    masa.olaylar = [];
    await masa.alarm();
    say.hamle++;
    assert.ok(say.hamle < EL * 200, "el bitmiyor");
    for (const o of masa.olaylar) { if (o.tur === "acti") say.acti++; if (o.tur === "isledi") say.isledi++; }
    const toplam = E.deste.length + E.eller.reduce((a, x) => a + x.length, 0) + E.atilanlar.flat().length +
      E.perler.reduce((a, p) => a + p.taslar.length, 0) + (E.gostergeMasada ? 1 : 0);
    assert.strictEqual(toplam, 106, "taş sayısı bozuldu: " + toplam);
    assert.strictEqual(new Set([...E.deste, ...E.eller.flat(), ...E.atilanlar.flat(), ...E.perler.flatMap((p) => p.taslar)].map((t) => t.id)).size,
      toplam - (E.gostergeMasada ? 1 : 0) - E.perler.filter((p) => p.taslar.includes(E.gosterge)).length, "aynı taş iki yerde");
  }
  if (E.sonuc.bitiren == null) say.deste++; else say.bitirdi++;
}
console.log(EL + " el: " + say.bitirdi + " bot bitirdi, " + say.deste + " deste bitti · " + say.acti + " açış, " + say.isledi + " işleme · " + say.hamle + " hamle");
assert.ok(say.acti > 0 && say.bitirdi > 0, "botlar hiç açmadı/bitirmedi");
console.log("✓ bot benzetimi geçti");
