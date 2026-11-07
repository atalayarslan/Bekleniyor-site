// Okey taş / ıstaka / masa temaları. Her oyuncu kendi ekranındaki görünümü seçer ya da kendi temasını yapar;
// başkalarının ekranını değiştirmez. Tema birkaç temel renkten oluşur, açık/koyu tonları masa.css türetir.
//
// Tema: { id, ad, aciklama, tas, sayilar: [kırmızı, mavi, siyah, sarı], sahte, istaka, kece, ray,
//         doku: "duz"|"mermer"|"sedef"|"inci", desen: "duz"|"sedef"|"altin"|"karbon", neon: bool }
// Kayıt: demoda localStorage ("okeyTema" seçili tema, "okeyTemalarim" kendi temaların). Gerçek sitede
// kullanıcının Firebase kaydında (kullanicilar/$uid/okeyTema) durur; her cihazda aynı tema gelir.
// Paylaşım: "OKT1." + temanın kısa kodu; arkadaşın bu kodu yapıştırıp aynı temayı kullanabilir.

(function () {
  "use strict";

  // Esin kaynakları (araştırma): sedef kakmalı ve ceviz/maun ıstakalar, "Altın İnci" takımlar, renkli plastik
  // takımlar; Rummikub'un beyaz "Alpine" takımı, büyük rakamlı retro takımı, neon/altın aynalı "El Rumi" takımı.
  const HAZIR = [
    { id: "klasik", ad: "Klasik", aciklama: "Fildişi taş, ceviz ıstaka, yeşil çuha",
      tas: "#f7f1df", sayilar: ["#c62f2f", "#1f5fae", "#1d1d1d", "#c98a00"], sahte: "#1c7a4a",
      istaka: "#6b3d1e", kece: "#0f5c3c", ray: "#7a4524", doku: "duz", desen: "duz", neon: false },
    { id: "sedef", ad: "Sedef Kakma", aciklama: "Sedef parıltılı taş, kakmalı koyu ceviz",
      tas: "#f4f1ec", sayilar: ["#b52230", "#1c4f9c", "#1a1a1a", "#b8860b"], sahte: "#1c7a4a",
      istaka: "#3b2416", kece: "#12503a", ray: "#3b2416", doku: "sedef", desen: "sedef", neon: false },
    { id: "ceviz", ad: "Ceviz & Kırmızı Çuha", aciklama: "Kahvehane masası",
      tas: "#f3ead6", sayilar: ["#c0262d", "#1f56a8", "#1b1b1b", "#c27c00"], sahte: "#1c7a4a",
      istaka: "#4a2c17", kece: "#7a1626", ray: "#4a2c17", doku: "duz", desen: "duz", neon: false },
    { id: "maun", ad: "Maun & Lacivert", aciklama: "Kızıl maun, lacivert çuha",
      tas: "#f6f0e2", sayilar: ["#c22a2a", "#2160c4", "#1d1d1d", "#d08a00"], sahte: "#1c7a4a",
      istaka: "#6e2a1c", kece: "#13284f", ray: "#5a2014", doku: "duz", desen: "duz", neon: false },
    { id: "kar", ad: "Kar Beyazı", aciklama: "Beyaz taş ve ıstaka, buz mavisi çuha",
      tas: "#fbfbfd", sayilar: ["#e0313b", "#2a6fe0", "#22252b", "#e09a00"], sahte: "#1c8a5a",
      istaka: "#d9dee6", kece: "#7f97ab", ray: "#c3cad4", doku: "duz", desen: "duz", neon: false },
    { id: "altin", ad: "Altın İnci", aciklama: "İnci taş, altın şeritli siyah lake",
      tas: "#fff6dc", sayilar: ["#b3122a", "#12408f", "#111111", "#b8860b"], sahte: "#1c7a4a",
      istaka: "#151515", kece: "#0b2e22", ray: "#1b1b1b", doku: "inci", desen: "altin", neon: false },
    { id: "neon", ad: "Neon Gece", aciklama: "Koyu taş, parlayan rakamlar",
      tas: "#1c1c24", sayilar: ["#ff4d8d", "#36d6ff", "#b6ff3b", "#ffd23f"], sahte: "#9dff6a",
      istaka: "#121218", kece: "#1d0f33", ray: "#0d0d14", doku: "duz", desen: "karbon", neon: true },
    { id: "mermer", ad: "Mermer", aciklama: "Damarlı beyaz mermer, gri taş ıstaka",
      tas: "#f1f1f1", sayilar: ["#b3202a", "#1d4f9a", "#202020", "#b07a00"], sahte: "#1c7a4a",
      istaka: "#5c5f66", kece: "#1b4d3e", ray: "#3a3d44", doku: "mermer", desen: "duz", neon: false },
    { id: "retro", ad: "Retro", aciklama: "Canlı renkler, hardal plastik ıstaka",
      tas: "#fff8e8", sayilar: ["#e63946", "#1d70d6", "#2b2d42", "#f4a100"], sahte: "#2a9d8f",
      istaka: "#d99a2b", kece: "#1f7a74", ray: "#b5651d", doku: "duz", desen: "duz", neon: false }
  ];

  const DOKULAR = {
    duz: "linear-gradient(transparent, transparent)",
    mermer: "linear-gradient(118deg, transparent 38%, rgba(105,110,122,.22) 40%, transparent 43%), " +
      "linear-gradient(32deg, transparent 58%, rgba(105,110,122,.15) 60%, transparent 62%), " +
      "linear-gradient(160deg, transparent 18%, rgba(140,140,152,.12) 21%, transparent 24%)",
    sedef: "linear-gradient(125deg, rgba(255,190,225,.38), rgba(190,235,255,.38) 35%, rgba(255,250,200,.32) 65%, rgba(215,195,255,.38))",
    inci: "radial-gradient(circle at 30% 18%, rgba(255,255,255,.85), transparent 45%), linear-gradient(135deg, rgba(255,215,140,.28), transparent 60%)"
  };
  const DESENLER = {
    duz: "linear-gradient(transparent, transparent)",
    sedef: "repeating-linear-gradient(45deg, rgba(235,245,255,.17) 0 2px, transparent 2px 13px), " +
      "repeating-linear-gradient(-45deg, rgba(255,230,245,.15) 0 2px, transparent 2px 13px)",
    altin: "repeating-linear-gradient(90deg, transparent 0 22px, rgba(212,175,55,.55) 22px 24px), " +
      "linear-gradient(180deg, rgba(212,175,55,.65) 0 2px, transparent 2px calc(100% - 2px), rgba(212,175,55,.65) calc(100% - 2px))",
    karbon: "repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 3px, transparent 3px 6px)"
  };
  const DOKU_ADI = { duz: "Düz", mermer: "Mermer damarı", sedef: "Sedef parıltısı", inci: "İnci parlaklığı" };
  const DESEN_ADI = { duz: "Düz ahşap", sedef: "Sedef kakma", altin: "Altın şerit", karbon: "Karbon" };
  const RENK = /^#[0-9a-f]{6}$/i;

  function degiskenler(t) {
    return {
      "--tema-tas": t.tas, "--r0": t.sayilar[0], "--r1": t.sayilar[1], "--r2": t.sayilar[2], "--r3": t.sayilar[3],
      "--tema-sahte": t.sahte, "--tema-istaka": t.istaka, "--tema-kece": t.kece, "--tema-ray": t.ray,
      "--tema-tas-doku": DOKULAR[t.doku] || DOKULAR.duz, "--tema-istaka-desen": DESENLER[t.desen] || DESENLER.duz,
      "--tema-sayi-golge": t.neon ? "0 0 6px currentColor, 0 0 14px currentColor" : "none"
    };
  }
  function uygula(t, oge = document.documentElement) {
    for (const [ad, deger] of Object.entries(degiskenler(t))) oge.style.setProperty(ad, deger);
  }

  // Dışarıdan gelen (paylaşım kodu, kayıt) temayı doğrula: sadece renkler ve bilinen seçenekler kabul edilir
  function temizle(t) {
    if (!t || typeof t !== "object") return null;
    const r = (x) => (RENK.test(x) ? x : null);
    const sayilar = Array.isArray(t.sayilar) ? t.sayilar.slice(0, 4).map(r) : [];
    const temiz = {
      id: typeof t.id === "string" ? t.id.slice(0, 40) : "ozel", ad: String(t.ad || "Benim temam").slice(0, 30),
      aciklama: String(t.aciklama || "").slice(0, 80),
      tas: r(t.tas), sayilar, sahte: r(t.sahte), istaka: r(t.istaka), kece: r(t.kece), ray: r(t.ray),
      doku: DOKULAR[t.doku] ? t.doku : "duz", desen: DESENLER[t.desen] ? t.desen : "duz", neon: !!t.neon
    };
    if (!temiz.tas || sayilar.length !== 4 || sayilar.some((x) => !x) || !temiz.sahte || !temiz.istaka || !temiz.kece || !temiz.ray) return null;
    return temiz;
  }

  // ---------- kayıt ve paylaşım ----------
  const oku = (k, v) => { try { const x = JSON.parse(localStorage.getItem(k)); return x == null ? v : x; } catch (e) { return v; } };
  const yaz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const kayitli = () => temizle(oku("okeyTema", null)) || HAZIR[0];
  const temalarim = () => oku("okeyTemalarim", []).map(temizle).filter(Boolean);
  function sec(t) { uygula(t); yaz("okeyTema", t); }

  // Bir kişi en fazla 10 tema kaydedebilir (yönetici dahil)
  const TEMA_SINIRI = 10;
  // Aynı isim varsa Windows'taki dosya kopyaları gibi sonuna (1), (2)... eklenir. haricId: kendisi (üzerine kaydederken)
  function benzersizAd(ad, haricId) {
    const kullanilan = new Set([...HAZIR, ...temalarim()].filter((x) => x.id !== haricId).map((x) => x.ad));
    const kok = String(ad || "Benim temam").replace(/ \(\d+\)$/, "").trim().slice(0, 24) || "Benim temam";
    if (!kullanilan.has(kok)) return kok;
    for (let i = 1; ; i++) if (!kullanilan.has(kok + " (" + i + ")")) return kok + " (" + i + ")";
  }

  function kod(t) {
    const { ad, tas, sayilar, sahte, istaka, kece, ray, doku, desen, neon } = t;
    const metin = JSON.stringify({ ad, tas, sayilar, sahte, istaka, kece, ray, doku, desen, neon });
    return "OKT1." + btoa(unescape(encodeURIComponent(metin))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function koddan(metin) {
    const m = /^OKT1\.([A-Za-z0-9_-]+)$/.exec(String(metin).trim());
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      return temizle(Object.assign(JSON.parse(decodeURIComponent(escape(atob(b64)))), { id: "ozel-" + Date.now().toString(36) }));
    } catch (e) { return null; }
  }

  // ---------- panel ----------
  function h(etiket, ozellik, ...cocuklar) {
    const oge = document.createElement(etiket);
    for (const [k, v] of Object.entries(ozellik || {})) {
      if (v == null || v === false) continue;
      if (k === "sinif") oge.className = v;
      else if (k.startsWith("on")) oge.addEventListener(k.slice(2), v);
      else if (k in oge && k !== "list") oge[k] = v;
      else oge.setAttribute(k, v === true ? "" : v);
    }
    for (const c of cocuklar.flat()) if (c != null && c !== false) oge.append(c);
    return oge;
  }

  // Küçük önizleme: çuha üstünde ıstaka şeridi ve dört taş (dört renk, biri okey yıldızlı)
  function onizleme(t) {
    const kart = h("div", { sinif: "tema-onizleme" });
    uygula(t, kart);
    const tas = (n, r, okey) => h("div", { sinif: "tas kucuk r" + r + (okey ? " okey" : "") }, h("span", { sinif: "sayi" }, String(n)), h("span", { sinif: "nokta" }));
    kart.append(h("div", { sinif: "tema-cuha" }), h("div", { sinif: "tema-istaka" }, tas(7, 0), tas(12, 1), tas(9, 2), tas(4, 3, true)));
    return kart;
  }

  // Tema seçme ve yapma paneli. degisti(t): seçilen tema değişince (isteğe bağlı)
  function panel(degisti = () => { }) {
    let secili = kayitli();
    const kok = h("div", { sinif: "tema-paneli" });
    const ciz = () => kok.replaceChildren(...bolumler());
    const temaSec = (t) => { secili = t; sec(t); degisti(t); ciz(); };

    function kartlar(liste, silinebilir) {
      return h("div", { sinif: "tema-kartlari" }, liste.map((t) => h("button", {
        sinif: "okey-tema-karti" + (secili.id === t.id ? " secili" : ""), type: "button", title: t.aciklama || t.ad,
        onclick: () => temaSec(t)
      }, onizleme(t), h("b", {}, t.ad), t.aciklama ? h("small", {}, t.aciklama) : null,
        silinebilir ? h("span", {
          sinif: "tema-sil", title: "Bu temayı sil", onclick: (e) => {
            e.stopPropagation();
            yaz("okeyTemalarim", temalarim().filter((x) => x.id !== t.id));
            ciz();
          }
        }, "✕") : null)));
    }

    function yapici() {
      // Seçili temadan başlanır; her değişiklik hemen bütün masaya uygulanır (arkada görünür)
      const t = JSON.parse(JSON.stringify(secili));
      const kendiTemam = temalarim().some((x) => x.id === secili.id);
      const canli = () => { uygula(t); kodAlani.value = kod(t); };
      const renk = (etiket, deger, ata) => h("label", { sinif: "tema-alan" }, h("span", {}, etiket),
        h("input", { type: "color", value: deger, oninput: (e) => { ata(e.target.value); canli(); } }));
      const secim = (etiket, secenekler, deger, ata) => h("label", { sinif: "tema-alan" }, h("span", {}, etiket),
        h("select", { onchange: (e) => { ata(e.target.value); canli(); } },
          Object.entries(secenekler).map(([k, ad]) => h("option", { value: k, selected: k === deger }, ad))));
      const ad = h("input", { type: "text", value: t.ad && !HAZIR.some((x) => x.id === t.id) ? t.ad : "Benim temam", maxLength: 30, placeholder: "Temanın adı" });
      const kodAlani = h("input", { type: "text", readOnly: true, value: kod(t), onclick: (e) => e.target.select() });
      const yapistir = h("input", { type: "text", placeholder: "Arkadaşının tema kodunu yapıştır (OKT1. ile başlar)" });
      const hata = h("small", { sinif: "tema-hata" });
      return h("div", { sinif: "tema-yapici" },
        h("div", { sinif: "tema-alanlar" },
          renk("Taş yüzü", t.tas, (v) => (t.tas = v)),
          renk("Kırmızı", t.sayilar[0], (v) => (t.sayilar[0] = v)),
          renk("Mavi", t.sayilar[1], (v) => (t.sayilar[1] = v)),
          renk("Siyah", t.sayilar[2], (v) => (t.sayilar[2] = v)),
          renk("Sarı", t.sayilar[3], (v) => (t.sayilar[3] = v)),
          renk("Sahte okey", t.sahte, (v) => (t.sahte = v)),
          renk("Istaka", t.istaka, (v) => (t.istaka = v)),
          renk("Çuha", t.kece, (v) => (t.kece = v)),
          renk("Masa kenarı", t.ray, (v) => (t.ray = v)),
          secim("Taş dokusu", DOKU_ADI, t.doku, (v) => (t.doku = v)),
          secim("Istaka deseni", DESEN_ADI, t.desen, (v) => (t.desen = v)),
          h("label", { sinif: "tema-alan tema-kutu" }, h("input", { type: "checkbox", checked: t.neon, onchange: (e) => { t.neon = e.target.checked; canli(); } }), h("span", {}, "Neon rakamlar"))),
        h("div", { sinif: "tema-satir" }, ad,
          // Kaydet: açık olan kendi temanın üzerine yazar (hazır temalar değişmez)
          h("button", {
            sinif: "okey-tus ana", type: "button", disabled: !kendiTemam,
            title: kendiTemam ? "Bu temanın üzerine kaydet" : "Hazır tema değiştirilemez; 'Çoğalt ve kaydet' ile kendi kopyanı yap",
            onclick: () => {
              const guncel = Object.assign({}, t, { id: secili.id, ad: benzersizAd(ad.value.trim(), secili.id), aciklama: "Kendi temam" });
              yaz("okeyTemalarim", temalarim().map((x) => (x.id === secili.id ? guncel : x)));
              temaSec(guncel);
            }
          }, "Kaydet"),
          // Çoğalt ve kaydet: değişikliklerle yeni bir tema
          h("button", {
            sinif: "okey-tus" + (kendiTemam ? "" : " ana"), type: "button", onclick: () => {
              if (temalarim().length >= TEMA_SINIRI) { hata.textContent = "En fazla " + TEMA_SINIRI + " tema kaydedebilirsin; önce birini sil (✕)."; return; }
              const yeni = Object.assign({}, t, { id: "ozel-" + Date.now().toString(36), ad: benzersizAd(ad.value.trim()), aciklama: "Kendi temam" });
              yaz("okeyTemalarim", [...temalarim(), yeni]);
              temaSec(yeni);
            }
          }, "Çoğalt ve kaydet"),
          h("button", { sinif: "okey-tus", type: "button", onclick: () => { uygula(secili); ciz(); } }, "Vazgeç")),
        h("div", { sinif: "tema-satir" }, h("span", { sinif: "tema-etiket" }, "Paylaşım kodu"), kodAlani,
          h("button", { sinif: "okey-tus", type: "button", onclick: () => { kodAlani.select(); navigator.clipboard && navigator.clipboard.writeText(kodAlani.value); } }, "Kopyala")),
        h("div", { sinif: "tema-satir" }, yapistir,
          h("button", {
            sinif: "okey-tus", type: "button", onclick: () => {
              const gelen = koddan(yapistir.value);
              if (!gelen) { hata.textContent = "Bu kod okunamadı."; return; }
              if (temalarim().length >= TEMA_SINIRI) { hata.textContent = "En fazla " + TEMA_SINIRI + " tema kaydedebilirsin; önce birini sil (✕)."; return; }
              gelen.ad = benzersizAd(gelen.ad);
              yaz("okeyTemalarim", [...temalarim(), gelen]);
              temaSec(gelen);
            }
          }, "Yükle")), hata);
    }

    function bolumler() {
      const benim = temalarim();
      return [
        h("p", { sinif: "tema-not" }, "Tema sadece senin ekranını değiştirir: taşların, ıstakaların ve masa. Seçtiğin hemen uygulanır."),
        h("h4", {}, "Hazır temalar"), kartlar(HAZIR, false),
        benim.length ? h("h4", {}, "Benim temalarım (" + benim.length + "/" + TEMA_SINIRI + ")") : null, benim.length ? kartlar(benim, true) : null,
        h("h4", {}, "Kendi temanı yap"), yapici()
      ].filter(Boolean);
    }
    ciz();
    return kok;
  }

  window.OkeyTema = { HAZIR, uygula, sec, kayitli, temalarim, kod, koddan, temizle, panel, onizleme, benzersizAd, TEMA_SINIRI };
})();
