// Oyun kabuğu: odadaki bütün oyunların (okey, bilardo ve sonra eklenecekler) ortak arayüz parçaları.
// Oyundan oyuna değişen tek şey ortadaki oyun alanıdır; koltuk, menü, sıra göstergesi, olay bildirimi, pencereler ve
// oyun sonu ekranı buradan gelir. Böylece her oyun aynı yerde, aynı görünümde, aynı düğmelerle çalışır.
//
// Kullanım:  const K = OyunKabugu(kokOge, { oyun: "bilardo" });
//   K.h(...)                       küçük DOM yardımcısı
//   K.koltuk({...})                koltuk öğesi (avatar, süre halkası, ad, alt yazı, ek, eylem menüsü)
//   K.menu([...])                  sağ üstteki oyun menüsü (sabit sıra: Ses · Ayarlar · Kurallar · özel · Oyunu bitir · Kalk)
//   K.sira({ benim, yazi, oran })  "Sıra sende" şeridi / durum yazısı ve süre çizgisi
//   K.bildir(metin, tur)           oyun alanının ortasında olay bildirimi (bilgi | uyari | basari)
//   K.pencere(baslik, govde, tuslar, secenek)
//   K.onayla({ baslik, metin, evet, is, tehlikeli })
//   K.kalkSor(metin, is)
//   K.oyunSonu({ baslik, kazanan, oyuncular, ozet, tuslar, ek })
//   K.sesAcik() / K.sesDegistir() / K.sesCal(tur)
//
// Yeni oyun eklerken kontrol listesi: oyun/KONTROL.md

