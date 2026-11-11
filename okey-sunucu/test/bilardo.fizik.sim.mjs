// Bilardo motoru benzetimi (sunucusuz): iki bot birbirine karşı çok sayıda oyun oynar.
// Denetlenen: toplar hep masada ya da delikte (NaN yok, bantların dışında duran yok), duran toplar birbirine binmiyor,
// her oyun bitiyor, atış süreleri makul. Çalıştırma: node test/bilardo.fizik.sim.mjs [oyun sayısı]
import assert from "node:assert";
import F from "../../js/bilardo/fizik.js";

const OYUN = Number(process.argv[2]) || 30;
let tohum = 12345;
const rastgele = () => ((tohum = (tohum * 1103515245 + 12345) % 2147483648) / 2147483648);

let agizda = 0, atisSayisi = 0,enUzunMs = 0, toplamMs = 0, kazananlar = [0, 0], faullar = 0, kirilistaGiren = 0;
const nedenler = {};
for (let oyun = 0; oyun < OYUN; oyun++) {
  let toplar = F.diz(rastgele);
  let gruplar = [null, null], takim = oyun % 2, kirilis = true, elde = false, bitti = false, atis = 0;
  while (!bitti) {
    assert(atis++ < 400, "oyun bitmedi");
    const a = F.botAtisi({ toplar, gruplar, kirilis, elde, takim }, rastgele);
    const once = toplar.slice();
    if (a.beyaz) {
      assert(F.yerBos(once, a.beyaz.x, a.beyaz.y, 0) || kirilis, "beyaz geçersiz yere kondu");
      once[0] = a.beyaz;
    }
    const t0 = performance.now();
    const s = F.sonuna(once, a);
    const ms = performance.now() - t0;
    toplamMs += ms; enUzunMs = Math.max(enUzunMs, ms); atisSayisi++;
    assert(s.sure < 40, "atış bitmedi");
    s.toplar.forEach((t, i) => {
      if (!t) return;
      assert(Number.isFinite(t.x) && Number.isFinite(t.y), "NaN");
      // Delik ağzında (çenelerin arasında) asılı kalan top bantların dışına taşabilir; ama hiçbir banda binmez
      assert(t.x >= -20 && t.x <= F.W + 20 && t.y >= -25 && t.y <= F.H + 25, "top masanın dışında: " + i + " " + t.x + "," + t.y);
      for (const [x1, y1, x2, y2] of F.BANTLAR) {
        const ex = x2 - x1, ey = y2 - y1;
        const u = Math.max(0, Math.min(1, ((t.x - x1) * ex + (t.y - y1) * ey) / (ex * ex + ey * ey)));
        assert((t.x - x1 - ex * u) ** 2 + (t.y - y1 - ey * u) ** 2 >= (F.R - 0.6) ** 2, "top banda binmiş: " + i);
      }
      if (t.x < F.R - 1 || t.x > F.W - F.R + 1 || t.y < F.R - 1 || t.y > F.H - F.R + 1) agizda++;
      s.toplar.forEach((u, j) => { if (u && j > i) assert((t.x - u.x) ** 2 + (t.y - u.y) ** 2 > (2 * F.R - 0.5) ** 2, "toplar iç içe"); });
    });
    const k = F.kural({ gruplar, kirilis, toplar: once }, s, takim);
    if (kirilis) kirilistaGiren += s.giren.filter((g) => g.top !== 0).length;
    toplar = s.toplar;
    if (k.siyahGeri) toplar[8] = F.siyahiKoy(toplar);
    gruplar = k.gruplar;
    if (k.faul) { faullar++; nedenler[k.faul] = (nedenler[k.faul] || 0) + 1; }
    kirilis = false;
    if (k.kazanan !== null) { kazananlar[k.kazanan]++; nedenler[k.neden] = (nedenler[k.neden] || 0) + 1; bitti = true; break; }
    elde = !!k.faul;
    if (elde && !toplar[0]) toplar[0] = null;
    if (!k.devam) takim = 1 - takim;
  }
}
console.log({ OYUN, atisSayisi, ortalamaAtis: (atisSayisi / OYUN).toFixed(1), ortMs: (toplamMs / atisSayisi).toFixed(2), enUzunMs: enUzunMs.toFixed(1),
  kazananlar, faullar, agizda,kirilistaOrtGiren: (kirilistaGiren / OYUN).toFixed(2), nedenler });
