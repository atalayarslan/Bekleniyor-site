// Botlu masa uçtan uca deneme: 1 oyuncu oturur, 3 bot ekler, bir el oynanır (botlar sunucuda oynar).
// Çalıştırma: node test/bot.test.mjs [adres]   (varsayılan http://127.0.0.1:8787)
import assert from "node:assert";

const ADRES = process.argv[2] || "http://127.0.0.1:8787";
const ODA = "bot-" + Date.now().toString(36);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let basarili = 0;
const adim = (ad) => { basarili++; console.log("✓ " + ad); };

function baglan(ad) {
  const ws = new WebSocket(ADRES.replace(/^http/, "ws") + "/masa/" + ODA, { headers: { Origin: "http://localhost:8002" } });
  const istemci = { ad, ws, durum: null, olaylar: [], hatalar: [] };
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.t === "guncel") { istemci.durum = m.durum; istemci.olaylar.push(...m.olaylar); }
    if (m.t === "hata") istemci.hatalar.push(m.metin);
  });
  istemci.gonder = (o) => ws.send(JSON.stringify(o));
  istemci.hazir = new Promise((r) => ws.addEventListener("open", () => {
    istemci.gonder({ t: "merhaba", misafir: { id: (ad + "x".repeat(12)).toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 16), ad } });
    r();
  }));
  return istemci;
}

const ben = baglan("Slash");
const izleyici = baglan("Deniz");
await Promise.all([ben.hazir, izleyici.hazir]);
await bekle(300);

izleyici.gonder({ t: "bot", koltuk: 1 });
ben.gonder({ t: "otur", koltuk: 0 });
await bekle(300);
assert.ok(izleyici.hatalar.includes("Bot eklemek için önce masaya otur"));
for (const h of [1, 2, 3]) ben.gonder({ t: "bot", koltuk: h });
ben.gonder({ t: "bot", koltuk: 1 });
await bekle(400);
assert.deepStrictEqual(ben.durum.koltuklar.map((k) => !!k.bot), [false, true, true, true]);
assert.ok(ben.durum.koltuklar.slice(1).every((k) => k.bagli && k.ad.startsWith("Bot ")));
assert.ok(ben.hatalar.includes("Bu koltuk dolu"));
adim("izleyici bot ekleyemedi; oturan 3 bot ekledi; dolu koltuğa ikinci bot konmadı");

ben.gonder({ t: "basla" });
await bekle(400);
assert.ok(ben.durum.el && !ben.durum.el.bitti, "el başlamadı");
ben.gonder({ t: "botCikar", koltuk: 2 });
await bekle(300);
assert.ok(ben.hatalar.some((h) => h.startsWith("El sürerken bot çıkarılamaz")));
adim("el başladı; el sürerken bot çıkarılamadı");

// Ben sırası gelince çekip son taşı atarım; botlar kendi oynar. Bir ara izleyici 3. koltuktaki botun yerine oturur.
const bas = Date.now();
let devraldi = false, benimTur = 0;
while (!ben.durum.el.bitti && Date.now() - bas < 240000) {
  const d = ben.durum.el;
  if (!devraldi && benimTur === 3) { izleyici.gonder({ t: "otur", koltuk: 3 }); devraldi = true; await bekle(300); }
  const oyuncu = d.sira === 0 ? ben : devraldi && d.sira === 3 ? izleyici : null;
  if (oyuncu) {
    if (d.asama === "cek") { oyuncu.gonder({ t: "cek" }); await bekle(150); }
    const e = oyuncu.durum.el;
    if (!e.bitti && e.sira === d.sira && e.asama === "at") {
      const tas = e.taslar.filter((t) => !(t.r === e.okey.r && t.n === e.okey.n && !t.sahte)).pop() || e.taslar[0];
      oyuncu.gonder({ t: "at", id: tas.id });
      if (oyuncu === ben) benimTur++;
    }
  }
  await bekle(150);
  const g = ben.durum.el;
  const toplam = g.desteSayisi + g.tasSayilari.reduce((a, b) => a + b, 0) + g.atilanlar.flat().length + g.perler.reduce((a, p) => a + p.taslar.length, 0) + (g.gostergeMasada ? 1 : 0);
  assert.strictEqual(toplam, 106, "taş sayısı bozuldu: " + toplam);
}
const son = ben.durum;
assert.ok(son.el.bitti, "el bitmedi");
assert.strictEqual(son.koltuklar[3].ad, "Deniz");
const botHamleleri = ben.olaylar.filter((o) => (o.tur === "at" || o.tur === "cek" || o.tur === "soldanAl") && (o.k === 1 || o.k === 2)).length;
assert.ok(botHamleleri > 10, "botlar oynamadı");
adim("el bitti (" + Math.round((Date.now() - bas) / 1000) + " sn, " + benimTur + " turum): " + son.el.sonuc.baslik +
  " · bot hamlesi " + botHamleleri + " · açış " + ben.olaylar.filter((o) => o.tur === "acti").length + " · izleyici botun elini devraldı");

ben.gonder({ t: "botCikar", koltuk: 2 });
await bekle(300);
assert.ok(ben.durum.koltuklar[2].bos);
adim("el bitince bot çıkarıldı");

ben.gonder({ t: "kalk" });
izleyici.gonder({ t: "kalk" });
await bekle(300);
assert.ok(ben.durum.koltuklar.every((k) => k.bos), "insanlar kalkınca botlar da kalkmalı");
adim("herkes kalkınca botlar da kalktı");

console.log("\n" + basarili + " adım geçti");
for (const o of [ben, izleyici]) try { o.ws.close(); } catch (e) { }
process.exit(0);
