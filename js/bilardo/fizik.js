// Bekleniyor Bilardo (8 top) — fizik, kural ve bot motoru. Ekrandan bağımsızdır (DOM kullanmaz):
// tarayıcıda window.BilardoFizik, sunucuda (bilardo masası) import edilir.
//
// Atışı sunucu hesaplar; herkes aynı atışı kendi ekranında aynı motorla baştan oynatır. Bunun için benzetim sadece
// + − × ÷ ve Math.sqrt kullanır (bunlar her tarayıcıda ve sunucuda bit bit aynı sonucu verir; sin/cos/exp vermez).
// Böylece hareket herkesin ekranında birebir aynıdır; sondaki konumları yine de sunucu söyler.
//
// Masa: oyun alanı 1000 × 500 (bantların iç kenarı), sol üst köşe (0,0). Top yarıçapı 12.
// Toplar: 0 beyaz, 1–7 düz, 8 siyah, 9–15 çizgili. Konum dizisi: [{x,y} | null] × 16 (null: deliğe girmiş).

(function (kok) {
  "use strict";

  const W = 1000, H = 500, R = 12;
  const KOSE = 34;            // köşe deliğinin ağzı: bant köşeden bu kadar uzakta biter
  const YAN = 26;             // yan deliğin ağzının yarısı
  const CENE = 16;            // köşe deliklerinin çeneleri (45°)
  const TOP_E = 0.97;         // top–top çarpışma esnekliği
  const BANT_E = 0.78;        // bant sekme esnekliği
  const BANT_SURTUNME = 0.97; // banda sürtünen topun yan hızı
  const YAVASLAMA = 70;       // sabit yavaşlama (birim/sn²)
  const DIRENC = 0.5;         // hızla orantılı yavaşlama (1/sn)
  const DUR = 3;              // bu hızın altında top durur
  const EN_AZ_HIZ = 80, EN_COK_HIZ = 3000;
  const AYAK = { x: W * 3 / 4, y: H / 2 };   // dizilişin ucu (siyah buraya geri konur)
  const KAFA_X = W / 4;                       // kırışta beyaz bu çizginin solunda durur

  // Delikler: merkezi masanın dışında; topun merkezi bu dairelere girince top deliğe düşer
  const CEPLER = [
    { x: -10, y: -10, r: 24 }, { x: W / 2, y: -22, r: 22 }, { x: W + 10, y: -10, r: 24 },
    { x: -10, y: H + 10, r: 24 }, { x: W / 2, y: H + 22, r: 22 }, { x: W + 10, y: H + 10, r: 24 }
  ];
  // Botun nişan aldığı yer: deliğin ağzı (masanın biraz içinde)
  const CEP_AGZI = [
    { x: 8, y: 8 }, { x: W / 2, y: -4 }, { x: W - 8, y: 8 },
    { x: 8, y: H - 8 }, { x: W / 2, y: H + 4 }, { x: W - 8, y: H - 8 }
  ];
  // Bantlar ve delik çeneleri: doğru parçaları (uçları yuvarlak sayılır)
  const BANTLAR = [
    [KOSE, 0, W / 2 - YAN, 0], [W / 2 + YAN, 0, W - KOSE, 0],
    [KOSE, H, W / 2 - YAN, H], [W / 2 + YAN, H, W - KOSE, H],
    [0, KOSE, 0, H - KOSE], [W, KOSE, W, H - KOSE],
    [KOSE, 0, KOSE - CENE, -CENE], [0, KOSE, -CENE, KOSE - CENE],
    [W - KOSE, 0, W - KOSE + CENE, -CENE], [W, KOSE, W + CENE, KOSE - CENE],
    [KOSE, H, KOSE - CENE, H + CENE], [0, H - KOSE, -CENE, H - KOSE + CENE],
    [W - KOSE, H, W - KOSE + CENE, H + CENE], [W, H - KOSE, W + CENE, H - KOSE + CENE],
    [W / 2 - YAN, 0, W / 2 - YAN + 4, -18], [W / 2 + YAN, 0, W / 2 + YAN - 4, -18],
    [W / 2 - YAN, H, W / 2 - YAN + 4, H + 18], [W / 2 + YAN, H, W / 2 + YAN - 4, H + 18]
  ];

  const BANT_DIZI = new Float64Array(BANTLAR.flat());

  const tur = (i) => (i === 0 ? "beyaz" : i === 8 ? "siyah" : i < 8 ? "duz" : "cizgili");
  const karsiGrup = (g) => (g === "duz" ? "cizgili" : "duz");

  // ---------- diziliş ----------
  // Üçgen, ucu ayak noktasında. Ortada (3. sıranın ortası) siyah; arka iki köşede biri düz biri çizgili.
  // rastgele: () => [0,1)
  function diz(rastgele) {
    const toplar = Array(16).fill(null);
    toplar[0] = { x: KAFA_X, y: H / 2 };
    const yerler = [];
    const ara = 2 * R + 0.04;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j <= i; j++) yerler.push({ x: AYAK.x + i * ara * 0.8660254037844386, y: H / 2 + (j - i / 2) * ara });
    }
    const karistir = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rastgele() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const duz = karistir([1, 2, 3, 4, 5, 6, 7]);
    const cizgili = karistir([9, 10, 11, 12, 13, 14, 15]);
    const koseler = rastgele() < 0.5 ? [duz.pop(), cizgili.pop()] : [cizgili.pop(), duz.pop()];
    toplar[8] = yerler[4];
    toplar[koseler[0]] = yerler[10];
    toplar[koseler[1]] = yerler[14];
    const kalan = karistir(duz.concat(cizgili));
    [0, 1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13].forEach((y, n) => { toplar[kalan[n]] = yerler[y]; });
    return toplar;
  }

  // Bir topun konabileceği yer mi (masanın içinde, başka topa binmiyor)
  function yerBos(toplar, x, y, haric) {
    if (!(x >= R && x <= W - R && y >= R && y <= H - R)) return false;
    return toplar.every((t, i) => i === haric || !t || (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y) >= 4 * R * R);
  }

  // Siyah kırışta girerse ayak noktasına (doluysa ayak bandına doğru ilk boş yere) geri konur
  function siyahiKoy(toplar) {
    for (let x = AYAK.x; x <= W - R; x += 1) if (yerBos(toplar, x, AYAK.y, 8)) return { x, y: AYAK.y };
    for (let x = AYAK.x; x >= R; x -= 1) if (yerBos(toplar, x, AYAK.y, 8)) return { x, y: AYAK.y };
    return { x: AYAK.x, y: AYAK.y };
  }

  // ---------- benzetim ----------
  // atis: { yx, yy (birim yön), guc 0–1, ust −1..1 (üstten vuruş: takip, alttan: geri çekme), yan −1..1 (sağ/sol falso) }
  // adim() bir adım ilerler ve o adımdaki olayları döndürür: { tur: "top"|"bant"|"cep", ... , hiz }.
  // Sonuç alanları: ilk (beyazın ilk değdiği top), giren [{top, cep}], bantSonra (ilk değmeden sonra banta giden oldu mu).
  function Benzetim(baslangic, atis) {
    const b = baslangic.map((t) => (t ? { x: t.x, y: t.y, vx: 0, vy: 0, var: true } : { x: 0, y: 0, vx: 0, vy: 0, var: false }));
    const hiz = EN_AZ_HIZ + (EN_COK_HIZ - EN_AZ_HIZ) * atis.guc;
    b[0].vx = atis.yx * hiz;
    b[0].vy = atis.yy * hiz;
    let ust = atis.ust, yan = atis.yan, yol = 0;
    const s = { t: 0, bitti: false, ilk: null, giren: [], bantSonra: false, toplar: b };

    s.adim = function () {
      const olaylar = [];
      let vmax2 = 0;
      for (const t of b) if (t.var) { const v2 = t.vx * t.vx + t.vy * t.vy; if (v2 > vmax2) vmax2 = v2; }
      if (vmax2 === 0) { s.bitti = true; return olaylar; }
      const vmax = Math.sqrt(vmax2);
      const dt = Math.min(1 / 120, 0.35 * R / vmax);

      // hareket
      for (let i = 0; i < 16; i++) {
        const t = b[i];
        if (!t.var || (t.vx === 0 && t.vy === 0)) continue;
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        if (i === 0 && s.ilk === null) yol += Math.sqrt(t.vx * t.vx + t.vy * t.vy) * dt;
      }

      // top–top
      for (let i = 0; i < 16; i++) {
        const p = b[i];
        if (!p.var) continue;
        for (let j = i + 1; j < 16; j++) {
          const q = b[j];
          if (!q.var) continue;
          if (p.vx === 0 && p.vy === 0 && q.vx === 0 && q.vy === 0) continue;
          const dx = q.x - p.x, dy = q.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= 4 * R * R) continue;
          let d = Math.sqrt(d2), nx, ny;
          if (d === 0) { nx = 1; ny = 0; d = 0; } else { nx = dx / d; ny = dy / d; }
          const yakin = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
          const bin = (2 * R - d) / 2;
          p.x -= nx * bin; p.y -= ny * bin;
          q.x += nx * bin; q.y += ny * bin;
          if (yakin <= 0) continue;
          const beyaz = i === 0 ? p : null;
          const once = beyaz ? { vx: p.vx, vy: p.vy } : null;
          const darbe = yakin * (1 + TOP_E) / 2;
          p.vx -= darbe * nx; p.vy -= darbe * ny;
          q.vx += darbe * nx; q.vy += darbe * ny;
          olaylar.push({ tur: "top", a: i, b: j, hiz: yakin });
          if (i === 0 && s.ilk === null) {
            s.ilk = j;
            // Takip / geri çekme: beyaz ilk topa değince eski yönünde bir hız kazanır (ileri ya da geri).
            // Yakın mesafede vuruş noktası belirler; uzakta top kendiliğinden yuvarlanmaya başlar (doğal takip).
            const sv = Math.sqrt(once.vx * once.vx + once.vy * once.vy);
            if (sv > 0) {
              const azalma = Math.max(0, 1 - yol / 900);
              let k = 0.28 + (ust * 0.6 - 0.28) * azalma;
              if (ust > 0) k = Math.max(k, ust * 0.45);
              p.vx += once.vx * k; p.vy += once.vy * k;
            }
            ust = 0;
          }
        }
      }

      // bantlar
      for (let i = 0; i < 16; i++) {
        const t = b[i];
        if (!t.var || (t.vx === 0 && t.vy === 0)) continue;
        // Kenarlardan uzaktaki top hiçbir banda değemez (çeneler de masanın dışında)
        if (t.x > R + 0.5 && t.x < W - R - 0.5 && t.y > R + 0.5 && t.y < H - R - 0.5) continue;
        for (let n = 0; n < BANT_DIZI.length; n += 4) {
          const x1 = BANT_DIZI[n], y1 = BANT_DIZI[n + 1];
          const ex = BANT_DIZI[n + 2] - x1, ey = BANT_DIZI[n + 3] - y1;
          let u = ((t.x - x1) * ex + (t.y - y1) * ey) / (ex * ex + ey * ey);
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const cx = x1 + ex * u, cy = y1 + ey * u;
          const dx = t.x - cx, dy = t.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const vn = t.vx * nx + t.vy * ny;
          t.x = cx + nx * R; t.y = cy + ny * R;
          if (vn >= 0) continue;
          const tx = t.vx - vn * nx, ty = t.vy - vn * ny;      // bant boyunca hız
          let yx = tx * BANT_SURTUNME - vn * BANT_E * nx;
          let yy = ty * BANT_SURTUNME - vn * BANT_E * ny;
          if (i === 0 && yan !== 0) {
            // Yan falso: beyaz bantta geliş yönünün sağına (ya da soluna) doğru biraz daha kayar
            const sv = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
            let rx = -t.vy / sv, ry = t.vx / sv;
            const rn = rx * nx + ry * ny;
            rx -= rn * nx; ry -= rn * ny;
            const rl = Math.sqrt(rx * rx + ry * ry);
            if (rl > 0.01) { yx += rx / rl * yan * -vn * 0.35; yy += ry / rl * yan * -vn * 0.35; }
            yan *= 0.5;
          }
          t.vx = yx; t.vy = yy;
          olaylar.push({ tur: "bant", top: i, hiz: -vn });
          if (s.ilk !== null) s.bantSonra = true;
        }
      }

      // delikler (masanın çok dışına çıkan olursa en yakın deliğe düşmüş sayılır)
      for (let i = 0; i < 16; i++) {
        const t = b[i];
        if (!t.var) continue;
        let cep = -1;
        for (let k = 0; k < 6; k++) {
          const c = CEPLER[k], dx = t.x - c.x, dy = t.y - c.y;
          if (dx * dx + dy * dy < c.r * c.r) { cep = k; break; }
        }
        // Merkezi bant çizgisini geçmiş top deliğin ağzındadır (bantlar orada yok): çenede asılı kalmasın, düşsün.
        // Masanın çok dışına çıkan olursa da en yakın deliğe düşmüş sayılır.
        if (cep < 0 && (t.x < R - 3 || t.x > W - R + 3 || t.y < R - 3 || t.y > H - R + 3)) {
          let en = Infinity;
          for (let k = 0; k < 6; k++) { const c = CEPLER[k], d = (t.x - c.x) * (t.x - c.x) + (t.y - c.y) * (t.y - c.y); if (d < en) { en = d; cep = k; } }
        }
        if (cep >= 0) {
          const hiz = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
          t.var = false; t.vx = 0; t.vy = 0;
          t.x = CEPLER[cep].x; t.y = CEPLER[cep].y;
          s.giren.push({ top: i, cep });
          olaylar.push({ tur: "cep", top: i, cep, hiz });
        }
      }

      // sürtünme
      for (const t of b) {
        if (!t.var || (t.vx === 0 && t.vy === 0)) continue;
        const sv = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
        const yeni = sv - (YAVASLAMA + DIRENC * sv) * dt;
        if (yeni <= DUR) { t.vx = 0; t.vy = 0; } else { t.vx *= yeni / sv; t.vy *= yeni / sv; }
      }
      s.t += dt;
      return olaylar;
    };

    // Son konumlar ([{x,y}|null])
    s.konumlar = () => b.map((t) => (t.var ? { x: t.x, y: t.y } : null));
    return s;
  }

  // Atışı sonuna kadar oynat (sunucu ve bot için). En çok 40 sn (sonsuz döngüye karşı).
  function sonuna(baslangic, atis) {
    const s = Benzetim(baslangic, atis);
    let adim = 0;
    while (!s.bitti && s.t < 40 && adim++ < 200000) s.adim();
    return { toplar: s.konumlar(), ilk: s.ilk, giren: s.giren, bantSonra: s.bantSonra, sure: s.t };
  }

  // ---------- kurallar ----------
  const kalanSay = (toplar, g) => toplar.reduce((n, t, i) => n + (t && i !== 0 && i !== 8 && tur(i) === g ? 1 : 0), 0);

  // Atışın kurallara göre sonucu. o: { gruplar: [takım0, takım1] ("duz"|"cizgili"|null), kirilis, toplar (atıştan önce),
  //   kural: "bar" (varsayılan) | "dunya" }
  //   Dünya kuralı (WPA/BCA): kırışta giren toplar grubu belirlemez; rakibin topunu (kendi topunla birlikte) sokmak serbest.
  //   Bar kuralı ("ne sokarsan o"): kırışta hangi gruptan çok top girdiyse o grup kıranın (eşitse masa açık kalır);
  //   gruplar belliyken rakibin topunu sokmak faul.
  // Döner: { faul (neden ya da null), devam (atan takım sıraya devam eder), kazanan (takım ya da null), neden, gruplar, siyahGeri }
  function kural(o, sonuc, takim) {
    const bar = o.kural !== "dunya";
    const rakip = 1 - takim;
    const benim = o.gruplar[takim];
    const siyahSirasi = !!benim && kalanSay(o.toplar, benim) === 0;
    const girenler = sonuc.giren.map((g) => g.top);
    const beyazGirdi = girenler.includes(0);
    const siyahGirdi = girenler.includes(8);
    const nesneler = girenler.filter((i) => i !== 0 && i !== 8);

    let faul = null;
    if (sonuc.ilk === null) faul = "Beyaz hiçbir topa değmedi";
    else if (!o.kirilis) {
      if (benim) {
        if (siyahSirasi ? sonuc.ilk !== 8 : tur(sonuc.ilk) !== benim) faul = siyahSirasi ? "Beyaz önce siyaha değmeliydi" : "Beyaz önce kendi grubundan bir topa değmedi";
      } else if (sonuc.ilk === 8) faul = "Beyaz önce siyaha değdi";
    }
    if (!faul && beyazGirdi) faul = "Beyaz deliğe girdi";
    if (!faul && !o.kirilis && !girenler.length && !sonuc.bantSonra) faul = "Değdikten sonra hiçbir top banda gitmedi";
    if (!faul && bar && benim && nesneler.some((i) => tur(i) !== benim)) faul = "Rakibin topunu soktu";

    let kazanan = null, neden = null;
    const siyahGeri = siyahGirdi && o.kirilis;
    if (siyahGirdi && !o.kirilis) {
      if (siyahSirasi && !faul) { kazanan = takim; neden = "Siyahı soktu"; }
      else { kazanan = rakip; neden = siyahSirasi ? "Siyahı sokarken faul yaptı" : "Siyahı erken soktu"; }
    }

    const gruplar = o.gruplar.slice();
    if (!faul && kazanan === null && !benim && nesneler.length && (bar || !o.kirilis)) {
      // Hangi gruptan çok girdiyse o; eşitse kırışta masa açık kalır, sonraki atışlarda ilk giren belirler
      const duz = nesneler.filter((i) => i < 8).length, cizgili = nesneler.length - duz;
      const secilen = duz > cizgili ? "duz" : cizgili > duz ? "cizgili" : o.kirilis ? null : tur(nesneler[0]);
      if (secilen) {
        gruplar[takim] = secilen;
        gruplar[rakip] = karsiGrup(secilen);
      }
    }
    const yeni = gruplar[takim];
    const devam = !faul && kazanan === null && (yeni ? nesneler.some((i) => tur(i) === yeni) : nesneler.length > 0);
    return { faul, devam, kazanan, neden, gruplar, siyahGeri };
  }

  // Takımın atışta ilk değebileceği toplar
  function hedefler(toplar, grup) {
    const sonuc = [];
    if (grup && kalanSay(toplar, grup) === 0) return toplar[8] ? [8] : [];
    for (let i = 1; i < 16; i++) if (toplar[i] && i !== 8 && (!grup || tur(i) === grup)) sonuc.push(i);
    return sonuc;
  }

  // ---------- bot ----------
  // Parçanın bir noktaya en yakın uzaklığının karesi
  function parcaUzaklik2(ax, ay, bx, by, px, py) {
    const ex = bx - ax, ey = by - ay;
    const l2 = ex * ex + ey * ey;
    let u = l2 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const cx = ax + ex * u - px, cy = ay + ey * u - py;
    return cx * cx + cy * cy;
  }
  const yolAcik = (toplar, ax, ay, bx, by, haric) =>
    toplar.every((t, i) => !t || haric.includes(i) || parcaUzaklik2(ax, ay, bx, by, t.x, t.y) >= 4 * R * R * 0.98);

  // Hedef topu bir deliğe göndermek için beyazın nişan alacağı "hayalet top" adayları (en iyiler önce)
  function adaylar(toplar, beyaz, liste) {
    const sonuc = [];
    for (const i of liste) {
      const t = toplar[i];
      for (let k = 0; k < 6; k++) {
        const a = CEP_AGZI[k];
        let dx = a.x - t.x, dy = a.y - t.y;
        const pl = Math.sqrt(dx * dx + dy * dy);
        if (pl < 1) continue;
        dx /= pl; dy /= pl;
        // Yan deliğe çok yatık giden top girmez
        if ((k === 1 || k === 4) && Math.abs(dy) < 0.45) continue;
        const gx = t.x - dx * 2 * R, gy = t.y - dy * 2 * R;
        let ux = gx - beyaz.x, uy = gy - beyaz.y;
        const ul = Math.sqrt(ux * ux + uy * uy);
        if (ul < 1) continue;
        ux /= ul; uy /= ul;
        const cos = ux * dx + uy * dy;
        if (cos < 0.3) continue;
        if (!yolAcik(toplar, beyaz.x, beyaz.y, gx, gy, [0, i])) continue;
        if (!yolAcik(toplar, t.x, t.y, a.x, a.y, [0, i])) continue;
        const puan = cos * cos * cos / (1 + (ul + pl * 1.4) / 700);
        sonuc.push({ top: i, cep: k, yx: ux, yy: uy, ul, pl, puan });
      }
    }
    return sonuc.sort((a, b) => b.puan - a.puan);
  }

  // Bot atışı. durum: { toplar, gruplar, kirilis, elde, takim }. Döner: { yx, yy, guc, ust, yan, beyaz? }
  // Adayları benzetimle dener; sonucu en iyi olanı seçer. Nişanına biraz rastgele sapma eklenir (hep sokmasın).
  function botAtisi(durum, rastgele) {
    const toplar = durum.toplar.slice();
    const takim = durum.takim;
    const grup = durum.gruplar[takim];
    const liste = hedefler(toplar, grup);
    let beyaz = toplar[0];
    let yerlestir = null;

    if (durum.kirilis) {
      const y = H / 2 + (rastgele() - 0.5) * 60;
      beyaz = { x: KAFA_X, y };
      const ilk = toplar.reduce((en, t, i) => (t && i !== 0 && (!en || t.x < en.t.x) ? { i, t } : en), null);
      let dx = ilk.t.x - beyaz.x, dy = ilk.t.y - beyaz.y;
      const l = Math.sqrt(dx * dx + dy * dy);
      return { yx: dx / l, yy: dy / l, guc: 0.92 + rastgele() * 0.08, ust: 0, yan: 0, beyaz };
    }

    if (durum.elde || !beyaz) {
      // Elde top: beyazı, bir hedefi deliğe dümdüz gönderecek yere koy
      let en = null;
      for (const i of liste) {
        const t = toplar[i];
        for (let k = 0; k < 6; k++) {
          const a = CEP_AGZI[k];
          let dx = a.x - t.x, dy = a.y - t.y;
          const pl = Math.sqrt(dx * dx + dy * dy);
          dx /= pl; dy /= pl;
          for (const uzak of [140, 220, 90, 300]) {
            const x = t.x - dx * (2 * R + uzak), y = t.y - dy * (2 * R + uzak);
            if (!yerBos(toplar, x, y, 0)) continue;
            if (!yolAcik(toplar, x, y, t.x, t.y, [0, i]) || !yolAcik(toplar, t.x, t.y, a.x, a.y, [0, i])) continue;
            const puan = 1 / (1 + (uzak + pl) / 600);
            if (!en || puan > en.puan) en = { x, y, puan };
            break;
          }
        }
      }
      if (!en) {
        for (let deneme = 0; deneme < 200 && !en; deneme++) {
          const x = R + rastgele() * (W - 2 * R), y = R + rastgele() * (H - 2 * R);
          if (yerBos(toplar, x, y, 0)) en = { x, y };
        }
      }
      beyaz = { x: en.x, y: en.y };
      yerlestir = beyaz;
    }
    toplar[0] = beyaz;

    const dene = (atis) => {
      const s = sonuna(toplar, atis);
      const k = kural({ gruplar: durum.gruplar, kirilis: false, toplar, kural: durum.kural }, s, takim);
      let puan = 0;
      if (k.kazanan === takim) puan += 1000;
      else if (k.kazanan !== null) puan -= 1000;
      if (k.faul) puan -= 50;
      if (k.devam) puan += 100;
      // Sıra geçecekse beyazın rakibe kolay atış bırakmaması iyi (kabaca: beyaz bantta/uzakta)
      return puan + rastgele();
    };

    const secenekler = [];
    for (const a of adaylar(toplar, beyaz, liste).slice(0, 5)) {
      const guc = Math.min(0.85, Math.max(0.18, (a.ul + a.pl * 1.6) / 2300 + 0.12));
      for (const g of [guc, guc * 1.3]) secenekler.push({ yx: a.yx, yy: a.yy, guc: Math.min(0.95, g), ust: 0, yan: 0 });
    }
    // Sokacak atış yoksa: hedef toplara doğrudan (merkeze ve biraz yanlarına) vur, faul yapmayanı seç
    if (!secenekler.length) {
      for (const i of liste) {
        const t = toplar[i];
        let dx = t.x - beyaz.x, dy = t.y - beyaz.y;
        const l = Math.sqrt(dx * dx + dy * dy);
        dx /= l; dy /= l;
        for (const kay of [0, 0.5, -0.5]) {
          const ox = dx * l - dy * kay * R, oy = dy * l + dx * kay * R;
          const ol = Math.sqrt(ox * ox + oy * oy);
          secenekler.push({ yx: ox / ol, yy: oy / ol, guc: 0.35 + rastgele() * 0.2, ust: 0, yan: 0 });
        }
      }
    }
    if (!secenekler.length) secenekler.push({ yx: 1, yy: 0, guc: 0.5, ust: 0, yan: 0 });

    let en = null;
    for (const s of secenekler.slice(0, 14)) {
      const p = dene(s);
      if (!en || p > en.p) en = { s, p };
    }
    // Biraz sapma (yaklaşık ±0.6°): her atışı kusursuz yapmasın
    const sapma = (rastgele() - 0.5) * 0.02;
    const c = Math.cos(sapma), sn = Math.sin(sapma);
    const atis = Object.assign({}, en.s, { yx: en.s.yx * c - en.s.yy * sn, yy: en.s.yx * sn + en.s.yy * c });
    if (yerlestir) atis.beyaz = yerlestir;
    return atis;
  }

  const BilardoFizik = {
    W, H, R, KOSE, YAN, CEPLER, BANTLAR, AYAK, KAFA_X, EN_AZ_HIZ, EN_COK_HIZ,
    tur, karsiGrup, diz, yerBos, siyahiKoy, Benzetim, sonuna, kural, kalanSay, hedefler, botAtisi
  };
  if (typeof module !== "undefined" && module.exports) module.exports = BilardoFizik;
  else kok.BilardoFizik = BilardoFizik;
})(typeof window !== "undefined" ? window : globalThis);
