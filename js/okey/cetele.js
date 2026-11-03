// Okey çetelesi: bir oyunun el el puanlarını okey-hesap.html görünümünde çizer (cetele.css).
// Hem odanın çetele sayfasında hem masadaki el sonu penceresinde kullanılır.
//
// Oyun kaydı:
//   { id, oda, odaAdi, baslangic, bitis, elSayisi,
//     oyuncular: [{ ad }],                               // koltuk sırasıyla; renk = koltuk (kırmızı, mavi, siyah, sarı)
//     eller: [{ no, bitiren, bitis: { okey, cift, elden }, desteBitti, puanlar: [4], cezalar: [4], durumlar: [4], zaman }],
//     cezalar: [{ el, oyuncu, miktar, neden, zaman }] }
// durumlar: "bitirdi" | "acti 112" | "cift" | "acmadi"
//
// Kayıt yeri: demoda tarayıcının localStorage'ı (aynı bilgisayardaki sekmeler görür). Gerçek sitede odanın
// Firebase verisinde (odalar/$oda/okeyGecmisi) durur ve odaya giren herkes görür.

(function () {
  "use strict";

  function h(etiket, ozellik, ...cocuklar) {
    const oge = document.createElement(etiket);
    for (const [k, v] of Object.entries(ozellik || {})) {
      if (v == null || v === false) continue;
      if (k === "sinif") oge.className = v;
      else if (k.startsWith("on")) oge.addEventListener(k.slice(2), v);
      else oge.setAttribute(k, v === true ? "" : v);
    }
    for (const c of cocuklar.flat()) if (c != null && c !== false) oge.append(c);
    return oge;
  }
  const yaz = (n) => (n < 0 ? "−" + Math.abs(n) : String(n));
  const zaman = (t) => {
    try { return new Date(t).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return new Date(t).toLocaleString(); }
  };

  function toplamlar(oyun) {
    const t = oyun.oyuncular.map(() => ({ el: 0, ceza: 0, top: 0, cezaSayisi: 0 }));
    for (const e of oyun.eller) e.puanlar.forEach((p, k) => { t[k].el += p; t[k].ceza += e.cezalar[k] || 0; });
    for (const z of oyun.cezalar || []) if (t[z.oyuncu] && z.miktar > 0) t[z.oyuncu].cezaSayisi++;
    t.forEach((x) => (x.top = x.el + x.ceza));
    return t;
  }

  // En düşük toplam önde (herkes eşitse kimse)
  function ondekiler(oyun) {
    const t = toplamlar(oyun);
    if (!oyun.eller.length) return [];
    const en = Math.min(...t.map((x) => x.top));
    const bunlar = t.map((x, k) => (x.top === en ? k : -1)).filter((k) => k >= 0);
    return bunlar.length === t.length ? [] : bunlar;
  }

  function katSayisi(e) {
    if (!e.bitis) return 1;
    return (e.bitis.okey ? 2 : 1) * (e.bitis.cift ? 2 : 1) * (e.bitis.elden ? 2 : 1);
  }

  // Bir oyunun çetelesi. secenek: { vurguEl: son biten elin numarası (satırı vurgulanır), sekme: "eller" | "cezalar" }
  function ciz(oyun, secenek = {}) {
    let sekme = secenek.sekme || "eller";
    const kap = h("div", { sinif: "stack" });
    const yenile = () => kap.replaceChildren(...parcalar());

    function parcalar() {
      const t = toplamlar(oyun);
      const onde = ondekiler(oyun);
      const bitti = !!oyun.bitis;
      const sonuc = [];
      if (bitti && onde.length) {
        sonuc.push(h("div", { sinif: "banner" }, "Oyun bitti · Kazanan: " + onde.map((k) => oyun.oyuncular[k].ad).join(", ") + " (" + yaz(t[onde[0]].top) + ")"));
      }
      sonuc.push(h("div", { sinif: "board" }, oyun.oyuncular.map((o, k) => h("div", { sinif: "pcard" + (onde.includes(k) ? " leader" : "") },
        h("div", { sinif: "who" }, h("span", { sinif: "dot c" + k }), h("b", {}, o.ad)),
        h("div", { sinif: "trow" }, h("div", { sinif: "tile t" + k }, yaz(t[k].top)),
          onde.includes(k) ? h("span", { sinif: "pill lead" }, bitti ? "Kazandı" : "Önde") : null),
        h("div", { sinif: "split" }, "El " + yaz(t[k].el) + " · ", t[k].ceza ? h("span", { sinif: "pz" }, "Ceza " + yaz(t[k].ceza)) : "Ceza 0")))));
      sonuc.push(h("div", { sinif: "muted", style: "font-size:13.5px" },
        (bitti ? oyun.eller.length + " el oynandı" : (oyun.eller.length + 1) + ". el oynanıyor") + (oyun.elSayisi ? " · toplam " + oyun.elSayisi + " el" : "")));
      const sekmeTusu = (ad, yazi, sayi) => h("button", { sinif: sekme === ad ? "on" : "", onclick: () => { sekme = ad; yenile(); } },
        yazi, sayi ? h("span", { sinif: "cnt" }, String(sayi)) : null);
      sonuc.push(h("div", { sinif: "tabs" }, sekmeTusu("eller", "Eller", oyun.eller.length), sekmeTusu("cezalar", "Cezalar", (oyun.cezalar || []).length)));
      sonuc.push(sekme === "eller" ? ellerTablosu(oyun, t, secenek.vurguEl) : cezaListesi(oyun));
      return sonuc;
    }
    yenile();
    return kap;
  }

  function ellerTablosu(oyun, t, vurguEl) {
    if (!oyun.eller.length) return h("div", { sinif: "empty" }, "Henüz biten el yok. El bitince puanlar burada birikir.");
    const tablo = h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "El"), oyun.oyuncular.map((o, k) => h("th", {}, h("span", { sinif: "nm" }, o.ad), h("span", { sinif: "bar-c c" + k }))))));
    const govde = h("tbody", {});
    for (const e of oyun.eller) {
      const kat = katSayisi(e);
      const ek = [kat > 1 ? "×" + kat : "", e.desteBitti ? "deste" : ""].filter(Boolean).join(" ");
      govde.append(h("tr", { sinif: e.no === vurguEl ? "vurgu" : "" },
        h("td", { sinif: "no" }, String(e.no), ek ? h("i", {}, ek) : null),
        e.puanlar.map((p, k) => {
          const d = e.durumlar && e.durumlar[k] || "";
          const sinif = [k === e.bitiren && "win", d === "acmadi" && "acm"].filter(Boolean).join(" ");
          return h("td", { sinif, title: e.cezalar[k] ? "Bu elde ceza: " + yaz(e.cezalar[k]) : "" }, yaz(p),
            d === "cift" ? h("sup", {}, "Ç") : null, d === "acmadi" ? h("sup", {}, "A") : null,
            e.cezalar[k] ? h("sup", { sinif: "z" }, "+" + e.cezalar[k]) : null);
        })));
    }
    const satir = (etiket, sinif, deger) => h("tr", { sinif: "sum " + sinif }, h("td", { sinif: "no" }, etiket), t.map((x) => h("td", {}, yaz(deger(x)))));
    govde.append(satir("Σ el", "", (x) => x.el), satir("Ceza", "pz", (x) => x.ceza), satir("Top.", "grand", (x) => x.top));
    tablo.append(govde);
    return h("div", { sinif: "stack" }, h("div", { sinif: "tbl-wrap" }, tablo),
      h("div", { sinif: "legend" }, "Yeşil hücre bitiren · ", h("b", {}, "Ç"), " çift açtı · ", h("b", {}, "A"), " açamadı · kırmızı üst sayı o eldeki ceza · ×2/×4 okeyle, çiftten ya da elden bitiş"));
  }

  function cezaListesi(oyun) {
    const liste = (oyun.cezalar || []).slice().reverse();
    if (!liste.length) return h("div", { sinif: "empty" }, "Ceza yok.");
    return h("div", { sinif: "items" }, liste.map((z) => h("div", { sinif: "item" },
      h("div", {},
        h("div", { sinif: "head" }, h("span", { sinif: "dot c" + z.oyuncu }), h("b", {}, oyun.oyuncular[z.oyuncu].ad), h("span", { sinif: "muted" }, z.el + ". el")),
        h("p", {}, z.neden),
        h("small", { sinif: "muted" }, zaman(z.zaman))),
      h("div", { sinif: "amt" + (z.miktar < 0 ? " eksi" : "") }, (z.miktar > 0 ? "+" : "") + yaz(z.miktar)))));
  }

  // Oyun kartı (çetele sayfasındaki liste için)
  function kart(oyun, onclick) {
    const onde = ondekiler(oyun);
    return h("button", { sinif: "gcard", onclick },
      h("span", { sinif: "top" }, h("b", {}, "Oyun · " + zaman(oyun.baslangic)), h("span", { sinif: "muted" }, oyun.eller.length + " el")),
      h("span", { sinif: "pills" },
        oyun.bitis ? h("span", { sinif: "pill lead" }, "Bitti") : h("span", { sinif: "pill live" }, "Devam ediyor"),
        oyun.oyuncular.map((o, k) => h("span", { sinif: "pill" }, h("span", { sinif: "dot c" + k, style: "margin-right:5px;width:8px;height:8px" }), o.ad)),
        (oyun.cezalar || []).length ? h("span", { sinif: "pill pen" }, oyun.cezalar.length + " ceza") : null),
      h("small", { sinif: "muted" }, onde.length ? (oyun.bitis ? "Kazanan: " : "Önde: ") + onde.map((k) => oyun.oyuncular[k].ad).join(", ") : oyun.eller.length ? "Herkes eşit" : "Henüz el bitmedi"));
  }

  // ---------- kayıt (demo: localStorage) ----------
  const anahtar = (oda) => "okeyGecmisi:" + oda;
  function oku(oda) {
    try { return JSON.parse(localStorage.getItem(anahtar(oda)) || "[]"); } catch (e) { return []; }
  }
  function kaydet(oda, oyun) {
    const liste = oku(oda).filter((o) => o.id !== oyun.id);
    liste.push(oyun);
    try { localStorage.setItem(anahtar(oda), JSON.stringify(liste.slice(-50))); } catch (e) { }
  }

  window.OkeyCetele = { ciz, kart, toplamlar, ondekiler, oku, kaydet };
})();
