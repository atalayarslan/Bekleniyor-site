// Okey sunucusu uçtan uca deneme: yerel sunucuya (npx wrangler dev) 4 oyuncu + 1 izleyici bağlanır, bir el oynanır.
// Çalıştırma: node test/masa.test.mjs [adres]   (varsayılan http://127.0.0.1:8787)
import assert from "node:assert";

const ADRES = process.argv[2] || "http://127.0.0.1:8787";
const ODA = "test-" + Date.now().toString(36);
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

const oyuncular = ["Slash", "Murat", "Ali", "Zeynep"].map(baglan);
const izleyici = baglan("Deniz");
await Promise.all([...oyuncular, izleyici].map((o) => o.hazir));
await bekle(300);

// Koltuklar
oyuncular.forEach((o, i) => o.gonder({ t: "otur", koltuk: i }));
await bekle(300);
assert.deepStrictEqual(oyuncular[0].durum.koltuklar.map((k) => k.ad), ["Slash", "Murat", "Ali", "Zeynep"]);
adim("4 kişi oturdu");

// Oyuncu yancı olamaz; izleyici olabilir
oyuncular[1].gonder({ t: "yanci", koltuk: 2 });
izleyici.gonder({ t: "yanci", koltuk: 2 });
izleyici.gonder({ t: "otur", koltuk: 1 });      // dolu koltuk
await bekle(300);
assert.ok(oyuncular[1].hatalar.includes("Oyuncular yancı olamaz"));
assert.ok(izleyici.hatalar.includes("Bu koltuk dolu"));
adim("oyuncu yancı olamadı, dolu koltuğa oturulamadı");

// Başla
oyuncular[0].gonder({ t: "basla" });
await bekle(400);
const d0 = oyuncular[0].durum.el;
assert.ok(d0, "el başlamadı");
assert.deepStrictEqual(d0.tasSayilari, [22, 21, 21, 21]);
assert.strictEqual(oyuncular[0].durum.el.taslar.length, 22);
assert.strictEqual(oyuncular[1].durum.el.taslar.length, 21);
const ids = (o) => o.durum.el.taslar.map((t) => t.id).sort().join();
assert.notStrictEqual(ids(oyuncular[0]), ids(oyuncular[1]));
assert.strictEqual(ids(izleyici), ids(oyuncular[2]), "yancı oturduğu oyuncunun taşlarını görmeli");
assert.ok(!JSON.stringify(oyuncular[1].durum).includes(oyuncular[0].durum.el.taslar[0].id) ||
  oyuncular[1].durum.el.atilanlar.flat().some((t) => t.id === oyuncular[0].durum.el.taslar[0].id), "başkasının taşı görünmemeli");
adim("dağıtım 22/21/21/21; herkes sadece kendi taşını, yancı Ali'nin taşını görüyor");

// Sıra dışı hamle reddedilir
oyuncular[1].gonder({ t: "cek" });
await bekle(200);
assert.ok(oyuncular[1].hatalar.includes("Sıra sende değil"));
oyuncular[0].gonder({ t: "ac", gruplar: [[oyuncular[0].durum.el.taslar[0].id, oyuncular[0].durum.el.taslar[1].id, oyuncular[0].durum.el.taslar[2].id]] });
await bekle(200);
assert.ok(oyuncular[0].hatalar.some((h) => /per|puan|çift/i.test(h)), "geçersiz açış reddedilmeli: " + oyuncular[0].hatalar.join(" | "));
adim("sıra dışı çekme ve geçersiz açış reddedildi");

// Eli sonuna kadar oyna: sırası gelen desteden çeker, son taşını atar
let tur = 0;
while (!oyuncular[0].durum.el.bitti && tur < 400) {
  const d = oyuncular[0].durum.el;
  const s = oyuncular[d.sira];
  if (d.asama === "cek") s.gonder({ t: "cek" });
  await bekle(25);
  const el = s.durum.el;
  if (el.bitti) break;
  const okey = el.okey;
  const tas = el.taslar.filter((t) => !(t.r === okey.r && t.n === okey.n && !t.sahte)).pop() || el.taslar[0];
  s.gonder({ t: "at", id: tas.id });
  await bekle(25);
  tur++;
  // her an: görünen bütün taşların toplamı 106 (deste + eller + atılanlar + perler + gösterge)
  const g = oyuncular[0].durum.el;
  const toplam = g.desteSayisi + g.tasSayilari.reduce((a, b) => a + b, 0) + g.atilanlar.flat().length + g.perler.reduce((a, p) => a + p.taslar.length, 0) + (g.gostergeMasada ? 1 : 0);
  assert.strictEqual(toplam, 106, "taş sayısı bozuldu: " + toplam);
}
const son = oyuncular[0].durum;
assert.ok(son.el.bitti, "el bitmedi");
assert.strictEqual(son.oyun.eller.length, 1);
adim("el sonuna kadar oynandı (" + tur + " tur), taş sayısı hep 106: " + son.el.sonuc.baslik);

// Çetele herkese açık
const cetele = await (await fetch(ADRES + "/cetele/" + ODA, { headers: { Origin: "http://localhost:8002" } })).json();
assert.strictEqual(cetele.oyunlar.length, 1);
assert.strictEqual(cetele.oyunlar[0].eller.length, 1);
adim("çetele kaydedildi ve okunabiliyor");

// Bağlantı kopunca koltuk tutulur, geri gelince aynı koltuk
oyuncular[3].ws.close();
await bekle(300);
assert.strictEqual(oyuncular[0].durum.koltuklar[3].bagli, false);
const geriGelen = baglan("Zeynep");
await geriGelen.hazir;
await bekle(300);
assert.strictEqual(geriGelen.durum.ben.koltuk, 3);
assert.strictEqual(oyuncular[0].durum.koltuklar[3].bagli, true);
adim("kopan oyuncu geri gelince koltuğuna döndü");

console.log("\n" + basarili + " adım geçti");
for (const o of [...oyuncular, izleyici, geriGelen]) try { o.ws.close(); } catch (e) { }
process.exit(0);
