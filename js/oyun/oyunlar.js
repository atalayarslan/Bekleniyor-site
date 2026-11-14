// Odanın üst çubuğunda tek "Oyunlar" düğmesi. Her oyun kendi düğmesini kurar (okey.js, bilardo.js); burada o
// düğmeler bu düğmenin açtığı listeye taşınır. Böylece oyun sayısı artsa da üst çubuk dolmaz; listedeki her satır
// oyunun canlı durumunu (ör. "2/4 · 1 izliyor") gösterir. Bir oyun açıkken düğme o oyunun adını gösterir.
// Yeni oyun eklerken: oyunun düğmesine "oyun-ac-tus" sınıfı ve id verilir, OYUN_TUSLARI listesine eklenir.

(function () {
  "use strict";
  const OYUN_TUSLARI = ["okeyTus", "bilardoTus"];
  let ana = null, liste = null;

  function kur() {
    const odaAdi = document.getElementById("odaAdi");
    const tuslar = OYUN_TUSLARI.map((id) => document.getElementById(id)).filter(Boolean);
    if (!odaAdi || tuslar.length < OYUN_TUSLARI.length) return false;
    const sarmal = document.createElement("div");
    sarmal.className = "oyunlar-sarmal";
    ana = document.createElement("button");
    ana.type = "button";
    ana.id = "oyunlarTus";
    ana.className = "tus-cerceve oyunlar-tus";
    ana.setAttribute("aria-haspopup", "true");
    ana.setAttribute("aria-expanded", "false");
    liste = document.createElement("div");
    liste.className = "oyunlar-listesi";
    liste.hidden = true;
    for (const t of tuslar) {
      t.classList.add("oyun-satiri");
      // Oyun açılınca/kapanınca liste kapanır ve ana düğme güncellenir
      t.addEventListener("click", () => { listeyiAc(false); setTimeout(guncelle, 0); });
      liste.append(t);
    }
    sarmal.append(ana, liste);
    odaAdi.after(sarmal);
    ana.addEventListener("click", (e) => { e.stopPropagation(); listeyiAc(liste.hidden); });
    document.addEventListener("pointerdown", (e) => { if (!liste.hidden && !sarmal.contains(e.target)) listeyiAc(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") listeyiAc(false); });
    // Oyun düğmelerinin yazısı (sayaç, açık/kapalı) değişince ana düğme de güncellenir
    new MutationObserver(guncelle).observe(liste, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    guncelle();
    return true;
  }

  function listeyiAc(ac) {
    if (!liste) return;
    liste.hidden = !ac;
    ana.setAttribute("aria-expanded", ac ? "true" : "false");
    ana.classList.toggle("liste-acik", !!ac);
  }

  // Ana düğme: açık bir oyun varsa onun simgesi ve adı (vurgulu), yoksa "Oyunlar" ve masalarda oturan toplam kişi
  function guncelle() {
    if (!ana) return;
    const tuslar = [...liste.querySelectorAll(".oyun-satiri")];
    const acik = tuslar.find((t) => t.classList.contains("acik"));
    const oturan = tuslar.reduce((t, x) => {
      const m = /(\d+)\/4/.exec((x.querySelector(".okey-sayac") || {}).textContent || "");
      return t + (m ? Number(m[1]) : 0);
    }, 0);
    ana.classList.toggle("acik", !!acik);
    ana.replaceChildren();
    const simge = document.createElement("span");
    simge.className = "oyunlar-simge";
    simge.textContent = acik ? (acik.firstChild && acik.firstChild.textContent || "🎲").trim() : "🎲";
    const yazi = document.createElement("span");
    yazi.className = "etiket";
    yazi.textContent = acik ? " " + ((acik.querySelector(".etiket") || {}).textContent || "").trim() : " Oyunlar";
    ana.append(simge, yazi);
    if (!acik && oturan) {
      const sayi = document.createElement("span");
      sayi.className = "oyunlar-sayi";
      sayi.textContent = oturan;
      sayi.title = "Masalarda oturan";
      ana.append(sayi);
    }
    const ok = document.createElement("span");
    ok.className = "oyunlar-ok";
    ok.setAttribute("aria-hidden", "true");
    ana.append(ok);
    ana.title = acik ? "Oyunlar (açık olan: " + yazi.textContent.trim() + ")" : "Oyunlar: okey, bilardo";
  }

  // Oyun düğmeleri sayfa yüklenirken kurulur; hepsi hazır olana kadar kısa aralıklarla denenir
  let deneme = 0;
  (function bekle() {
    if (kur() || ++deneme > 100) return;
    setTimeout(bekle, 100);
  })();
})();
