// Bilardo görünümleri: ıstaka skinleri ve top setleri (oyunu etkilemez, sadece çizim).
// Istaka skinini masadaki herkes görür (sunucu atış sırasındakinin seçimini iletir); top seti her oyuncunun kendi
// ekranındadır. Nadirlik: sıradan · nadir · destansı · efsanevi. Bazı skinler canlıdır (parlar, kıvılcım, şimşek).
//
// BilardoGorunum.istakaCiz(c, x1, y1, x2, y2, id, zaman)   x1,y1: uç (beyaza yakın), x2,y2: kabza
// BilardoGorunum.topCiz(c, no, x, y, R, setId, dik)
// BilardoGorunum.ISTAKALAR / TOP_SETLERI / NADIRLIK / canliMi(id)

(function () {
  "use strict";

  const NADIRLIK = {
    siradan: { ad: "Sıradan", renk: "#9aa0a6" },
    nadir: { ad: "Nadir", renk: "#4aa3ff" },
    destansi: { ad: "Destansı", renk: "#b26bff" },
    efsanevi: { ad: "Efsanevi", renk: "#ffb020" }
  };

  // Tohumlu rastgele: her ıstakanın deseni hep aynı (çatlaklar, yıldızlar, pullar)
  function tohum(s) {
    let x = s >>> 0 || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }

  // Istakanın şekli (yerel eksende: 0 = uç, L = kabza), uçta ince kabzada kalın
  const UC = 2.6, KABZA = 5.4;
  function kalinlik(t) { return UC + (KABZA - UC) * Math.pow(t, 0.8); }
  function govdeYolu(c, L, a = 0, b = 1) {
    c.beginPath();
    c.moveTo(a * L, -kalinlik(a));
    for (let i = 1; i <= 12; i++) { const t = a + (b - a) * i / 12; c.lineTo(t * L, -kalinlik(t)); }
    if (b >= 1) c.arc(L, 0, KABZA, -Math.PI / 2, Math.PI / 2);
    for (let i = 12; i >= 0; i--) { const t = a + (b - a) * i / 12; c.lineTo(t * L, kalinlik(t)); }
    c.closePath();
  }
  function bolge(c, L, a, b, dolgu) { govdeYolu(c, L, a, b); c.fillStyle = dolgu; c.fill(); }
  function halka(c, L, t, en, renk) { bolge(c, L, t, t + en, renk); }
  // Uzunlamasına geçiş (ıstakanın boyunca)
  function boyunca(c, L, duraklar) {
    const g = c.createLinearGradient(0, 0, L, 0);
    for (const [o, r] of duraklar) g.addColorStop(o, r);
    return g;
  }
  // Silindir ışığı: üstü parlak, altı koyu (her ıstakanın üstüne)
  function silindir(c, L) {
    govdeYolu(c, L);
    const g = c.createLinearGradient(0, -KABZA, 0, KABZA);
    g.addColorStop(0, "rgba(255,255,255,.38)"); g.addColorStop(0.35, "rgba(255,255,255,.06)");
    g.addColorStop(0.6, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.4)");
    c.fillStyle = g; c.fill();
  }
  // Uç (mavi tebeşirli deri) ve beyaz yüksük
  function uc(c, L, tebesir = "#2f76c4") {
    bolge(c, L, 0, 0.008, tebesir);
    bolge(c, L, 0.008, 0.03, "#f3efe4");
  }

  const ISTAKALAR = [
    {
      id: "klasik", ad: "Akçaağaç", nadirlik: "siradan", aciklama: "Bar masalarının emektarı",
      ciz(c, L) {
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#f3dcab"], [0.6, "#d8a862"], [1, "#c99250"]]));
        bolge(c, L, 0.62, 1, boyunca(c, L, [[0.62, "#4a2c16"], [1, "#2d190b"]]));
        halka(c, L, 0.62, 0.012, "#111");
        bolge(c, L, 0.7, 0.86, "#1b1b1b");
        halka(c, L, 0.94, 0.012, "#c9c2b0");
        uc(c, L);
      }
    },
    {
      id: "gece", ad: "Gece Avcısı", nadirlik: "nadir", aciklama: "Mat siyah, gümüş kakma",
      ciz(c, L) {
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#3a3b42"], [1, "#16171b"]]));
        // gümüş kakma çizgileri
        c.strokeStyle = "rgba(220,225,235,.7)"; c.lineWidth = 0.7;
        for (let i = 0; i < 5; i++) {
          const t = 0.64 + i * 0.05;
          c.beginPath(); c.moveTo(t * L, -kalinlik(t)); c.lineTo((t + 0.025) * L, 0); c.lineTo(t * L, kalinlik(t)); c.stroke();
        }
        bolge(c, L, 0.72, 0.88, "#0c0c0e");
        for (let i = 0; i < 26; i++) { const t = 0.72 + i * 0.006; halka(c, L, t, 0.0015, "rgba(255,255,255,.08)"); }
        halka(c, L, 0.62, 0.008, "#d9dde5"); halka(c, L, 0.95, 0.01, "#d9dde5");
        uc(c, L, "#1c1c1c");
      }
    },
    {
      id: "buz", ad: "Buz Kristali", nadirlik: "destansi", canli: true, aciklama: "Dokunduğu topu dondurur (gibi)",
      ciz(c, L, z) {
        c.save(); c.shadowColor = "rgba(120,220,255,.85)"; c.shadowBlur = 10;
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#f0fcff"], [0.5, "#a6e6f7"], [1, "#4fb3d6"]]));
        c.restore();
        // kristal kesikleri
        const r = tohum(7);
        c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 0.6;
        for (let i = 0; i < 18; i++) {
          const t = 0.08 + r() * 0.88, k = kalinlik(t);
          c.beginPath(); c.moveTo(t * L, -k); c.lineTo((t + 0.02) * L, (r() - 0.5) * k); c.lineTo((t + 0.008) * L, k); c.stroke();
        }
        halka(c, L, 0.62, 0.01, "#e8fbff"); halka(c, L, 0.95, 0.012, "#e8fbff");
        // ıstaka boyunca kayan parıltılar
        for (let i = 0; i < 4; i++) {
          const t = ((z / 2600 + i / 4) % 1), k = kalinlik(t) * 0.4;
          c.fillStyle = "rgba(255,255,255," + (0.6 + 0.4 * Math.sin(z / 200 + i)) + ")";
          c.beginPath(); c.arc(t * L, -k, 1.6, 0, 7); c.fill();
        }
        uc(c, L, "#8fe3ff");
      }
    },
    {
      id: "siber", ad: "Neon Siber", nadirlik: "destansi", canli: true, aciklama: "Gece kulübünden çıkıp geldi",
      ciz(c, L, z) {
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#2a2a38"], [1, "#14141c"]]));
        const n = 0.6 + 0.4 * Math.sin(z / 260);
        c.save();
        c.shadowBlur = 8 + 6 * n;
        for (const [renk, y] of [["#ff2bd6", -0.45], ["#29f3ff", 0.45]]) {
          c.shadowColor = renk; c.strokeStyle = renk; c.lineWidth = 1.1;
          c.beginPath();
          for (let i = 0; i <= 40; i++) { const t = 0.04 + i * 0.024; c.lineTo(t * L, y * kalinlik(t)); }
          c.stroke();
        }
        c.restore();
        // devre çizgileri
        c.strokeStyle = "rgba(41,243,255," + (0.35 + 0.35 * n) + ")"; c.lineWidth = 0.6;
        for (let i = 0; i < 8; i++) { const t = 0.66 + i * 0.035; c.beginPath(); c.moveTo(t * L, -kalinlik(t)); c.lineTo(t * L, 0); c.lineTo((t + 0.015) * L, 0); c.stroke(); }
        halka(c, L, 0.62, 0.008, "rgba(255,43,214," + (0.6 + 0.4 * n) + ")");
        halka(c, L, 0.95, 0.008, "rgba(41,243,255," + (0.6 + 0.4 * n) + ")");
        uc(c, L, "#ff2bd6");
      }
    },
    {
      id: "kral", ad: "Altın Kral", nadirlik: "efsanevi", canli: true, aciklama: "Masanın tek sahibi",
      ciz(c, L, z) {
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#fff1b8"], [0.3, "#f2c230"], [0.6, "#b8860b"], [1, "#7a5800"]]));
        // oyma elmas deseni
        c.strokeStyle = "rgba(90,60,0,.55)"; c.lineWidth = 0.5;
        for (let i = 0; i < 16; i++) {
          const t = 0.63 + i * 0.019, k = kalinlik(t);
          c.beginPath(); c.moveTo(t * L, 0); c.lineTo((t + 0.0095) * L, -k); c.lineTo((t + 0.019) * L, 0); c.lineTo((t + 0.0095) * L, k); c.closePath(); c.stroke();
        }
        halka(c, L, 0.6, 0.02, "#2a1d00");
        // yakut
        c.save(); c.shadowColor = "#ff2a4a"; c.shadowBlur = 6 + 4 * Math.sin(z / 300);
        c.fillStyle = "#e0143c"; c.beginPath(); c.arc(0.61 * L, 0, 2.6, 0, 7); c.fill(); c.restore();
        c.fillStyle = "rgba(255,255,255,.8)"; c.beginPath(); c.arc(0.61 * L - 0.8, -0.9, 0.7, 0, 7); c.fill();
        halka(c, L, 0.95, 0.02, "#2a1d00");
        // ışık süzülmesi
        const t = (z / 3000) % 1;
        govdeYolu(c, L);
        const g = c.createLinearGradient((t - 0.08) * L, 0, (t + 0.08) * L, 0);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.fill();
        uc(c, L, "#2a1d00");
      }
    },
    {
      id: "ejderha", ad: "Ejderha Nefesi", nadirlik: "efsanevi", canli: true, aciklama: "Pulları hâlâ sıcak",
      ciz(c, L, z) {
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#6b0f0f"], [0.5, "#3a0505"], [1, "#160202"]]));
        // altın pullar
        c.strokeStyle = "rgba(242,180,60,.75)"; c.lineWidth = 0.55;
        for (let i = 0; i < 46; i++) {
          const t = 0.06 + i * 0.02, k = kalinlik(t);
          for (const y of [-0.5, 0, 0.5]) { c.beginPath(); c.arc(t * L + (y === 0 ? 0.01 * L : 0), y * k, k * 0.42, -Math.PI / 2, Math.PI / 2); c.stroke(); }
        }
        halka(c, L, 0.62, 0.015, "#f2b43c"); halka(c, L, 0.95, 0.015, "#f2b43c");
        // kabzada kor
        const n = 0.55 + 0.45 * Math.sin(z / 180) * Math.sin(z / 77);
        c.save(); c.shadowColor = "#ff6a00"; c.shadowBlur = 14 * n + 4;
        c.fillStyle = "rgba(255," + Math.round(120 + 80 * n) + ",20,.95)";
        c.beginPath(); c.arc(L + 1, 0, 3.4, 0, 7); c.fill(); c.restore();
        // kabzadan kıvılcımlar
        const r = tohum(Math.floor(z / 90));
        for (let i = 0; i < 5; i++) {
          c.fillStyle = "rgba(255," + Math.round(140 + r() * 100) + ",40," + (0.4 + r() * 0.6) + ")";
          c.beginPath(); c.arc(L + 4 + r() * 12, (r() - 0.5) * 14, 0.6 + r() * 1.1, 0, 7); c.fill();
        }
        uc(c, L, "#f2b43c");
      }
    },
    {
      id: "lav", ad: "Lav Çekirdeği", nadirlik: "efsanevi", canli: true, aciklama: "Volkandan söküldü",
      ciz(c, L, z) {
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#2a2422"], [1, "#0f0b0a"]]));
        const n = 0.5 + 0.5 * Math.sin(z / 400);
        const r = tohum(11);
        c.save(); c.lineJoin = "round";
        govdeYolu(c, L); c.clip();   // çatlaklar ıstakanın içinde kalsın
        c.shadowColor = "#ff5a00"; c.shadowBlur = 6 + 6 * n;
        c.strokeStyle = "rgb(255," + Math.round(110 + 70 * n) + ",20)"; c.lineWidth = 0.9;
        for (let s = 0; s < 3; s++) {
          let t = 0.05 + s * 0.3, y = (r() - 0.5) * 2;
          c.beginPath(); c.moveTo(t * L, y);
          while (t < 0.05 + (s + 1) * 0.3 && t < 0.99) {
            t += 0.012 + r() * 0.02;
            const k = kalinlik(Math.min(t, 1)) * 0.85;
            y = Math.max(-k, Math.min(k, y + (r() - 0.5) * 3.2));
            c.lineTo(t * L, y);
          }
          c.stroke();
        }
        c.restore();
        halka(c, L, 0.62, 0.01, "#ff7a1a"); halka(c, L, 0.95, 0.01, "#ff7a1a");
        uc(c, L, "#ff7a1a");
      }
    },
    {
      id: "galaksi", ad: "Galaksi", nadirlik: "efsanevi", canli: true, aciklama: "İçinde bir evren dönüyor",
      ciz(c, L, z) {
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#3a1c71"], [0.35, "#1d1450"], [0.65, "#47127a"], [1, "#0a0a2a"]]));
        // bulutsu
        const k = c.createRadialGradient(0.45 * L, 0, 2, 0.45 * L, 0, 0.25 * L);
        k.addColorStop(0, "rgba(255,90,200,.45)"); k.addColorStop(1, "rgba(255,90,200,0)");
        govdeYolu(c, L); c.fillStyle = k; c.fill();
        const k2 = c.createRadialGradient(0.8 * L, 0, 2, 0.8 * L, 0, 0.18 * L);
        k2.addColorStop(0, "rgba(90,200,255,.4)"); k2.addColorStop(1, "rgba(90,200,255,0)");
        govdeYolu(c, L); c.fillStyle = k2; c.fill();
        // yanıp sönen yıldızlar
        const r = tohum(23);
        for (let i = 0; i < 34; i++) {
          const t = 0.04 + r() * 0.95, y = (r() - 0.5) * 1.6 * kalinlik(t), f = r() * 6.28;
          c.fillStyle = "rgba(255,255,255," + (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(z / 300 + f))) + ")";
          c.beginPath(); c.arc(t * L, y, 0.35 + r() * 0.6, 0, 7); c.fill();
        }
        halka(c, L, 0.62, 0.008, "#c9b8ff"); halka(c, L, 0.95, 0.008, "#c9b8ff");
        uc(c, L, "#c9b8ff");
      }
    },
    {
      id: "simsek", ad: "Yıldırım", nadirlik: "efsanevi", canli: true, aciklama: "Vuruştan önce gök gürler",
      ciz(c, L, z) {
        bolge(c, L, 0, 1, boyunca(c, L, [[0, "#1b2a55"], [1, "#070b1e"]]));
        // parlayan çekirdek
        c.save(); c.shadowColor = "#5ec8ff"; c.shadowBlur = 8;
        c.strokeStyle = "rgba(140,220,255,.9)"; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(0.03 * L, 0); c.lineTo(0.98 * L, 0); c.stroke();
        // her 80 ms'de yeniden çakan şimşekler
        const r = tohum(Math.floor(z / 80) + 1);
        c.strokeStyle = "#e6f7ff"; c.lineWidth = 0.9; c.shadowColor = "#8fd8ff"; c.shadowBlur = 10;
        for (let s = 0; s < 2; s++) {
          let t = 0.05 + r() * 0.5, y = 0;
          c.beginPath(); c.moveTo(t * L, y);
          const son = t + 0.18 + r() * 0.25;
          while (t < son && t < 0.98) {
            t += 0.01 + r() * 0.025;
            const k = kalinlik(Math.min(t, 1)) * 1.6;
            y = Math.max(-k, Math.min(k, y + (r() - 0.5) * 5));
            c.lineTo(t * L, y);
          }
          c.stroke();
        }
        c.restore();
        halka(c, L, 0.62, 0.01, "#9fe0ff"); halka(c, L, 0.95, 0.01, "#9fe0ff");
        uc(c, L, "#9fe0ff");
      }
    }
  ];

  function istakaBul(id) { return ISTAKALAR.find((x) => x.id === id) || ISTAKALAR[0]; }

  function istakaCiz(c, x1, y1, x2, y2, id, zaman) {
    const s = istakaBul(id);
    const L = Math.hypot(x2 - x1, y2 - y1);
    c.save();
    c.lineCap = "round";
    // gölge
    c.translate(x1, y1);
    c.rotate(Math.atan2(y2 - y1, x2 - x1));
    c.save(); c.translate(2, 6); govdeYolu(c, L); c.fillStyle = "rgba(0,0,0,.32)"; c.fill(); c.restore();
    s.ciz(c, L, zaman || 0);
    silindir(c, L);
    c.restore();
  }

  // ---------- top setleri ----------
  const RENKLER = ["#f4f1e8", "#f2c230", "#1f5fbf", "#d63a2f", "#6a3fa3", "#f07f1a", "#1f8a4c", "#8a2b2b", "#141414",
    "#f2c230", "#1f5fbf", "#d63a2f", "#6a3fa3", "#f07f1a", "#1f8a4c", "#8a2b2b"];
  const PASTEL = ["#fbf7ef", "#ffe08a", "#8fb8ff", "#ff9a8f", "#c4a6ff", "#ffbf80", "#8fdcb0", "#d99a9a", "#4a4a5a",
    "#ffe08a", "#8fb8ff", "#ff9a8f", "#c4a6ff", "#ffbf80", "#8fdcb0", "#d99a9a"];

  function sayiYaz(c, i, x, y, R, dik, renk, golge) {
    c.fillStyle = renk || "#111";
    c.font = "bold " + (i > 9 ? 9 : 10.5) * R / 12 + "px Nunito, Arial, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.save(); c.translate(x, y); if (dik) c.rotate(Math.PI / 2);
    if (golge) { c.shadowColor = golge; c.shadowBlur = 6; }
    c.fillText(String(i), 0, 0.6 * R / 12);
    c.restore();
  }
  function isik(c, x, y, R, guc = 1) {
    const p = c.createRadialGradient(x - R * 0.4, y - R * 0.45, 1, x, y, R * 1.05);
    p.addColorStop(0, "rgba(255,255,255," + 0.75 * guc + ")"); p.addColorStop(0.25, "rgba(255,255,255," + 0.12 * guc + ")"); p.addColorStop(1, "rgba(0,0,0,.28)");
    c.fillStyle = p; c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
  }
  // Klasik çizim (renk dizisi değişebilir)
  function klasikTop(renkler) {
    return (c, i, x, y, R, dik) => {
      c.beginPath(); c.arc(x, y, R, 0, 7); c.closePath();
      c.fillStyle = i >= 9 ? renkler[0] : renkler[i]; c.fill();
      if (i >= 9) { c.save(); c.clip(); c.fillStyle = renkler[i]; c.fillRect(x - R, y - R * 0.55, 2 * R, R * 1.1); c.restore(); }
      if (i > 0) {
        c.fillStyle = "#fbfaf4"; c.beginPath(); c.arc(x, y, R * 0.5, 0, 7); c.fill();
        sayiYaz(c, i, x, y, R, dik);
      }
      isik(c, x, y, R);
    };
  }

  const TOP_SETLERI = [
    { id: "klasik", ad: "Klasik", nadirlik: "siradan", aciklama: "Turnuva standardı", ciz: klasikTop(RENKLER) },
    { id: "pastel", ad: "Pastel", nadirlik: "siradan", aciklama: "Yumuşak tonlar", ciz: klasikTop(PASTEL) },
    {
      id: "mermer", ad: "Mermer", nadirlik: "nadir", aciklama: "Taştan oyulmuş",
      ciz(c, i, x, y, R, dik) {
        c.save();
        c.beginPath(); c.arc(x, y, R, 0, 7); c.closePath();
        c.fillStyle = i >= 9 ? "#efe9dc" : RENKLER[i]; c.fill(); c.clip();
        if (i >= 9) { c.fillStyle = RENKLER[i]; c.fillRect(x - R, y - R * 0.55, 2 * R, R * 1.1); }
        // damarlar
        const r = tohum(i * 97 + 5);
        c.strokeStyle = i === 8 ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.45)"; c.lineWidth = 0.7;
        for (let s = 0; s < 3; s++) {
          c.beginPath(); c.moveTo(x - R + r() * R * 0.4, y - R + r() * 2 * R);
          c.bezierCurveTo(x - R * 0.3 + r() * R * 0.6, y - R + r() * 2 * R, x + r() * R * 0.5, y - R + r() * 2 * R, x + R, y - R + r() * 2 * R);
          c.stroke();
        }
        c.restore();
        if (i > 0) { c.fillStyle = "#f7f2e6"; c.beginPath(); c.arc(x, y, R * 0.48, 0, 7); c.fill(); sayiYaz(c, i, x, y, R, dik, "#2a2a2a"); }
        isik(c, x, y, R, 0.9);
      }
    },
    {
      id: "neon", ad: "Neon", nadirlik: "destansi", aciklama: "Karanlıkta parlar",
      ciz(c, i, x, y, R, dik) {
        const renk = i === 0 ? "#ffffff" : i === 8 ? "#b26bff" : RENKLER[i];
        c.save();
        c.beginPath(); c.arc(x, y, R, 0, 7); c.fillStyle = "#0b0b10"; c.fill();
        c.shadowColor = renk; c.shadowBlur = 10;
        c.strokeStyle = renk; c.lineWidth = i >= 9 ? 1.4 : 2.2;
        c.beginPath(); c.arc(x, y, R - 1.4, 0, 7); c.stroke();
        if (i >= 9) { c.beginPath(); c.moveTo(x - R * 0.8, y - R * 0.45); c.lineTo(x + R * 0.8, y - R * 0.45); c.moveTo(x - R * 0.8, y + R * 0.45); c.lineTo(x + R * 0.8, y + R * 0.45); c.stroke(); }
        if (i === 0) { c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.arc(x, y, R * 0.35, 0, 7); c.fill(); }
        c.restore();
        if (i > 0) sayiYaz(c, i, x, y, R, dik, renk, renk);
        isik(c, x, y, R, 0.5);
      }
    },
    {
      id: "mucevher", ad: "Mücevher", nadirlik: "efsanevi", aciklama: "Her biri kesilmiş bir taş",
      ciz(c, i, x, y, R, dik) {
        const renk = i === 0 ? "#e8f4ff" : i === 8 ? "#1a1a24" : RENKLER[i];
        c.save();
        c.beginPath(); c.arc(x, y, R, 0, 7); c.closePath(); c.clip();
        const g = c.createRadialGradient(x - R * 0.3, y - R * 0.3, 1, x, y, R);
        g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, renk); g.addColorStop(1, "#000");
        c.fillStyle = g; c.fillRect(x - R, y - R, 2 * R, 2 * R);
        // fasetalar
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          c.fillStyle = k % 2 ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.18)";
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * R * 1.2, y + Math.sin(a) * R * 1.2); c.lineTo(x + Math.cos(a + Math.PI / 4) * R * 1.2, y + Math.sin(a + Math.PI / 4) * R * 1.2); c.fill();
        }
        if (i >= 9) { c.fillStyle = "rgba(255,255,255,.5)"; c.fillRect(x - R, y - R * 0.62, 2 * R, R * 0.14); c.fillRect(x - R, y + R * 0.48, 2 * R, R * 0.14); }
        c.restore();
        if (i > 0) { c.fillStyle = "rgba(255,255,255,.92)"; c.beginPath(); c.arc(x, y, R * 0.42, 0, 7); c.fill(); sayiYaz(c, i, x, y, R, dik, "#111"); }
        // parıltı yıldızı
        c.fillStyle = "rgba(255,255,255,.95)";
        const sx = x - R * 0.42, sy = y - R * 0.45, u = R * 0.32;
        c.beginPath(); c.moveTo(sx, sy - u); c.lineTo(sx + u * 0.18, sy - u * 0.18); c.lineTo(sx + u, sy); c.lineTo(sx + u * 0.18, sy + u * 0.18);
        c.lineTo(sx, sy + u); c.lineTo(sx - u * 0.18, sy + u * 0.18); c.lineTo(sx - u, sy); c.lineTo(sx - u * 0.18, sy - u * 0.18); c.closePath(); c.fill();
      }
    },
    {
      id: "metal", ad: "Altın ve Krom", nadirlik: "efsanevi", aciklama: "Düzler altın, çizgililer krom",
      ciz(c, i, x, y, R, dik) {
        c.save();
        c.beginPath(); c.arc(x, y, R, 0, 7); c.closePath(); c.clip();
        const metal = (a, b, d) => {
          const g = c.createLinearGradient(x - R, y - R, x + R, y + R);
          g.addColorStop(0, a); g.addColorStop(0.45, b); g.addColorStop(0.55, d); g.addColorStop(1, a);
          return g;
        };
        c.fillStyle = i === 0 ? metal("#fffdf6", "#ffffff", "#d9d6cc") : i === 8 ? metal("#4a4a52", "#9a9aa6", "#1a1a1f")
          : i >= 9 ? metal("#cfd4da", "#ffffff", "#8a9097") : metal("#b8860b", "#fff1b8", "#8a6400");
        c.fillRect(x - R, y - R, 2 * R, 2 * R);
        if (i >= 9) { c.fillStyle = RENKLER[i]; c.fillRect(x - R, y - R * 0.42, 2 * R, R * 0.84); }
        else if (i > 0 && i < 8) { c.strokeStyle = RENKLER[i]; c.lineWidth = 2.4; c.beginPath(); c.arc(x, y, R - 1.2, 0, 7); c.stroke(); }
        c.restore();
        if (i > 0) { c.fillStyle = "#fbfaf4"; c.beginPath(); c.arc(x, y, R * 0.46, 0, 7); c.fill(); sayiYaz(c, i, x, y, R, dik); }
        isik(c, x, y, R, 1.1);
      }
    }
  ];
  function setBul(id) { return TOP_SETLERI.find((x) => x.id === id) || TOP_SETLERI[0]; }

  function topCiz(c, i, x, y, R, setId, dik) { setBul(setId).ciz(c, i, x, y, R, dik); }

  window.BilardoGorunum = {
    NADIRLIK, ISTAKALAR, TOP_SETLERI, istakaCiz, topCiz,
    canliMi: (id) => !!istakaBul(id).canli, istakaBul, setBul
  };
})();
