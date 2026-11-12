// Odadaki bilardo (8 top) masası: üst çubuktaki "🎱 Bilardo" düğmesi, fotoğrafların yerine çıkan masa katmanı ve
// masa sunucusuyla (okey-sunucu/src/bilardo.js, Cloudflare) bağlantı. Atışı sunucu hesaplar; burada aynı motorla
// (js/bilardo/fizik.js) baştan oynatılır, sonra sunucunun söylediği konumlar çizilir.
//
// Vuruş: fareyle nişan al (beyazdan fareye doğru), tuşa basıp geri çek, bırakınca vurur. Ne kadar çekersen o kadar
// güçlü. Telefonda: masada parmağını gezdirerek nişan al, beyaz topun üstünden geri çekip bırak.
// Elde top varken beyazı tutup istediğin yere taşı (kırışta çizginin gerisine).

(function () {
  "use strict";
  const F = window.BilardoFizik;
  const { W, H, R } = F;
  const KENAR = 62;                         // tahta + bant genişliği (çizim)
  const TW = W + 2 * KENAR, TH = H + 2 * KENAR;
  const CEKME_EN_COK = 260;                 // ıstakayı bu kadar geri çekince tam güç
  const RENKLER = ["#f4f1e8", "#f2c230", "#1f5fbf", "#d63a2f", "#6a3fa3", "#f07f1a", "#1f8a4c", "#8a2b2b", "#141414",
    "#f2c230", "#1f5fbf", "#d63a2f", "#6a3fa3", "#f07f1a", "#1f8a4c", "#8a2b2b"];
  const GRUP_ADI = { duz: "düz (1–7)", cizgili: "çizgili (9–15)" };

  function sunucuAdresi() {
    const p = new URLSearchParams(location.search).get("okeySunucu");
    if (p && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(p)) return p;
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return "http://127.0.0.1:8787";
    return AYARLAR.okeySunucu;
  }

  // Küçük DOM yardımcısı
  function h(etiket, ozellik, ...cocuklar) {
    const e = document.createElement(etiket);
    for (const [a, v] of Object.entries(ozellik || {})) {
      if (v == null || v === false) continue;
      if (a === "sinif") e.className = v;
      // "--r" gibi CSS değişkenleri Object.assign ile atanmaz (sessizce yok sayılır): setProperty gerekir
      else if (a === "stil") for (const [k, d] of Object.entries(v)) { if (k.startsWith("--")) e.style.setProperty(k, d); else e.style[k] = d; }
      else if (a.startsWith("on")) e.addEventListener(a.slice(2), v);
      else e.setAttribute(a, v === true ? "" : v);
    }
    for (const c of cocuklar.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
    return e;
  }

  let tus = null, kok = null, ws = null, durum = null, acik = false, yeniden = 0, ofset = 0;
  let kuyruk = Promise.resolve();
  // Masa tuvale ortalanır; dik ekranda (telefon) 90° çevrilir: kırış yeri altta, üçgen üstte
  let tuval = null, ctx = null, olcek = 1, mx = 0, my = 0, dik = false, dpr = 1;
  let ogeler = {};
  let oynatilan = null;            // oynatılan atış: { s (benzetim) }
  // Benim nişanım
  let yon = { x: 1, y: 0 }, cekme = 0, cekiyor = null, falso = { ust: 0, yan: 0 }, beyazYer = null, tasiyor = false;
  let fare = null;                 // masadaki fare konumu (masa birimiyle)
  let sonEkran = null;             // fare son ekran konumu (Shift ile ince ayar)
  let kilit = false;              // nişan sabit: fare gezince yön değişmez (ince ayardan sonra ya da sağ tıkla)
  let uzak = null;                 // sıradakinin (başkasının) canlı nişanı
  let sonNisanGonderim = 0;
  let sesAcik = true;
  try { sesAcik = localStorage.getItem("bilardoSes") !== "0"; } catch (e) { }

  const benimKoltugum = () => (durum ? durum.ben.koltuk : -1);
  const oturuyorum = () => benimKoltugum() >= 0;
  const ad = (k) => (durum && durum.koltuklar[k] && durum.koltuklar[k].ad) || "Oyuncu";
  const takimAdi = (t) => {
    if (!durum) return "";
    const adlar = [t, t + 2].filter((k) => !durum.koltuklar[k].bos).map(ad);
    return adlar.join(" & ") || (t ? "Sağ takım" : "Sol takım");
  };
  const oyunVar = () => !!(durum && durum.oyun && !durum.oyun.bitti);
  const benSiram = () => oyunVar() && oturuyorum() && durum.oyun.sira === benimKoltugum() && !oynatilan &&
    Date.now() + ofset >= durum.oyun.atisBitis - 400;

  // ---------- bağlantı ----------
  function misafirKimligi() {
    const kim = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("kim");
    const anahtar = "okeyMisafir" + (kim ? ":" + kim : "");
    try {
      let id = localStorage.getItem(anahtar);
      if (!/^[a-z0-9]{16}$/.test(id || "")) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
        localStorage.setItem(anahtar, id);
      }
      return id;
    } catch (e) { return "misafir" + Math.random().toString(36).slice(2, 11).padEnd(9, "0"); }
  }
  const benimAdim = () => (typeof isim !== "undefined" && isim) || "Misafir";
  let soylenenAd = null;
  async function merhaba() {
    const kart = await kimlikKarti();
    soylenenAd = benimAdim();
    const yerel = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    gonder({ t: "merhaba", kart, ad: soylenenAd, misafir: yerel ? { id: misafirKimligi(), ad: soylenenAd } : undefined });
  }
  setInterval(() => { if (ws && ws.readyState === 1 && soylenenAd !== benimAdim()) merhaba(); }, 1500);

  function baglan() {
    if (ws && ws.readyState <= 1) return;
    if (typeof odaId === "undefined" || !odaId) { if (acik) setTimeout(baglan, 500); return; }
    ws = new WebSocket(sunucuAdresi().replace(/^http/, "ws") + "/bilardo/" + encodeURIComponent(odaId));
    ws.onopen = () => { yeniden = 0; merhaba(); };
    ws.onmessage = (e) => { try { mesajAl(JSON.parse(e.data)); } catch (h) { } };
    ws.onclose = () => {
      ws = null;
      if (!acik && !oturuyorum()) return;
      setTimeout(baglan, Math.min(10000, 800 * 2 ** yeniden++));
      bildir("Masa bağlantısı koptu, yeniden bağlanılıyor…", "uyari");
    };
  }
  function gonder(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  function mesajAl(m) {
    if (m.t === "hata") { bildir(m.metin, "uyari"); return; }
    if (m.t === "nisan") { if (durum && durum.oyun && m.k === durum.oyun.sira && m.k !== benimKoltugum()) uzakAl(m); return; }
    if (m.t !== "guncel") return;
    const alindi = Date.now();
    kuyruk = kuyruk.then(() => olaylariOynat(m.olaylar || [], alindi)).then(() => {
      const eski = durum;
      durum = m.durum;
      ofset = durum.sunucuZamani - Date.now();
      // Sıra değişti ya da yeni oyun: nişan ve beyazın yeri sıfırlanır
      if (!eski || !eski.oyun || !durum.oyun || eski.oyun.sira !== durum.oyun.sira || eski.oyun.id !== durum.oyun.id || eski.oyun.atisNo !== durum.oyun.atisNo) {
        beyazYer = null; cekme = 0; cekiyor = null; uzak = null; uzakG = null; tasiyor = false; kilit = false;
        falso = { ust: 0, yan: 0 };
      }
      dugmeyiGuncelle();
      uygula();
      for (const o of m.olaylar || []) olayYazisi(o);
    }).catch(() => { });
  }

  // ---------- sıradakinin canlı nişanı ----------
  // Nişan saniyede ~30 kez gelir; ekranda her karede (60 fps) son gelene doğru yumuşakça kayarak çizilir
  let uzakG = null, uzakSonKare = 0;
  function uzakAl(m) {
    uzak = Object.assign(m, { zaman: Date.now() });
    if (!uzakG) uzakG = { yon: { x: m.yx, y: m.yy }, cekme: m.cekme, beyaz: m.beyaz ? { x: m.beyaz.x, y: m.beyaz.y } : null };
    if (performance.now() - uzakSonKare > 200) { uzakSonKare = performance.now(); requestAnimationFrame(uzakKare); }
  }
  function uzakKare() {
    if (!uzak || !uzakG || !acik || oynatilan || Date.now() - uzak.zaman > 3000) { uzakSonKare = 0; return; }
    uzakSonKare = performance.now();
    const k = 0.4;
    let x = uzakG.yon.x + (uzak.yx - uzakG.yon.x) * k, y = uzakG.yon.y + (uzak.yy - uzakG.yon.y) * k;
    const l = Math.hypot(x, y) || 1;
    uzakG.yon = { x: x / l, y: y / l };
    uzakG.cekme += (uzak.cekme - uzakG.cekme) * k;
    if (uzak.beyaz) uzakG.beyaz = uzakG.beyaz ? { x: uzakG.beyaz.x + (uzak.beyaz.x - uzakG.beyaz.x) * k, y: uzakG.beyaz.y + (uzak.beyaz.y - uzakG.beyaz.y) * k } : { x: uzak.beyaz.x, y: uzak.beyaz.y };
    else uzakG.beyaz = null;
    tuvalCiz();
    requestAnimationFrame(uzakKare);
  }

  // ---------- atışı oynatma ----------
  // Sekme arkadayken (ya da birikmiş eski atışsa) oynatılmaz: tarayıcı arkadaki sekmeye kare vermez, sonraki
  // güncellemeler kuyrukta beklerdi. Oynatılırken sekme arkaya giderse atış hemen sona atlanır.
  let oynatmayiBitir = null;
  document.addEventListener("visibilitychange", () => { if (document.hidden && oynatmayiBitir) oynatmayiBitir(); });
  function olaylariOynat(olaylar, alindi) {
    const v = olaylar.find((o) => o.tur === "vurus");
    if (!v || !acik || !tuval || document.hidden || Date.now() - alindi > 2500) return Promise.resolve();
    uzak = null; uzakG = null;
    ses("istaka", v.atis.guc * 1500 + 200);
    return new Promise((bitti) => {
      const s = F.Benzetim(v.once, v.atis);
      oynatilan = { s };
      let onceki = performance.now();
      let yedek = null;
      const son = () => { clearInterval(yedek); oynatmayiBitir = null; oynatilan = null; bitti(); };
      oynatmayiBitir = () => { while (!s.bitti && s.t < 60) s.adim(); son(); };
      const ilerle = (simdi) => {
        if (!oynatilan) return;
        const gecen = Math.min(0.1, (simdi - onceki) / 1000);
        onceki = simdi;
        const hedef = s.t + gecen;
        let adim = 0;
        while (!s.bitti && s.t < hedef && adim++ < 4000) for (const o of s.adim()) ses(o.tur, o.hiz);
        tuvalCiz();
        if (s.bitti) son();
      };
      const kare = (simdi) => { ilerle(simdi); if (oynatilan) requestAnimationFrame(kare); };
      requestAnimationFrame(kare);
      // Tarayıcı kare vermiyorsa (görünmeyen pencere) zamanlayıcıyla ilerle; atış yine gerçek sürede biter
      yedek = setInterval(() => { if (performance.now() - onceki > 150) ilerle(performance.now()); }, 100);
    });
  }

  function olayYazisi(o) {
    if (!durum) return;
    if (o.tur === "cikarildi") bildir(o.metin);
    else if (o.tur === "bitirildi") bildir("Oyun bitirildi" + (o.neden ? ": " + o.neden : o.ad ? " (" + o.ad + ")" : ""), "uyari");
    else if (o.tur === "sure") bildir(ad(o.k) + ": süre doldu · elde top rakipte", "uyari");
    else if (o.tur === "basladi") bildir("Yeni oyun başladı · kıran: " + ad(durum.oyun.sira));
    else if (o.tur === "sonuc") {
      if (o.yeniGrup) bildir(ad(o.k) + " " + GRUP_ADI[o.yeniGrup] + " topları aldı");
      if (o.siyahGeri) bildir("Siyah kırışta girdi, yerine geri kondu");
      if (o.faul && !(durum.oyun && durum.oyun.bitti)) bildir("Faul: " + o.faul + " · elde top " + ad(durum.oyun.sira) + "'de", "uyari");
    }
    if (durum.oyun && durum.oyun.bitti && o.tur === "sonuc") sonucuGoster();
  }

  // ---------- ses (WebAudio ile kısa vuruş sesleri) ----------
  let ses_ = null;
  function ses(tur, hiz) {
    if (!sesAcik || document.hidden) return;
    try {
      if (!ses_) ses_ = new (window.AudioContext || window.webkitAudioContext)();
      if (ses_.state === "suspended") ses_.resume();
      const g = Math.min(1, (hiz || 0) / 1600);
      if (g < 0.03) return;
      const t = ses_.currentTime;
      const o = ses_.createOscillator(), k = ses_.createGain();
      if (tur === "top") { o.type = "triangle"; o.frequency.setValueAtTime(1900 + Math.random() * 300, t); k.gain.setValueAtTime(0.25 * g, t); k.gain.exponentialRampToValueAtTime(0.001, t + 0.05); }
      else if (tur === "bant") { o.type = "sine"; o.frequency.setValueAtTime(180, t); k.gain.setValueAtTime(0.35 * g, t); k.gain.exponentialRampToValueAtTime(0.001, t + 0.09); }
      else if (tur === "cep") { o.type = "sine"; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.25); k.gain.setValueAtTime(0.5, t); k.gain.exponentialRampToValueAtTime(0.001, t + 0.3); }
      else if (tur === "istaka") { o.type = "square"; o.frequency.setValueAtTime(900, t); k.gain.setValueAtTime(0.12 * g, t); k.gain.exponentialRampToValueAtTime(0.001, t + 0.03); }
      o.connect(k).connect(ses_.destination);
      o.start(t); o.stop(t + 0.35);
    } catch (e) { }
  }

  // ---------- konumlar ----------
  // Şu an çizilecek top konumları: oynatılan atış, yoksa masanın durumu (benim ya da sıradakinin taşıdığı beyazla)
  function konumlar() {
    if (oynatilan) return oynatilan.s.toplar.map((t) => (t.var ? { x: t.x, y: t.y } : null));
    if (!durum || !durum.oyun) return null;
    const t = durum.oyun.toplar.slice();
    if (benSiram() && beyazYer) t[0] = beyazYer;
    else if (!benSiram() && uzakG && uzakG.beyaz && durum.oyun.elde) t[0] = uzakG.beyaz;
    return t;
  }

  // Tuvaldeki nokta → masa noktası
  const masaya = (px, py) => (dik
    ? { x: W / 2 - (py - my) / olcek, y: H / 2 + (px - mx) / olcek }
    : { x: W / 2 + (px - mx) / olcek, y: H / 2 + (py - my) / olcek });

  // Nişan çizgisi: beyazdan yön boyunca ilk değdiği top (hayalet top) ya da bant
  function nisanHesapla(toplar, c, d) {
    let enT = Infinity, hedef = -1;
    for (let i = 1; i < 16; i++) {
      const p = toplar[i];
      if (!p) continue;
      const px = p.x - c.x, py = p.y - c.y;
      const b = px * d.x + py * d.y;
      if (b <= 0) continue;
      const k2 = px * px + py * py - b * b;
      if (k2 > 4 * R * R) continue;
      const t = b - Math.sqrt(4 * R * R - k2);
      if (t < enT) { enT = t; hedef = i; }
    }
    let tb = Infinity;
    if (d.x > 0) tb = Math.min(tb, (W - R - c.x) / d.x); else if (d.x < 0) tb = Math.min(tb, (R - c.x) / d.x);
    if (d.y > 0) tb = Math.min(tb, (H - R - c.y) / d.y); else if (d.y < 0) tb = Math.min(tb, (R - c.y) / d.y);
    tb = Math.max(0, tb);
    if (tb < enT) return { bant: true, x: c.x + d.x * tb, y: c.y + d.y * tb, d };
    const gx = c.x + d.x * enT, gy = c.y + d.y * enT;
    const p = toplar[hedef];
    let nx = p.x - gx, ny = p.y - gy;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const dn = d.x * nx + d.y * ny;
    return { hedef, x: gx, y: gy, n: { x: nx, y: ny }, t: { x: d.x - dn * nx, y: d.y - dn * ny }, dn };
  }

  // Bu takımın ilk değmesi gereken toplar
  function yasalHedefler() {
    const O = durum.oyun;
    if (O.kirilis) return null;
    return new Set(F.hedefler(O.toplar, O.gruplar[benimKoltugum() % 2]));
  }

  // ---------- çizim ----------
  function boyutla() {
    if (!tuval) return;
    const kutu = ogeler.masaKutu.getBoundingClientRect();
    if (!kutu.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    tuval.width = Math.round(kutu.width * dpr);
    tuval.height = Math.round(kutu.height * dpr);
    tuval.style.width = kutu.width + "px";
    tuval.style.height = kutu.height + "px";
    // Masa çevrilince daha büyük görünüyorsa (dik telefon ekranı) çevrilir
    const yatay = Math.min(kutu.width / TW, kutu.height / TH), dikey = Math.min(kutu.width / TH, kutu.height / TW);
    dik = dikey > yatay * 1.1;
    olcek = dik ? dikey : yatay;
    mx = kutu.width / 2;
    my = kutu.height / 2;
    masaOnbellegi();
    tuvalCiz();
  }

  function yuvarlakDikdortgen(c, x, y, w, hh, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r);
    c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function masayiCiz(c) {
    // tahta çerçeve
    const g = c.createLinearGradient(0, -KENAR, 0, H + KENAR);
    g.addColorStop(0, "#7a4a26"); g.addColorStop(0.5, "#5a3318"); g.addColorStop(1, "#3f230f");
    yuvarlakDikdortgen(c, -KENAR, -KENAR, TW, TH, 26);
    c.fillStyle = g; c.fill();
    c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 3; c.stroke();
    // damar
    c.save(); c.globalAlpha = 0.08; c.strokeStyle = "#000"; c.lineWidth = 1;
    for (let i = 0; i < 18; i++) { c.beginPath(); c.moveTo(-KENAR, -KENAR + i * TH / 18 + 4); c.bezierCurveTo(W * 0.3, -KENAR + i * TH / 18 - 6, W * 0.7, -KENAR + i * TH / 18 + 10, W + KENAR, -KENAR + i * TH / 18); c.stroke(); }
    c.restore();
    // bantlar (keçeden biraz koyu)
    c.fillStyle = "#0d5a36";
    yuvarlakDikdortgen(c, -26, -26, W + 52, H + 52, 10); c.fill();
    // keçe
    const k = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    k.addColorStop(0, "#1f8a57"); k.addColorStop(1, "#126b40");
    c.fillStyle = k;
    c.fillRect(0, 0, W, H);
    // bantların eğimi
    c.fillStyle = "rgba(0,0,0,.18)";
    c.fillRect(0, 0, W, 4); c.fillRect(0, 0, 4, H);
    // kafa çizgisi ve ayak noktası
    c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(F.KAFA_X, 0); c.lineTo(F.KAFA_X, H); c.stroke();
    c.fillStyle = "rgba(255,255,255,.2)";
    c.beginPath(); c.arc(F.AYAK.x, F.AYAK.y, 3, 0, 7); c.fill();
    // elmaslar
    c.fillStyle = "#e9dcb8";
    for (let i = 1; i < 8; i++) if (i !== 4) for (const y of [-44, H + 44]) { c.beginPath(); c.arc(i * W / 8, y, 3.2, 0, 7); c.fill(); }
    for (let i = 1; i < 4; i++) for (const x of [-44, W + 44]) { c.beginPath(); c.arc(x, i * H / 4, 3.2, 0, 7); c.fill(); }
    // delikler
    for (let i = 0; i < 6; i++) {
      const p = F.CEPLER[i];
      const yan = i === 1 || i === 4;
      const x = yan ? p.x : p.x + (p.x < 0 ? 4 : -4), y = yan ? p.y + (p.y < 0 ? 6 : -6) : p.y + (p.y < 0 ? 4 : -4);
      const r = yan ? 25 : 28;
      c.fillStyle = "#2a1a0c";
      c.beginPath(); c.arc(x, y, r + 5, 0, 7); c.fill();
      const dg = c.createRadialGradient(x, y, 2, x, y, r);
      dg.addColorStop(0, "#000"); dg.addColorStop(1, "#111");
      c.fillStyle = dg;
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    // bant uçları (çeneler) çizgisi
    c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 2;
    for (const [x1, y1, x2, y2] of F.BANTLAR) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  }

  function topCiz(c, i, x, y, soluk) {
    c.save();
    if (soluk) c.globalAlpha = 0.45;
    // gölge
    c.fillStyle = "rgba(0,0,0,.35)";
    c.beginPath(); c.ellipse(x + 3, y + 4, R, R * 0.9, 0, 0, 7); c.fill();
    // gövde
    c.beginPath(); c.arc(x, y, R, 0, 7); c.closePath();
    c.fillStyle = i >= 9 ? "#f4f1e8" : RENKLER[i];
    c.fill();
    if (i >= 9) {
      c.save(); c.clip();
      c.fillStyle = RENKLER[i];
      c.fillRect(x - R, y - R * 0.55, 2 * R, R * 1.1);
      c.restore();
    }
    if (i > 0) {
      c.fillStyle = "#fbfaf4";
      c.beginPath(); c.arc(x, y, R * 0.5, 0, 7); c.fill();
      c.fillStyle = "#111";
      c.font = "bold " + (i > 9 ? 9 : 10.5) + "px Nunito, Arial, sans-serif";
      c.textAlign = "center"; c.textBaseline = "middle";
      // Dik ekranda masa döndüğü için sayı geri döndürülür (düz okunsun)
      c.save(); c.translate(x, y); if (dik) c.rotate(Math.PI / 2);
      c.fillText(String(i), 0, 0.6);
      c.restore();
    }
    // ışık
    const p = c.createRadialGradient(x - R * 0.4, y - R * 0.45, 1, x, y, R * 1.05);
    p.addColorStop(0, "rgba(255,255,255,.75)"); p.addColorStop(0.25, "rgba(255,255,255,.12)"); p.addColorStop(1, "rgba(0,0,0,.28)");
    c.fillStyle = p;
    c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
    c.restore();
  }

  function istakaCiz(c, b, d, geri) {
    // Istaka beyazın arkasında, nişanın tersine uzanır; geri çekildikçe uzaklaşır
    const bas = R + 4 + geri * 0.9;
    const boy = 520;
    const x1 = b.x - d.x * bas, y1 = b.y - d.y * bas;
    const x2 = b.x - d.x * (bas + boy), y2 = b.y - d.y * (bas + boy);
    c.save();
    c.lineCap = "round";
    c.strokeStyle = "rgba(0,0,0,.3)"; c.lineWidth = 9;
    c.beginPath(); c.moveTo(x1 + 4, y1 + 6); c.lineTo(x2 + 4, y2 + 6); c.stroke();
    const g = c.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, "#e8e3d4"); g.addColorStop(0.03, "#e8e3d4"); g.addColorStop(0.035, "#2b6fa8"); g.addColorStop(0.05, "#f1d9a6");
    g.addColorStop(0.62, "#d7a560"); g.addColorStop(0.64, "#1a1a1a"); g.addColorStop(1, "#3a2414");
    c.strokeStyle = g; c.lineWidth = 7;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.restore();
  }

  function nisanCiz(c, toplar, b, d, yasal) {
    const n = nisanHesapla(toplar, b, d);
    c.save();
    c.setLineDash([6, 6]);
    c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(n.x, n.y); c.stroke();
    c.setLineDash([]);
    if (n.bant) {
      c.strokeStyle = "rgba(255,255,255,.5)";
      c.beginPath(); c.arc(n.x, n.y, R, 0, 7); c.stroke();
    } else {
      const yanlis = yasal && !yasal.has(n.hedef);
      c.strokeStyle = yanlis ? "rgba(255,90,90,.95)" : "rgba(255,255,255,.9)";
      c.lineWidth = 2;
      c.beginPath(); c.arc(n.x, n.y, R, 0, 7); c.stroke();
      if (yanlis) {
        c.beginPath(); c.moveTo(n.x - 6, n.y - 6); c.lineTo(n.x + 6, n.y + 6); c.moveTo(n.x + 6, n.y - 6); c.lineTo(n.x - 6, n.y + 6); c.stroke();
      } else {
        const p = toplar[n.hedef];
        const uz = 30 + 120 * n.dn;
        c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + n.n.x * uz, p.y + n.n.y * uz); c.stroke();
        const tl = Math.hypot(n.t.x, n.t.y);
        if (tl > 0.05) {
          c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(n.x, n.y); c.lineTo(n.x + n.t.x / tl * 50 * tl, n.y + n.t.y / tl * 50 * tl); c.stroke();
        }
      }
    }
    c.restore();
  }

  // Masa koordinatlarını tuvale çeviren dönüşüm
  function donusum(c) {
    const s = olcek * dpr;
    if (dik) c.setTransform(0, -s, s, 0, (mx - H / 2 * olcek) * dpr, (my + W / 2 * olcek) * dpr);
    else c.setTransform(s, 0, 0, s, (mx - W / 2 * olcek) * dpr, (my - H / 2 * olcek) * dpr);
  }

  // Masanın kendisi (tahta, keçe, delikler) değişmez: boyut değişince bir kez ayrı bir tuvale çizilir,
  // her karede sadece kopyalanır. Böylece toplar ve ıstaka her karede çizilse de akıcı kalır.
  let masaOnbellek = null;
  function masaOnbellegi() {
    if (!masaOnbellek) masaOnbellek = document.createElement("canvas");
    masaOnbellek.width = tuval.width;
    masaOnbellek.height = tuval.height;
    const c = masaOnbellek.getContext("2d");
    c.clearRect(0, 0, masaOnbellek.width, masaOnbellek.height);
    donusum(c);
    masayiCiz(c);
  }

  // Çizim isteği: aynı karede gelen istekler birleşir (fare olayları kare hızından sık gelir)
  let cizimBekliyor = false;
  function ciz() {
    if (cizimBekliyor) return;
    cizimBekliyor = true;
    requestAnimationFrame(() => { if (cizimBekliyor) { cizimBekliyor = false; tuvalCiz(); } });
    // Görünmeyen pencerede tarayıcı kare vermez: yine de çizilsin
    setTimeout(() => { if (cizimBekliyor) { cizimBekliyor = false; tuvalCiz(); } }, 150);
  }

  function tuvalCiz() {
    if (!ctx || !acik) return;
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, tuval.width, tuval.height);
    if (!masaOnbellek || masaOnbellek.width !== tuval.width || masaOnbellek.height !== tuval.height) masaOnbellegi();
    c.drawImage(masaOnbellek, 0, 0);
    donusum(c);
    const toplar = konumlar() || F.diz(() => 0.5);
    const benim = benSiram();
    const O = durum && durum.oyun;
    // elde top: beyaz taşınırken geçerli yer mi
    if (benim && O.elde && tasiyor && beyazYer) {
      const olur = F.yerBos(O.toplar, beyazYer.x, beyazYer.y, 0) && (!O.kirilis || beyazYer.x <= F.KAFA_X);
      c.fillStyle = olur ? "rgba(120,255,160,.25)" : "rgba(255,80,80,.35)";
      c.beginPath(); c.arc(beyazYer.x, beyazYer.y, R + 6, 0, 7); c.fill();
    }
    if (benim && O.elde && O.kirilis) {
      c.fillStyle = "rgba(255,255,255,.05)";
      c.fillRect(0, 0, F.KAFA_X, H);
    }
    for (let i = 15; i >= 0; i--) if (toplar[i]) topCiz(c, i, toplar[i].x, toplar[i].y, false);
    // nişan ve ıstaka
    if (!oynatilan && O && !O.bitti) {
      if (benim && toplar[0] && !tasiyor) {
        nisanCiz(c, toplar, toplar[0], yon, yasalHedefler());
        istakaCiz(c, toplar[0], yon, cekme * CEKME_EN_COK);
        if (cekiyor) {
          // güç çubuğu (alt tahtada)
          c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(W / 2 - 150, H + 34, 300, 12);
          const gg = c.createLinearGradient(W / 2 - 150, 0, W / 2 + 150, 0);
          gg.addColorStop(0, "#4ade80"); gg.addColorStop(0.6, "#facc15"); gg.addColorStop(1, "#ef4444");
          c.fillStyle = gg; c.fillRect(W / 2 - 150, H + 34, 300 * cekme, 12);
        }
      } else if (!benim && uzakG && toplar[0] && Date.now() - uzak.zaman < 3000) {
        // Sıradakinin nişanı: gelen örnekler arasında yumuşakça kaydırılmış hâli
        const b = O.elde && uzakG.beyaz ? uzakG.beyaz : toplar[0];
        c.save(); c.globalAlpha = 0.8;
        nisanCiz(c, toplar, b, uzakG.yon, null);
        istakaCiz(c, b, uzakG.yon, uzakG.cekme * CEKME_EN_COK);
        c.restore();
      }
    }
    sureCiz();
  }

  function sureCiz() {
    if (!ogeler.sure) return;
    const O = durum && durum.oyun;
    if (!O || O.bitti || oynatilan || durum.koltuklar[O.sira].bot) { ogeler.sure.style.width = "0"; return; }
    const kalan = Math.max(0, O.sureBitis - (Date.now() + ofset));
    ogeler.sure.style.width = (100 * kalan / (durum.ayar.sure * 1000)) + "%";
    ogeler.sure.classList.toggle("az", kalan < 8000);
  }

  // ---------- giriş (fare / dokunma / tuşlar) ----------
  function isaretci(e) {
    const r = tuval.getBoundingClientRect();
    return masaya(e.clientX - r.left, e.clientY - r.top);
  }
  function nisanGonder(zorla) {
    if (!benSiram()) return;
    if (!zorla && Date.now() - sonNisanGonderim < 30) return;
    sonNisanGonderim = Date.now();
    gonder({ t: "nisan", yx: yon.x, yy: yon.y, cekme, ust: falso.ust, yan: falso.yan, beyaz: beyazYer });
  }
  function beyaz() {
    const O = durum && durum.oyun;
    return beyazYer || (O && O.toplar[0]);
  }
  // Nişanı a radyan döndür (ince ayar). Nişan sabitlenir: fare gezince kaybolmasın.
  function dondur(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const x = yon.x * c - yon.y * s, y = yon.x * s + yon.y * c, l = Math.hypot(x, y);
    yon = { x: x / l, y: y / l };
    kilitle(true);
    nisanGonder();
    ciz();
  }
  function kilitle(k) {
    if (kilit === k) return;
    kilit = k;
    if (ogeler.kilit) ogeler.kilit.hidden = !k;
  }
  function yonuAyarla(p) {
    const b = beyaz();
    if (!b) return;
    const dx = p.x - b.x, dy = p.y - b.y, l = Math.hypot(dx, dy);
    if (l > 2) yon = { x: dx / l, y: dy / l };
  }

  function basildi(e) {
    if (!benSiram()) return;
    const p = isaretci(e);
    const O = durum.oyun;
    const b = beyaz();
    tuval.setPointerCapture(e.pointerId);
    // Elde top: beyazın üstüne basıp taşı (beyaz masada değilse her yere basınca oraya gelir)
    if (O.elde && (!b || Math.hypot(p.x - b.x, p.y - b.y) < R * 2.2)) {
      tasiyor = true;
      beyazYer = sinirla(p);
      ciz();
      return;
    }
    if (!b) return;
    const dokunma = e.pointerType === "touch";
    // Telefonda: beyazın yakınından başlayan sürükleme ıstakayı çeker, başka yerden başlayan nişan alır
    if (dokunma && Math.hypot(p.x - b.x, p.y - b.y) > 70) { kilitle(false); cekiyor = { nisan: true }; yonuAyarla(p); ciz(); return; }
    cekiyor = { x: p.x, y: p.y };
    cekme = 0;
    ciz();
  }
  function sinirla(p) {
    const O = durum.oyun;
    const enX = O.kirilis ? F.KAFA_X : W - R;
    return { x: Math.min(enX, Math.max(R, p.x)), y: Math.min(H - R, Math.max(R, p.y)) };
  }
  function oynadi(e) {
    const p = isaretci(e);
    const onceki = fare;
    fare = p;
    if (!benSiram()) return;
    // Shift basılıyken fare nişanı yavaşça döndürür (fareyi çok oynatıp az döndürme: hassas ayar)
    // (ekranda sağa/aşağı = saat yönü; 1 piksel ≈ 0,03°)
    if (e.shiftKey && !tasiyor && !(cekiyor && !cekiyor.nisan) && onceki) {
      const dx = e.clientX - (sonEkran ? sonEkran.x : e.clientX), dy = e.clientY - (sonEkran ? sonEkran.y : e.clientY);
      sonEkran = { x: e.clientX, y: e.clientY };
      const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      if (d) dondur(d * 0.0005);
      return;
    }
    sonEkran = { x: e.clientX, y: e.clientY };
    if (tasiyor) { beyazYer = sinirla(p); nisanGonder(); ciz(); return; }
    if (cekiyor && cekiyor.nisan) { yonuAyarla(p); nisanGonder(); ciz(); return; }
    if (cekiyor) {
      const geri = -((p.x - cekiyor.x) * yon.x + (p.y - cekiyor.y) * yon.y);
      cekme = Math.max(0, Math.min(1, geri / CEKME_EN_COK));
      nisanGonder();
      ciz();
      return;
    }
    if (e.pointerType !== "touch" && !kilit) { yonuAyarla(p); nisanGonder(); ciz(); }
  }
  function birakildi() {
    if (!benSiram()) { cekiyor = null; tasiyor = false; return; }
    const O = durum.oyun;
    if (tasiyor) {
      tasiyor = false;
      if (!(F.yerBos(O.toplar, beyazYer.x, beyazYer.y, 0) && (!O.kirilis || beyazYer.x <= F.KAFA_X))) {
        bildir(O.kirilis ? "Beyazı çizginin gerisinde boş bir yere koy" : "Beyaz oraya konamaz (başka topa biniyor)", "uyari");
        beyazYer = null;
      }
      nisanGonder(true);
      uygula();
      return;
    }
    const c = cekiyor;
    cekiyor = null;
    if (!c || c.nisan) { ciz(); return; }
    if (cekme < 0.03) { cekme = 0; ciz(); return; }
    vur(cekme);
  }

  function vur(guc) {
    const O = durum.oyun;
    if (O.elde && !beyaz()) { bildir("Önce beyazı masaya koy", "uyari"); return; }
    if (O.elde && beyazYer && !(F.yerBos(O.toplar, beyazYer.x, beyazYer.y, 0) && (!O.kirilis || beyazYer.x <= F.KAFA_X))) { bildir("Beyaz oraya konamaz", "uyari"); return; }
    const m = { t: "vur", yx: yon.x, yy: yon.y, guc, ust: falso.ust, yan: falso.yan };
    if (O.elde && beyazYer) m.beyaz = beyazYer;
    gonder(m);
    cekme = 0;
    ciz();
  }

  function tusaBasildi(e) {
    if (!acik || !benSiram() || /input|select|textarea/i.test((e.target && e.target.tagName) || "")) return;
    // ← →: 0,1° · Shift ile 0,02° (çok ince) · Esc: nişanı serbest bırak
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      const yonu = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 1;
      dondur(yonu * (e.shiftKey ? 0.00035 : 0.00175));
      e.preventDefault();
    } else if (e.key === "Escape" && kilit) { kilitle(false); if (fare) { yonuAyarla(fare); nisanGonder(); ciz(); } }
  }

  // Fare tekerleği: bir çentik 0,1° (Shift ile 0,02°)
  function tekerlek(e) {
    if (!benSiram() || cekiyor || tasiyor) return;
    e.preventDefault();
    const adim = Math.sign(e.deltaY || e.deltaX) * Math.min(3, Math.max(1, Math.abs(e.deltaY || e.deltaX) / 100));
    dondur(adim * (e.shiftKey ? 0.00035 : 0.00175));
  }

  // İnce ayar şeridi (telefonda da çalışır): sürükledikçe nişan yavaşça döner, 1 piksel ≈ 0,03°
  function inceAyarSeridi() {
    const cizgiler = h("div", { sinif: "b-ince-cizgiler" });
    const serit = h("div", { sinif: "b-ince", title: "İnce ayar: sağa sola sürükle (nişan çok yavaş döner)" }, cizgiler);
    let son = null, kayma = 0;
    serit.addEventListener("pointerdown", (e) => { if (!benSiram()) return; serit.setPointerCapture(e.pointerId); son = e.clientX; });
    serit.addEventListener("pointermove", (e) => {
      if (son === null) return;
      const dx = e.clientX - son;
      son = e.clientX;
      kayma += dx;
      cizgiler.style.backgroundPositionX = kayma + "px";
      if (dx) dondur(dx * 0.0005);
    });
    const bitir = () => { son = null; };
    serit.addEventListener("pointerup", bitir);
    serit.addEventListener("pointercancel", bitir);
    return serit;
  }

  // ---------- falso seçici ----------
  function falsoSecici() {
    const nokta = h("i", { sinif: "b-falso-nokta" });
    const kutu = h("div", { sinif: "b-falso", title: "Falso: beyaza vuracağın nokta. Üst: takip, alt: geri çekme, yanlar: bantta sağa/sola kayma. Çift tık: ortaya" }, nokta);
    const yerlestir = () => { nokta.style.left = (50 + falso.yan * 38) + "%"; nokta.style.top = (50 - falso.ust * 38) + "%"; };
    const ayarla = (e) => {
      const r = kutu.getBoundingClientRect();
      let x = ((e.clientX - r.left) / r.width - 0.5) / 0.38, y = -((e.clientY - r.top) / r.height - 0.5) / 0.38;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      falso = { ust: Math.round(y * 20) / 20, yan: Math.round(x * 20) / 20 };
      yerlestir();
      nisanGonder();
    };
    kutu.addEventListener("pointerdown", (e) => { kutu.setPointerCapture(e.pointerId); ayarla(e); });
    kutu.addEventListener("pointermove", (e) => { if (e.buttons) ayarla(e); });
    kutu.addEventListener("dblclick", () => { falso = { ust: 0, yan: 0 }; yerlestir(); });
    kutu.yenile = yerlestir;
    yerlestir();
    return kutu;
  }

  // ---------- arayüz ----------
  function kur_() {
    tuval = h("canvas", { sinif: "b-tuval" });
    ctx = tuval.getContext("2d");
    tuval.addEventListener("pointerdown", basildi);
    tuval.addEventListener("pointermove", oynadi);
    tuval.addEventListener("pointerup", birakildi);
    tuval.addEventListener("pointercancel", () => { cekiyor = null; tasiyor = false; cekme = 0; ciz(); });
    // Sağ tık: nişanı sabitle / serbest bırak (sabitken fareyi istediğin yere götürüp rahatça çekebilirsin)
    tuval.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!benSiram()) return;
      kilitle(!kilit);
      if (!kilit && fare) yonuAyarla(fare);
      nisanGonder(true);
      ciz();
    });
    tuval.addEventListener("wheel", tekerlek, { passive: false });
    ogeler.masaKutu = h("div", { sinif: "b-masa-kutu" }, tuval);
    ogeler.solTakim = h("div", { sinif: "b-takim sol" });
    ogeler.sagTakim = h("div", { sinif: "b-takim sag" });
    ogeler.durum = h("div", { sinif: "b-durum" });
    ogeler.sure = h("i", { sinif: "b-sure" });
    ogeler.falso = falsoSecici();
    ogeler.baslat = h("button", { sinif: "okey-tus ana", onclick: () => gonder({ t: "basla" }) }, "Oyunu başlat");
    ogeler.bildirim = h("div", { sinif: "b-bildirim" });
    ogeler.kose = h("div", { sinif: "kose-tuslar b-kose" });
    const ust = h("div", { sinif: "b-ust" }, ogeler.solTakim, h("div", { sinif: "b-orta" }, ogeler.durum, h("div", { sinif: "b-sure-kutu" }, ogeler.sure)), ogeler.sagTakim);
    ogeler.ince = inceAyarSeridi();
    ogeler.kilit = h("span", { sinif: "b-kilit", hidden: true, title: "Nişan sabit: fare gezince değişmez. Sağ tık ya da Esc ile serbest bırak." }, "🔒 Nişan sabit");
    const alt = h("div", { sinif: "b-alt" }, h("div", { sinif: "b-falso-kutu" }, ogeler.falso, h("small", {}, "Falso")),
      h("div", { sinif: "b-falso-kutu" }, ogeler.ince, h("small", {}, "İnce ayar")), ogeler.kilit, ogeler.baslat,
      h("small", { sinif: "b-ipucu" }, "Nişan: fare · Vuruş: tıkla, geri çek, bırak · İnce ayar: tekerlek, Shift+fare, ← → · Sağ tık: nişanı sabitle"));
    kok.replaceChildren(h("div", { sinif: "bilardo" }, ust, ogeler.masaKutu, alt, ogeler.bildirim, ogeler.kose));
    new ResizeObserver(boyutla).observe(ogeler.masaKutu);
    document.addEventListener("keydown", tusaBasildi);
    // Çeyrek saniyede bir: süre çubuğu; toplar durunca sıra bende olduysa yazılar; sıradakinin canlı nişanı
    let sonSiram = false;
    setInterval(() => {
      if (!acik || oynatilan || !durum) return;
      sureCiz();
      const siram = benSiram();
      if (siram !== sonSiram) { sonSiram = siram; uygula(); }
      else if (uzak && Date.now() - uzak.zaman > 3000 && Date.now() - uzak.zaman < 3400) ciz();   // eskiyen nişan silinsin
    }, 250);
  }

  function koltukKarti(k) {
    const kol = durum.koltuklar[k];
    const O = durum.oyun;
    if (kol.bos) {
      const oturabilir = !oturuyorum() || !oyunVar();
      return h("div", { sinif: "b-koltuk bos" },
        h("div", { sinif: "b-avatar" }, "+"),
        h("div", { sinif: "b-bilgi" }, h("b", {}, "Boş koltuk"),
          h("div", { sinif: "b-tuslar" },
            oturabilir && (!oyunVar() || !oturuyorum()) ? h("button", { sinif: "yanci-tus", onclick: () => gonder({ t: "otur", koltuk: k }) }, oturuyorum() ? "Buraya geç" : "Otur") : null,
            oturuyorum() || durum.ben.yetkili ? h("button", { sinif: "yanci-tus", onclick: () => gonder({ t: "bot", koltuk: k }) }, "🤖 Bot") : null)));
    }
    const sira = O && !O.bitti && O.sira === k;
    const harf = (kol.ad || "?").trim()[0] || "?";
    const avatar = kol.foto ? h("div", { sinif: "b-avatar", stil: { backgroundImage: "url('" + kol.foto.replace(/'/g, "") + "')" } })
      : h("div", { sinif: "b-avatar", stil: { background: k % 2 ? "#2f6fb0" : "#a8326e" } }, kol.bot ? "🤖" : harf.toUpperCase());
    return h("div", { sinif: "b-koltuk" + (sira ? " sira" : "") + (kol.bagli === false ? " kopuk" : "") + (k === benimKoltugum() ? " ben" : "") },
      avatar,
      h("div", { sinif: "b-bilgi" },
        h("b", {}, kol.ad + (k === benimKoltugum() ? " (sen)" : "")),
        h("small", {}, kol.bot ? "Bot" : kol.galibiyet + " galibiyet", kol.bagli === false ? " · bağlantı yok" : ""),
        h("div", { sinif: "b-tuslar" },
          kol.devralinabilir && !kol.bot && !oturuyorum() ? h("button", { sinif: "yanci-tus", onclick: () => gonder({ t: "otur", koltuk: k }) }, "Yerine otur") : null,
          kol.devralinabilir && !kol.bot && (oturuyorum() || durum.ben.yetkili) ? h("button", { sinif: "yanci-tus", onclick: () => gonder({ t: "bot", koltuk: k }) }, "🤖 Yerine bot") : null,
          kol.bot && (oturuyorum() || durum.ben.yetkili) ? h("button", { sinif: "yanci-tus tehlikeli", onclick: () => gonder({ t: "botCikar", koltuk: k }) }, "Botu çıkar") : null,
          // Masayı kuran ya da oda sahibi oyuncuyu masadan kaldırabilir
          !kol.bot && k !== benimKoltugum() && (durum.ben.kurucu || durum.ben.yetkili) ? h("button", {
            sinif: "yanci-tus tehlikeli", onclick: () => pencere(kol.ad + " masadan kaldırılsın mı?",
              h("p", {}, oyunVar() ? "Oyun sürüyor: takımında başka kimse yoksa oyun biter." : "Koltuğu boşalır, izleyici olarak kalır."),
              [{ yazi: "Vazgeç" }, { yazi: "Kaldır", sinif: "kirmizi", is: () => gonder({ t: "kaldir", koltuk: k }) }])
          }, "Kaldır") : null)));
  }

  function grupSirasi(t) {
    const O = durum.oyun;
    if (!O) return null;
    const g = O.gruplar[t];
    if (!g) return h("div", { sinif: "b-grup" }, h("small", {}, O.kirilis ? "Kırış bekleniyor" : "Masa açık: ilk sokulan top grubu belirler"));
    const numaralar = g === "duz" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    const kalan = F.kalanSay(O.toplar, g);
    return h("div", { sinif: "b-grup" },
      numaralar.map((n) => h("span", { sinif: "b-mini" + (O.toplar[n] ? "" : " girdi") + (n >= 9 ? " cizgili" : ""), stil: { "--r": RENKLER[n] } }, n)),
      h("span", { sinif: "b-mini siyah" + (kalan ? " soluk" : ""), stil: { "--r": RENKLER[8] } }, 8));
  }

  function arayuzuGuncelle() {
    if (!durum || !ogeler.solTakim) return;
    const O = durum.oyun;
    for (const t of [0, 1]) {
      const kutu = t ? ogeler.sagTakim : ogeler.solTakim;
      const aktif = O && !O.bitti && O.sira % 2 === t;
      kutu.classList.toggle("aktif", !!aktif);
      kutu.replaceChildren(...[koltukKarti(t), koltukKarti(t + 2), grupSirasi(t)].filter(Boolean));
    }
    const oturan = durum.koltuklar.filter((x) => !x.bos).length;
    let yazi;
    if (!O || O.bitti) {
      if (O && O.bitti) yazi = "🏆 " + takimAdi(O.kazanan) + " kazandı · " + (O.neden || "");
      else yazi = oturan < 2 ? "Bilardo masası · sol ve sağ takıma en az birer kişi otursun (1'e 1, 1'e 2 ya da 2'ye 2), boş koltuğa bot koyabilirsin" : "Masa: " + oturan + "/4 · 'Oyunu başlat'a bas";
    } else if (benSiram()) {
      const g = O.gruplar[benimKoltugum() % 2];
      yazi = O.kirilis ? "Kırış sende: beyazı çizginin gerisinde istediğin yere taşıyabilirsin, sonra ıstakayı geri çekip bırak"
        : (O.elde ? (O.toplar[0] || beyazYer ? "Elde top sende: beyazı tutup istediğin yere taşıyabilirsin, sonra vur" : "Elde top sende: beyazı koymak istediğin yere bas") : "Sıra sende: nişan al, ıstakayı geri çekip bırak")
        + (g ? " · Senin topların: " + (F.kalanSay(O.toplar, g) ? GRUP_ADI[g] : "siyah (8)") : "");
    } else yazi = (O.kirilis ? "Kırış: " : "") + ad(O.sira) + " oynuyor…" + (O.elde && !O.kirilis ? " (elde top)" : "");
    ogeler.durum.textContent = yazi;
    ogeler.baslat.hidden = !(oturuyorum() && !oyunVar() && oturan >= 2);
    ogeler.baslat.textContent = O && O.bitti ? "Yeni oyun" : "Oyunu başlat";
    ogeler.falso.classList.toggle("kapali", !benSiram());
    ogeler.ince.classList.toggle("kapali", !benSiram());
    ogeler.kilit.hidden = !(kilit && benSiram());
    ogeler.falso.yenile();
    tuval.classList.toggle("siram", benSiram());
    tuval.classList.toggle("elde", benSiram() && O.elde);
    // köşe düğmeleri
    const tuslar = [h("button", { sinif: "okey-tus", title: "Sesleri aç/kapat", onclick: () => { sesAcik = !sesAcik; try { localStorage.setItem("bilardoSes", sesAcik ? "1" : "0"); } catch (e) { } uygula(); } }, sesAcik ? "🔊 Ses" : "🔇 Ses")];
    if (durum.ben.kurucu || durum.ben.yetkili) tuslar.push(h("button", { sinif: "okey-tus", onclick: ayarPaneli }, "⚙️ Ayarlar"));
    if (oyunVar() && (durum.ben.kurucu || durum.ben.yetkili)) tuslar.push(h("button", {
      sinif: "okey-tus tehlikeli", title: "Süren oyunu sonuçsuz bitir", onclick: () => pencere("Oyun bitirilsin mi?",
        h("p", {}, "Süren oyun sonuçsuz biter (kimse kazanmış sayılmaz). Sonra yeni oyun başlatabilirsiniz."),
        [{ yazi: "Vazgeç" }, { yazi: "Bitir", sinif: "kirmizi", is: () => gonder({ t: "bitir" }) }])
    }, "⏹ Oyunu bitir"));
    if (oturuyorum()) tuslar.push(h("button", { sinif: "okey-tus tehlikeli", onclick: kalkSor }, "🚪 Kalk"));
    tuslar.push(h("button", { sinif: "okey-tus", onclick: kurallariGoster }, "📖 Kurallar"));
    ogeler.kose.replaceChildren(...tuslar);
  }

  // Ekranı yenile: kartlar, yazılar ve masa (kartlar sadece durum değişince yeniden kurulur; tıklama kaybolmasın)
  const uygula = () => { if (acik && durum) { arayuzuGuncelle(); ciz(); } };

  // ---------- pencereler ----------
  let bildirimZamani = null;
  function bildir(metin, tur) {
    if (!ogeler.bildirim) return;
    ogeler.bildirim.textContent = metin;
    ogeler.bildirim.className = "b-bildirim gorunur" + (tur ? " " + tur : "");
    clearTimeout(bildirimZamani);
    bildirimZamani = setTimeout(() => { ogeler.bildirim.className = "b-bildirim"; }, 3200);
  }

  function pencere(baslik, govde, tuslar) {
    const arka = h("div", { sinif: "b-pencere-arka" });
    const kapat = () => arka.remove();
    arka.addEventListener("click", (e) => { if (e.target === arka) kapat(); });
    arka.append(h("div", { sinif: "b-pencere" }, h("h3", {}, baslik), govde,
      h("div", { sinif: "b-pencere-tuslar" }, (tuslar || [{ yazi: "Kapat", ana: true }]).map((t) =>
        h("button", { sinif: "okey-tus" + (t.ana ? " ana" : "") + (t.sinif ? " " + t.sinif : ""), onclick: () => { kapat(); if (t.is) t.is(); } }, t.yazi)))));
    kok.querySelector(".bilardo").append(arka);
  }

  function sonucuGoster() {
    const O = durum.oyun;
    const benimTakim = oturuyorum() ? benimKoltugum() % 2 : null;
    const baslik = benimTakim === null ? "🏆 " + takimAdi(O.kazanan) + " kazandı" : benimTakim === O.kazanan ? "🏆 Kazandın!" : "Kaybettin";
    pencere(baslik, h("p", {}, O.neden + " · " + takimAdi(O.kazanan)),
      oturuyorum() ? [{ yazi: "Kapat" }, { yazi: "Yeni oyun", ana: true, is: () => gonder({ t: "basla" }) }] : null);
  }

  function kalkSor() {
    pencere("Masadan kalkmak istiyor musun?", h("p", {}, oyunVar() ? "Oyun sürüyor: kalkarsan yerine başkası ya da bot oturabilir." : ""),
      [{ yazi: "Evet", sinif: "soluk", is: () => gonder({ t: "kalk" }) }, { yazi: "Hayır", sinif: "kirmizi" }]);
  }

  function ayarPaneli() {
    const sec = h("select", { onchange: (e) => gonder({ t: "ayar", sure: Number(e.target.value) }) },
      [20, 30, 45, 60, 90].map((n) => h("option", { value: n, selected: durum.ayar.sure === n }, n + " saniye")));
    const dunya = durum.ayar.kural === "dunya";
    const kuralSec = h("select", { disabled: oyunVar(), onchange: (e) => gonder({ t: "ayar", kural: e.target.value }) },
      h("option", { value: "bar", selected: !dunya }, "Bar kuralı: kırışta giren sayılır, rakibin topu faul"),
      h("option", { value: "dunya", selected: dunya }, "Dünya kuralı (WPA): kırış grubu belirlemez, rakibin topu serbest"));
    pencere("Masa ayarları", h("div", { sinif: "b-ayarlar" },
      h("label", { sinif: "b-ayar" }, h("span", {}, "Atış süresi"), sec, h("small", {}, "Süre dolarsa faul sayılır, elde top rakibe geçer")),
      h("label", { sinif: "b-ayar" }, h("span", {}, "Kurallar"), kuralSec,
        h("small", {}, oyunVar() ? "Oyun sürerken değişmez" : "Bar: kırışta hangi gruptan çok top girdiyse o senin (eşitse masa açık); grubun belliyken rakibin topunu sokmak faul. Dünya: kırış grubu belirlemez; kendi topunla birlikte rakibinkini sokmak serbest."))));
  }

  function kurallariGoster() {
    pencere("Kurallar (8 top)", h("div", { sinif: "b-kurallar" }, ...[
      "Sol takım ile sağ takım oynar: 1'e 1, 1'e 2 ya da 2'ye 2. İki kişilik takımda oyuncular sırayla atar; tek kişilik takımda o kişi her sırada atar.",
      "Kırışta beyaz soldaki çizginin gerisinde istediğin yere konur. Kırışta top girerse sıra sende kalır.",
      ...(durum && durum.ayar.kural === "dunya" ? [
        "Bu masada dünya kuralı (WPA): kırışta giren toplar grup belirlemez. Kırıştan sonra masa açıktır; soktuğun top grubunu belirler (düz 1–7 ya da çizgili 9–15).",
        "Kendi topunla birlikte rakibin topunu sokmak serbesttir; kendi topunu soktuysan sıra sende kalır."
      ] : [
        "Bu masada bar kuralı: kırışta hangi gruptan daha çok top girdiyse o grup senin olur. Eşit girdiyse masa açık kalır; sonra soktuğun top grubunu belirler.",
        "Grubun belliyken rakibin topunu sokmak faul: sıra rakibe geçer, beyazı istediği yere koyar."
      ]),
      "Kendi grubundan top sokarsan sıra sende kalır. Sokamazsan sıra rakibe geçer.",
      "Faul: beyaz deliğe girerse, beyaz hiçbir topa değmezse, önce rakibin topuna (ya da erken siyaha) değerse, değdikten sonra hiçbir top banda gitmez ve top girmezse. Faulde sıra rakibe geçer ve rakip beyazı istediği yere koyar (elde top).",
      "Grubunu bitirince siyahı (8) sok: kazanırsın. Siyahı erken sokarsan ya da sokarken faul yaparsan kaybedersin. Kırışta giren siyah yerine geri konur.",
      "Nişan: fareyi gezdir (← → ile ince ayar). Vuruş: masaya bas, ıstakayı geri çek, bırak. Ne kadar çekersen o kadar güçlü.",
      "Falso: alttaki beyaz dairede vuracağın noktayı seç. Üst: top ileri devam eder, alt: geri döner, yanlar: bantta kayar."
    ].map((x) => h("p", {}, "• " + x))));
  }

  // ---------- oda düğmesi ve katman ----------
  function dugmeyiGuncelle() {
    if (!tus) return;
    const sayac = tus.querySelector(".okey-sayac");
    if (!durum) { sayac.textContent = ""; return; }
    const oturan = durum.koltuklar.filter((x) => !x.bos).length;
    sayac.textContent = oturan + "/4" + (durum.izleyici ? " · " + durum.izleyici + " izliyor" : "");
  }

  function masayiAc(ac) {
    acik = ac;
    const oda = document.getElementById("oda");
    if (acik && window.okeyMasasi) window.okeyMasasi.kapat();
    oda.classList.toggle("bilardo-acik", acik);
    tus.classList.toggle("acik", acik);
    tus.title = acik ? "Fotoğraflara dön" : "Bilardo masasını aç";
    if (acik) {
      if (!tuval) kur_();
      baglan();
      requestAnimationFrame(boyutla);
      uygula();
    }
  }

  function kur() {
    const oda = document.getElementById("oda");
    const odaAdi = document.getElementById("odaAdi");
    if (!oda || !odaAdi || document.getElementById("bilardoTus")) return;
    tus = document.createElement("button");
    tus.id = "bilardoTus";
    tus.className = "tus-cerceve okey-ac-tus bilardo-ac-tus";
    tus.title = "Bilardo masasını aç";
    tus.innerHTML = '🎱<span class="etiket"> Bilardo</span> <span class="okey-sayac"></span>';
    tus.addEventListener("click", () => masayiAc(!acik));
    (document.getElementById("okeyTus") || odaAdi).after(tus);
    kok = document.createElement("div");
    kok.id = "bilardoKatmani";
    kok.className = "bilardo-katmani";
    oda.insertBefore(kok, oda.querySelector(".oda-ust"));
    if (typeof oturumDegisince === "function") oturumDegisince(() => { if (ws && ws.readyState === 1) merhaba(); });
    if (new URLSearchParams(location.search).has("bilardo")) masayiAc(true);
  }

  function ayril() {
    masayiAc(false);
    const eski = ws;
    ws = null;
    durum = null;
    if (eski) { eski.onclose = null; eski.onmessage = null; eski.close(); }
    dugmeyiGuncelle();
  }


  kur();
  window.bilardoMasasi = {
    ac: () => masayiAc(true), kapat: () => { if (acik) masayiAc(false); }, ayril,
    // Sorun ararken: bağlantı ve masanın durumu (herkesin gördüğü bilgiler)
    tani: () => ({ baglanti: ws ? ws.readyState : null, acik, siram: benSiram(), oynatiliyor: !!oynatilan, uzakNisan: uzak && { k: uzak.k, yx: uzak.yx, cekme: uzak.cekme }, oyun: durum && durum.oyun, ben: durum && durum.ben })
  };
})();