(function () {
  "use strict";

  function h(etiket, ozellik, ...cocuklar) {
    const e = document.createElement(etiket);
    for (const [a, v] of Object.entries(ozellik || {})) {
      if (v == null || v === false) continue;
      if (a === "sinif") e.className = v;
      else if (a === "stil") for (const [k, d] of Object.entries(v)) { if (k.startsWith("--")) e.style.setProperty(k, d); else e.style[k] = d; }
      else if (a === "veri") for (const [k, d] of Object.entries(v)) e.dataset[k] = d;
      else if (a.startsWith("on")) e.addEventListener(a.slice(2), v);
      else e.setAttribute(a, v === true ? "" : v);
    }
    for (const c of cocuklar.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
    return e;
  }

  // ---------- ikonlar (tek takım: ince çizgili, 24'lük çerçeve) ----------
  const YOLLAR = {
    sesAcik: "M4 9v6h4l5 4V5L8 9H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11",
    sesKapali: "M4 9v6h4l5 4V5L8 9H4z M17 9l5 6 M22 9l-5 6",
    ayar: "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z",
    kural: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11 M9 8h6",
    bitir: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M9 9h6v6H9z",
    kalk: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10",
    tema: "M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.2-1-1.4-1-2.4 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z M7.5 11.5h.01 M10 7.5h.01 M14.5 7.5h.01",
    cetele: "M8 4h8v3H8z M6 5H5v15h14V5h-1 M9 11h6 M9 15h4",
    bot: "M7 8h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M12 4v4 M9.5 13h.01 M14.5 13h.01 M3 13v2 M21 13v2",
    arti: "M12 5v14 M5 12h14",
    uyari: "M12 4l9 16H3z M12 10v4 M12 17h.01",
    bilgi: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 11v5 M12 8h.01",
    basari: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M8 12.5l2.5 2.5L16 9.5",
    kupa: "M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M9 20h6 M10 17h4",
    kapat: "M6 6l12 12 M18 6L6 18",
    tamEkran: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
    kucult: "M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5"
  };
  function ikon(ad, sinif) {
    const ns = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", "oyun-ikon" + (sinif ? " " + sinif : ""));
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", YOLLAR[ad] || "");
    s.append(p);
    return s;
  }

  // ---------- ses ayarı (bütün oyunlarda ortak) ----------
  const SES_ANAHTARI = "oyunSes";
  function sesAcik() {
    try {
      const v = localStorage.getItem(SES_ANAHTARI);
      if (v !== null) return v !== "0";
      return localStorage.getItem("bilardoSes") !== "0";   // eski ayar
    } catch (e) { return true; }
  }
  function sesDegistir() {
    const yeni = !sesAcik();
    try { localStorage.setItem(SES_ANAHTARI, yeni ? "1" : "0"); } catch (e) { }
    return yeni;
  }
  let sesBaglami = null;
  function sesCal(tur) {
    if (!sesAcik()) return;
    try {
      if (!sesBaglami) sesBaglami = new (window.AudioContext || window.webkitAudioContext)();
      if (sesBaglami.state === "suspended") sesBaglami.resume();
      const t = sesBaglami.currentTime;
      const notalar = tur === "sira" ? [[660, 0], [880, 0.12]] : tur === "kazandi" ? [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]] : [[440, 0]];
      for (const [f, g] of notalar) {
        const o = sesBaglami.createOscillator(), k = sesBaglami.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(f, t + g);
        k.gain.setValueAtTime(0.0001, t + g);
        k.gain.exponentialRampToValueAtTime(0.18, t + g + 0.02);
        k.gain.exponentialRampToValueAtTime(0.0001, t + g + 0.28);
        o.connect(k).connect(sesBaglami.destination);
        o.start(t + g);
        o.stop(t + g + 0.3);
      }
    } catch (e) { }
  }

  // ---------- sekme başlığında "sıra sende" ----------
  // Sayfa arka plandayken sıra gelirse başlık yanıp söner; sayfaya dönünce eski hâline gelir.
  let baslikZamani = null, asilBaslik = null;
  function sekmeUyarisi(ac) {
    if (ac && document.hidden && !baslikZamani) {
      asilBaslik = document.title;
      let acik = false;
      baslikZamani = setInterval(() => {
        acik = !acik;
        document.title = acik ? "● Sıra sende" : asilBaslik;
      }, 900);
    } else if (!ac || !document.hidden) {
      if (baslikZamani) { clearInterval(baslikZamani); baslikZamani = null; document.title = asilBaslik; }
    }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sekmeUyarisi(false); });

  // ---------- kabuk ----------
  window.OyunKabugu = function (kok, secenek) {
    const oyun = (secenek && secenek.oyun) || "oyun";
    let menuKutu = null, siraKutu = null, olayKutu = null, acikMenu = null;

    // Koltuk eylem menüsü dışına tıklanınca kapanır
    document.addEventListener("pointerdown", (e) => {
      if (acikMenu && !acikMenu.contains(e.target) && !(acikMenu.sahibi && acikMenu.sahibi.contains(e.target))) menuyuKapat();
    }, true);
    function menuyuKapat() {
      if (acikMenu) { acikMenu.remove(); acikMenu = null; }
    }

    // ---------- avatar + süre halkası ----------
    const CEVRE = 2 * Math.PI * 25;
    function avatar(o) {
      const ic = o.foto
        ? h("span", { sinif: "oyun-avatar-ic", stil: { backgroundImage: "url('" + String(o.foto).replace(/['"()\\]/g, "") + "')" } })
        : h("span", { sinif: "oyun-avatar-ic", stil: { background: o.renk || "#3a3a3a" } }, o.bot ? ikon("bot") : ((o.ad || "?").trim()[0] || "?").toUpperCase());
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 56 56");
      svg.setAttribute("class", "oyun-halka");
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", "28"); c.setAttribute("cy", "28"); c.setAttribute("r", "25");
      c.style.strokeDasharray = String(CEVRE);
      c.style.strokeDashoffset = "0";
      svg.append(c);
      return h("div", { sinif: "oyun-avatar" }, svg, ic);
    }

    // koltuk({ ad, foto, renk, bot, ben, sira, kopuk, alt, ek, bos, eylemler: [{ yazi, ikon, is, tehlikeli }], ipucu })
    // Boş koltuk: kesik çizgili daire; tıklanınca eylemler (Otur, Bot ekle). Dolu koltuk: eylem varsa tıklanınca menü.
    function koltuk(o) {
      const eylemler = (o.eylemler || []).filter(Boolean);
      const govde = o.bos
        ? h("div", { sinif: "oyun-avatar bos" }, ikon("arti"))
        : avatar(o);
      const yazi = h("div", { sinif: "oyun-koltuk-yazi" },
        h("b", {}, o.bos ? (o.bosYazi || "Boş koltuk") : (o.ad || "Oyuncu") + (o.ben ? " (sen)" : "")),
        o.alt ? h("small", {}, o.alt) : null);
      const oge = h("div", {
        sinif: "oyun-koltuk" + (o.bos ? " bos" : "") + (o.sira ? " sira" : "") + (o.kopuk ? " kopuk" : "") + (o.ben ? " ben" : "") +
          (eylemler.length ? " eylemli" : "") + (o.sinif ? " " + o.sinif : ""),
        title: o.ipucu || (eylemler.length ? (o.bos ? "Otur ya da bot ekle" : "Seçenekler") : null),
        veri: o.koltuk != null ? { koltuk: o.koltuk } : null
      }, govde, yazi, o.ek || null);
      if (eylemler.length) {
        oge.tabIndex = 0;
        const ac = (e) => {
          e.stopPropagation();
          if (acikMenu && acikMenu.sahibi === oge) { menuyuKapat(); return; }
          // Tek eylem varsa (ör. sadece "Otur") menü açılmadan yapılır
          if (eylemler.length === 1 && o.bos) { eylemler[0].is(); return; }
          menuyuKapat();
          const menu = h("div", { sinif: "oyun-koltuk-menu" }, eylemler.map((y) => h("button", {
            sinif: y.tehlikeli ? "tehlikeli" : "", onclick: (ev) => { ev.stopPropagation(); menuyuKapat(); y.is(); }
          }, y.ikon ? ikon(y.ikon) : null, y.yazi)));
          menu.sahibi = oge;
          oge.append(menu);
          acikMenu = menu;
        };
        oge.addEventListener("click", ac);
        oge.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") ac(e); });
      }
      return oge;
    }

    // Süre halkası: sıradaki koltukta (oran 1 → 0); son %30'da kırmızı
    function sureHalkasi(oran) {
      const c = kok.querySelector(".oyun-koltuk.sira .oyun-halka circle");
      if (!c) return;
      const r = Math.max(0, Math.min(1, oran));
      c.style.strokeDashoffset = String(CEVRE * (1 - r));
      c.classList.toggle("az", r < 0.3);
    }

    // ---------- menü ----------
    // tuslar: [{ ad: "ses"|"ayar"|"kural"|"bitir"|"kalk"|başka, yazi, ikon, is, ipucu, secili }]
    // Sıra her oyunda aynıdır: Ses · Ayarlar · Kurallar · oyuna özel · Oyunu bitir · Kalk
    const SIRA = { tamEkran: -1, ses: 0, ayar: 1, kural: 2, bitir: 8, kalk: 9 };
    // Telefonda (dokunmatik) "Tam ekran": tarayıcı çubukları gizlenir, oyun bütün ekranı kullanır; Android'de
    // ekran yatay kilitlenir (telefon yan tutulup oynanır). iPhone tam ekranı desteklemiyorsa düğme çıkmaz.
    const dokunmatik = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    function tamEkranTusu() {
      if (!dokunmatik || !document.fullscreenEnabled) return null;
      const acik = !!document.fullscreenElement;
      return {
        ad: "tamEkran", yazi: acik ? "Küçült" : "Tam ekran", ikon: acik ? "kucult" : "tamEkran", ipucu: acik ? "Tam ekrandan çık" : "Tam ekran (yatay)",
        is: async () => {
          try {
            if (document.fullscreenElement) { await document.exitFullscreen(); return; }
            await document.documentElement.requestFullscreen({ navigationUI: "hide" });
            if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => { });
          } catch (e) { }
        }
      };
    }
    let sonMenu = [];
    document.addEventListener("fullscreenchange", () => { if (menuKutu) menu(sonMenu); });
    function menu(tuslar) {
      sonMenu = tuslar;
      tuslar = [tamEkranTusu(), ...tuslar];
      if (!menuKutu) {
        // menuYeri verilmişse menü o satırın içinde durur (oyunun üst satırı); yoksa oyun alanının sağ üst köşesinde
        const yer = secenek && secenek.menuYeri;
        menuKutu = h("div", { sinif: "oyun-menu" + (yer ? " yerinde" : "") });
        (yer || kok).append(menuKutu);
      }
      const sirali = tuslar.filter(Boolean).map((t, i) => [t, SIRA[t.ad] != null ? SIRA[t.ad] : 5, i])
        .sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([t]) => t);
      menuKutu.replaceChildren(...sirali.map((t) => h("button", {
        sinif: "oyun-menu-tus" + (t.ad === "bitir" || t.ad === "kalk" ? " tehlikeli" : "") + (t.secili ? " secili" : ""),
        title: t.ipucu || t.yazi, onclick: t.is
      }, t.ikon ? ikon(t.ikon) : null, h("span", {}, t.yazi))));
      return menuKutu;
    }
    // Ses düğmesi her oyunda aynı
    function sesTusu(degisince) {
      const acik = sesAcik();
      return { ad: "ses", yazi: "Ses", ikon: acik ? "sesAcik" : "sesKapali", ipucu: acik ? "Sesleri kapat" : "Sesleri aç",
        is: () => { sesDegistir(); if (degisince) degisince(); } };
    }

    // ---------- sıra şeridi ----------
    // benim: sıra bende mi (şerit belirginleşir, ses çalar, sekme başlığı uyarır); yazi: durum yazısı; oran: kalan süre (0–1)
    let sonBenim = false;
    function sira(o) {
      if (!siraKutu) {
        siraKutu = h("div", { sinif: "oyun-sira" }, h("span", { sinif: "oyun-sira-yazi" }), h("i", { sinif: "oyun-sira-sure" }, h("i")));
        (o.yer || kok).prepend(siraKutu);
      }
      siraKutu.classList.toggle("benim", !!o.benim);
      siraKutu.querySelector(".oyun-sira-yazi").textContent = o.yazi || "";
      sureCizgisi(o.oran);
      if (o.benim && !sonBenim) { sesCal("sira"); sekmeUyarisi(true); }
      if (!o.benim && sonBenim) sekmeUyarisi(false);
      sonBenim = !!o.benim;
      return siraKutu;
    }
    function sureCizgisi(oran) {
      if (!siraKutu) return;
      const cizgi = siraKutu.querySelector(".oyun-sira-sure");
      cizgi.hidden = oran == null;
      if (oran == null) return;
      const r = Math.max(0, Math.min(1, oran));
      cizgi.firstChild.style.width = (r * 100) + "%";
      cizgi.classList.toggle("az", r < 0.3);
      sureHalkasi(r);
    }

    // ---------- olay bildirimi ----------
    let olayZamani = null;
    function bildir(metin, tur) {
      if (!metin) return;
      tur = tur === "ceza" ? "uyari" : (tur || "bilgi");
      if (!olayKutu) { olayKutu = h("div", { sinif: "oyun-olay", role: "status", "aria-live": "polite" }); kok.append(olayKutu); }
      olayKutu.className = "oyun-olay " + tur;
      olayKutu.replaceChildren(ikon(tur === "uyari" ? "uyari" : tur === "basari" ? "basari" : "bilgi"), h("span", {}, metin));
      void olayKutu.offsetWidth;   // animasyon baştan
      olayKutu.classList.add("gorunur");
      clearTimeout(olayZamani);
      olayZamani = setTimeout(() => olayKutu.classList.remove("gorunur"), tur === "uyari" ? 3600 : 2800);
    }

    // ---------- pencereler ----------
    // tuslar: [{ yazi, is, ana, tehlikeli, soluk, oge }]; secenek: { genis, tam, kapaninca, sinif }
    function pencere(baslik, govde, tuslar, sec) {
      sec = sec || {};
      // ust: açık pencerenin üstünde açılır (ör. çetele penceresinde silme onayı); yoksa önceki pencere kapanır
      if (!sec.ust) kok.querySelectorAll(".oyun-pencere-arka").forEach((x) => x.remove());
      const arka = h("div", { sinif: "oyun-pencere-arka" + (sec.ust ? " ust" : "") });
      const kapat = () => { arka.remove(); if (sec.kapaninca) sec.kapaninca(); };
      arka.addEventListener("click", (e) => { if (e.target === arka) kapat(); });
      const tusOgeleri = (tuslar && tuslar.length ? tuslar : [{ yazi: "Kapat" }]).map((t) => t.oge || h("button", {
        sinif: "oyun-tus" + (t.ana ? " ana" : "") + (t.tehlikeli ? " tehlikeli" : "") + (t.soluk ? " soluk" : "") + (t.sinif ? " " + t.sinif : ""),
        onclick: () => { kapat(); if (t.is) t.is(); }
      }, t.yazi));
      arka.append(h("div", { sinif: "oyun-pencere" + (sec.tam ? " tam" : sec.genis ? " genis" : "") + (sec.sinif ? " " + sec.sinif : ""), role: "dialog" },
        h("div", { sinif: "oyun-pencere-ust" }, h("h3", {}, baslik),
          h("button", { sinif: "oyun-pencere-kapat", title: "Kapat", "aria-label": "Kapat", onclick: kapat }, ikon("kapat"))),
        h("div", { sinif: "oyun-pencere-govde" }, govde),
        h("div", { sinif: "oyun-pencere-tuslar" }, tusOgeleri)));
      kok.append(arka);
      const ilk = arka.querySelector(".oyun-pencere-tuslar button");
      if (ilk) setTimeout(() => ilk.focus({ preventScroll: true }), 0);
      return { kapat, oge: arka };
    }

    // Onay: "Vazgeç" sade, zarar veren seçenek kırmızı
    function onayla(o) {
      return pencere(o.baslik, o.metin ? h("p", {}, o.metin) : null,
        [{ yazi: o.vazgec || "Vazgeç" }, { yazi: o.evet || "Tamam", tehlikeli: o.tehlikeli !== false, ana: o.tehlikeli === false, is: o.is }],
        { ust: !!o.ust });
    }

    // Kalkma sorusu: "Hayır" kırmızı ve belirgin, "Evet" soluk (göz önce kalmaya gitsin). Dışına tıklamak "Hayır".
    function kalkSor(metin, is) {
      return pencere("Masadan kalkmak istiyor musun?", metin ? h("p", {}, metin) : null,
        [{ yazi: "Evet", soluk: true, is }, { yazi: "Hayır", tehlikeli: true, sinif: "buyuk" }], { sinif: "kalk" });
    }

    // ---------- oyun sonu ----------
    // { baslik, alt, kazandim, oyuncular: [{ ad, foto, renk, bot, kazandi }], ozet: [[etiket, deger]], ek, tuslar }
    function oyunSonu(o) {
      const kazananlar = (o.oyuncular || []).filter((x) => x.kazandi);
      const govde = h("div", { sinif: "oyun-sonu" },
        h("div", { sinif: "oyun-sonu-kupa" + (o.kazandim ? " benim" : "") }, ikon("kupa")),
        kazananlar.length ? h("div", { sinif: "oyun-sonu-kazananlar" }, kazananlar.map((x) => h("div", { sinif: "oyun-sonu-kisi" }, avatar(x), h("b", {}, x.ad)))) : null,
        o.alt ? h("p", { sinif: "oyun-sonu-alt" }, o.alt) : null,
        o.ozet && o.ozet.length ? h("dl", { sinif: "oyun-sonu-ozet" }, o.ozet.flatMap(([e, d]) => [h("dt", {}, e), h("dd", {}, d)])) : null,
        o.ek || null);
      const p = pencere(o.baslik, govde, o.tuslar, { sinif: "sonuc", genis: !!o.ek });
      if (o.kazandim || kazananlar.length) konfeti(p.oge);
      if (o.kazandim) sesCal("kazandi");
      return p;
    }

    function konfeti(yer) {
      const renkler = ["#f2c230", "#ff4d88", "#1db954", "#5aa9ff", "#ffffff", "#ff8a3d"];
      const kutu = h("div", { sinif: "oyun-konfeti", "aria-hidden": "true" });
      for (let i = 0; i < 60; i++) {
        kutu.append(h("i", { stil: {
          left: Math.random() * 100 + "%", background: renkler[i % renkler.length],
          animationDelay: (Math.random() * 0.6).toFixed(2) + "s", animationDuration: (1.8 + Math.random() * 1.4).toFixed(2) + "s",
          "--x": ((Math.random() - 0.5) * 160).toFixed(0) + "px", "--d": (Math.random() * 720 - 360).toFixed(0) + "deg"
        } }));
      }
      yer.append(kutu);
      setTimeout(() => kutu.remove(), 3800);
    }

    return { h, ikon, koltuk, sureHalkasi, menu, sesTusu, sira, sureCizgisi, bildir, pencere, onayla, kalkSor, oyunSonu,
      sesAcik, sesDegistir, sesCal, menuyuKapat, oyun };
  };
  window.OyunKabugu.ikon = ikon;
  window.OyunKabugu.h = h;
  window.OyunKabugu.sesAcik = sesAcik;
})();
