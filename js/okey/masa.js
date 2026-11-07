// Okey masası çizimi. Kendisine verilen "görünen durumu" çizer ve oyuncunun ne yapmak istediğini bildirir
// (taş çek, soldan al, at, taşı, aç, işle...). Kural uygulamaz; o iş motorun (js/kurallar.js) ve
// bağlantının (demoda demo.js, gerçekte masa sunucusu). Böylece bu dosya demodan siteye aynen taşınır.
//
// const masa = OkeyMasa(kokOge, olaylar);  masa.ciz(gorunum);  masa.ucur(...);  masa.bildir(...)

(function () {
  "use strict";
  const K = window.OkeyKurallar;
  const SATIR = 15;   // ıstakada bir satırdaki yuva
  // Masadaki per alanlarının dikey sınırları (keçe içinde, okey-masa.css ile aynı): yan alanların üstü ve
  // benim alanımın altı (altında atılan taşlar durur)
  const YAN_UST = 212, ALAN_ALT = 566;

  function h(etiket, ozellik, ...cocuklar) {
    const oge = document.createElement(etiket);
    for (const [k, v] of Object.entries(ozellik || {})) {
      if (v == null || v === false) continue;
      if (k === "sinif") oge.className = v;
      else if (k === "stil") {
        for (const [ad, deger] of Object.entries(v)) {
          if (ad.startsWith("--")) oge.style.setProperty(ad, deger);   // CSS değişkeni Object.assign ile atanmaz
          else oge.style[ad] = deger;
        }
      }
      else if (k.startsWith("on")) oge.addEventListener(k.slice(2), v);
      else if (k === "veri") Object.assign(oge.dataset, v);
      else oge.setAttribute(k, v === true ? "" : v);
    }
    for (const c of cocuklar.flat()) if (c != null && c !== false) oge.append(c);
    return oge;
  }

  // Taşın ön yüzü. kucuk: masadaki boy.
  function tasOgesi(tas, okey, ek = {}) {
    const okeyMi = K.okeyMi(tas, okey);
    const sinif = ["tas", tas.sahte ? "sahte" : "r" + tas.r, okeyMi && "okey", ek.kucuk && "kucuk", ek.sinif].filter(Boolean).join(" ");
    return h("div", { sinif, veri: { id: tas.id }, title: tasAdi(tas, okey) },
      h("span", { sinif: "sayi" }, tas.sahte ? "♣" : String(tas.n)), h("span", { sinif: "nokta" }));
  }

  function tasAdi(tas, okey) {
    if (tas.sahte) return "Sahte okey (" + K.RENK_ADLARI[okey.r] + " " + okey.n + ")";
    return K.RENK_ADLARI[tas.r] + " " + tas.n + (K.okeyMi(tas, okey) ? " · OKEY" : "");
  }

  function avatar(kisi, sure) {
    const a = h("div", { sinif: "okey-avatar", stil: { background: kisi.renk } }, kisi.bot ? "🤖" : (kisi.ad || "?")[0].toUpperCase());
    if (sure) {
      const cevre = 2 * Math.PI * 24;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 54 54");
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", 27); c.setAttribute("cy", 27); c.setAttribute("r", 24);
      c.style.strokeDasharray = cevre;
      c.style.strokeDashoffset = cevre * (1 - sure.kalan / sure.toplam);
      if (sure.kalan / sure.toplam < 0.3) c.style.stroke = "#e5484d";
      svg.append(c);
      a.append(svg);
    }
    return a;
  }

  window.OkeyMasa = function (kok, olaylar) {
    let g = null;          // son çizilen görünüm
    let olcek = 1;
    const yatiklar = new Set();   // sağ tıkla yan yatırılmış taşlar (sadece bu ekranda; oyunu etkilemez)
    // Sürüklenen taş: sıra başkasındayken masa sürükleme sırasında yeniden çizilebilir; yeni çizilen ıstakada da
    // bu taş soluk (hayalet) kalsın diye kimliği tutulur
    let surukleneId = null;
    // Yeni çekilen taşın giriş animasyonu bir kez oynar; masa yeniden çizilince (başkası oynadıkça) tekrar sekmez
    let sekenId = null;

    const sahne = h("div", { sinif: "okey-sahne" });
    // Tema/Ayarlar/Kalk/Çetele/Kurallar: ölçeklenen masanın dışında, ekranın sağ üst köşesinde (üstteki koltuğu örtmez)
    const kose = h("div", { sinif: "kose-tuslar" });
    kok.classList.add("okey");
    kok.replaceChildren(sahne, kose);

    function sigdir() {
      const r = kok.getBoundingClientRect();
      if (!r.width) return;
      olcek = Math.min(r.width / 1700, r.height / 1070, 1.25);   // yan koltuklar masanın dışında durur
      sahne.style.setProperty("--olcek", olcek);
    }
    new ResizeObserver(sigdir).observe(kok);

    // ---------- çizim ----------
    // Masanın iskeleti bir kez kurulur; her çizimde sadece içerikler güncellenir. Atılan taş yığınları
    // yerinde güncellenir (yeni taş sona eklenir, alınan çıkarılır): fare yığının üstündeyken sıra ilerlese de
    // yığın yeniden doğup bir an toplanmaz, açık kalır.
    const iskelet = (() => {
      const masa = h("div", { sinif: "masa" });
      const orta = h("div", { sinif: "orta" });
      const istakalar = {};
      for (const k of [1, 2, 3]) istakalar[k] = h("div", { sinif: "rakip-istaka k" + k, veri: { istaka: k } });
      const yiginlar = [0, 1, 2, 3].map((k) => {
        const kutu = h("div", {
          sinif: "atilan a" + k, veri: k === 0 ? { hedef: "at" } : { atilan: k },
          onclick: () => k === 3 && !sonSurukleme() && kutu.classList.contains("alinabilir") && olaylar.soldanAl()
        });
        // Yığının üstündeki (gösterilebilir) taşı bir pere sürükleyince "işlek" diye gösterilir
        kutu.addEventListener("pointerdown", (e) => {
          const oge = e.target.closest(".tas");
          if (oge && oge.dataset.gosterilebilir === "1") islekSurukle(e, oge);
        });
        if (k === 0 || k === 3) kutu.append(h("div", { sinif: "atilan-etiket" }, k === 0 ? "Attığın" : "Soldan al"));
        return kutu;
      });
      const alanlar = [0, 1, 2, 3].map((k) => h("div", { sinif: "per-alani p" + k }));
      masa.append(orta, ...Object.values(istakalar), ...yiginlar, ...alanlar, h("div", { sinif: "masa-on" }));
      const ust = h("div", { sinif: "ust-katman" });    // koltuklar, durum yazısı, düğmeler, benim ıstakam
      sahne.append(h("div", { sinif: "masa-3b" }, h("div", { sinif: "masa-golge" }), masa), ust);
      return { orta, istakalar, yiginlar, alanlar, ust };
    })();

    function ciz(yeni) {
      g = yeni;
      const okey = g.okey;

      // Orta: deste + gösterge
      const desteCekilebilir = g.benimSiram && g.asama === "cek";
      const deste = h("div", {
        sinif: "deste" + (desteCekilebilir ? " parlak" : ""), title: "Desteden çek", veri: { hedef: "deste" },
        onclick: () => desteCekilebilir && olaylar.desteCek()
      });
      // Deste: üst üste kapalı taşlar (yüksekliği kalan taşla azalır)
      const kat = Math.max(1, Math.min(9, Math.ceil(g.desteSayisi / 6)));
      for (let i = 0; i < kat; i++) deste.append(h("div", { sinif: "deste-kat", stil: { "--k": i } }));
      deste.append(h("div", { sinif: "deste-sayi" }, g.desteSayisi + " taş"));
      // El başlamadıysa (gösterge yok) ortada deste ve gösterge çizilmez
      if (!g.gosterge) iskelet.orta.replaceChildren();
      else iskelet.orta.replaceChildren(
        deste,
        h("div", { sinif: "gosterge", veri: { gosterge: "" } },
          g.gostergeMasada === false
            ? h("div", { sinif: "gosterge-bos", title: "Gösterge çift yapılıp alındı" })
            : tasOgesi(g.gosterge, okey, { kucuk: true }),
          h("small", {}, g.gostergeMasada === false ? "Alındı" : "Gösterge")));

      // Rakip ıstakaları: ahşap ıstaka, taşlar masada ayakta (arkalarını görürüz). Kimin elinde kaç taş kaldığı
      // belli olmasın diye herkeste hep 21 taş, perler dizilmiş gibi aralıklı gruplar halinde görünür.
      for (const k of [1, 2, 3]) {
        const kol = g.koltuklar[k];
        const istaka = iskelet.istakalar[k];
        istaka.hidden = !!kol.bos;
        if (kol.bos || istaka.dataset.dizili) continue;
        istaka.dataset.dizili = "1";
        const taslar = h("div", { sinif: "ri-taslar" });
        // Istaka sabit boyda (15 taşlık, iki sıra): ön sıra sahibine yakın, arka sıra bir basamak yukarıda.
        // Her sıra boşluklarla ayrılmış gruplar (ön 3·4·3, arka 4·3·4 = 21). Her taş kalınlığı olan küçük bir blok.
        const SIRALAR = [[3, 4, 3], [4, 3, 4]];
        SIRALAR.forEach((gruplar, r) => {
          let c = r ? 1 : 0;
          for (const adet of gruplar) {
            for (let i = 0; i < adet; i++, c++) {
              taslar.append(h("div", { sinif: "ri-tas", stil: { "--c": c, "--r": r } },
                h("i", { sinif: "y-on" }), h("i", { sinif: "y-arka" }), h("i", { sinif: "y-ust" }), h("i", { sinif: "y-sol" }), h("i", { sinif: "y-sag" })));
            }
            c++;   // gruplar arasında bir taşlık boşluk
          }
        });
        istaka.replaceChildren(h("div", { sinif: "ri-taban" }), h("div", { sinif: "ri-basamak" }), h("div", { sinif: "ri-sirt" }), taslar);
      }

      // Atılan taşlar (her oyuncunun sağında). Soldakinin attığı (3) benim alabileceğim.
      g.atilanlar.forEach((yigin, k) => yiginGuncelle(k, yigin));

      // Açılan perler, sahibinin önünde
      const perler = [[], [], [], []];
      g.perler.forEach((per, i) => {
        const oge = h("div", { sinif: "per", veri: { per: i }, title: "İşlemek için taşı buraya sürükle" });
        const tas = (t) => tasOgesi(t, okey, { kucuk: true });
        // 6 ve daha uzun per masada 3'erli sıralar halinde (yer kaplamasın); iki ucuna da işlenir (bırakılan yer per)
        if (per.taslar.length >= 6) {
          oge.classList.add("uclu");
          for (let s = 0; s * 3 < per.taslar.length; s++) {
            oge.append(h("div", { sinif: "per-sira", stil: { "--s": s } }, per.taslar.slice(s * 3, s * 3 + 3).map(tas)));
          }
        } else per.taslar.forEach((t) => oge.append(tas(t)));
        perler[per.sahip].push(oge);
      });
      iskelet.alanlar.forEach((alan, k) => alan.replaceChildren(...perler[k]));
      // Benim alanım (altta, tam genişlik) sadece perlerimin gerektirdiği kadar yüksek olur; kalan yükseklik yandakilerin
      // alanlarına kalır (yan alanlar benimkinin üstünde biter). Böylece boş yer kalmaz, taşlar küçülmez.
      const [p0, p1, , p3] = iskelet.alanlar;
      p0.style.transform = "";
      p0.style.height = "auto";
      p0.style.alignContent = "flex-start";
      const benimYuk = perler[0].length ? Math.min(Math.max(p0.offsetHeight, 70), ALAN_ALT - YAN_UST - 120) : 70;
      p0.style.alignContent = "";
      p0.style.top = ALAN_ALT - benimYuk + "px";
      p0.style.height = benimYuk + "px";
      for (const yan of [p1, p3]) yan.style.height = ALAN_ALT - benimYuk - 8 - YAN_UST + "px";
      iskelet.alanlar.forEach((alan) => {
        // Alana yine de sığmıyorsa (başkasının alanına taşmasın diye) alan biraz küçültülür
        // (ölçerken perler alanın başına toplanır; yayılmış hâlde taşma yukarı doğru da olabilir ve ölçülmez)
        alan.style.transform = "";
        alan.style.alignContent = alan.style.justifyContent = "flex-start";
        const tasma = Math.max(alan.scrollHeight / (alan.clientHeight || 1), alan.scrollWidth / (alan.clientWidth || 1));
        alan.style.alignContent = alan.style.justifyContent = "";
        if (tasma > 1) alan.style.transform = "scale(" + Math.max(0.6, 1 / tasma).toFixed(3) + ")";
      });

      // Koltuklar
      const koltuklar = g.koltuklar.map((kol, k) => {
        // Boş koltuk: izleyici oturabilir; masada oturan bot ekleyebilir
        if (kol.bos) {
          // "+": izleyici oturur; oturan oyuncu (el sürmüyorsa) bu koltuğa geçer
          const oturulur = olaylar.otur && (g.izleyici || g.koltukDegisir);
          return h("div", { sinif: "koltuk bos k" + k, veri: { koltuk: k } },
            h("div", {
              sinif: "okey-avatar" + (oturulur ? " oturulur" : ""), stil: { background: "rgba(255,255,255,.08)" },
              title: oturulur ? (g.izleyici ? "Bu koltuğa otur" : "Bu koltuğa geç") : null,
              onclick: oturulur ? () => olaylar.otur(k) : null
            }, "+"),
            h("div", {}, h("div", { sinif: "ad" }, "Boş koltuk"),
              g.izleyici && olaylar.otur ? h("button", { sinif: "yanci-tus", onclick: () => olaylar.otur(k) }, "Otur") : null,
              g.botEkle && olaylar.botEkle ? h("button", { sinif: "yanci-tus", onclick: () => olaylar.botEkle(k) }, "🤖 Bot ekle") : null));
        }
        const siraOnda = g.sira === k && !g.bitti;
        const yancilar = h("div", { sinif: "yancilar" },
          kol.yancilar.map((y) => h("div", { sinif: "yanci", stil: { background: y.renk }, title: y.ad + " yancı" }, y.ad[0])),
          kol.yancilar.length ? h("span", { stil: { fontSize: "11px", color: "#a7a7a7", marginLeft: "4px" } }, "👁 " + kol.yancilar.length + " yancı") : null,
          // Yancı olmak sadece masada oturmayanlara (izleyicilere) açık; oyuncular başkasının taşına bakamaz
          g.izleyici && !kol.bos ? h("button", { sinif: "yanci-tus", onclick: () => olaylar.yanciOl(k) }, g.izlenen === k ? "İzliyorsun" : "Yancı ol") : null,
          // Oyuncu el ortasında kalktı ya da uzun süredir yok: izleyici yerine oturup elini devralabilir
          g.izleyici && kol.devralinabilir && olaylar.otur ? h("button", { sinif: "yanci-tus", onclick: () => olaylar.otur(k) }, "Yerine otur") : null,
          // Botu el aralarında masadakiler çıkarabilir; kalkıp giden oyuncunun yerine bot konabilir
          kol.bot && g.botEkle && g.bitti && olaylar.botCikar ? h("button", { sinif: "yanci-tus", onclick: () => olaylar.botCikar(k) }, "Botu çıkar") : null,
          !kol.bot && kol.devralinabilir && g.botEkle && olaylar.botEkle ? h("button", { sinif: "yanci-tus", onclick: () => olaylar.botEkle(k) }, "🤖 Yerine bot koy") : null);
        return h("div", { sinif: "koltuk k" + k + (siraOnda ? " sira" : "") + (kol.bagli === false ? " kopuk" : ""), veri: { koltuk: k } },
          avatar(kol, siraOnda ? g.sure : null),
          h("div", {},
            h("div", { sinif: "ad" }, kol.ad + (kol.ben ? " (sen)" : "") + (kol.bagli === false ? " · bağlantı yok" : "")),
            h("div", { sinif: "alt" },
              h("span", {}, "Toplam ", h("span", { sinif: "puan" }, String(kol.puan))),
              kol.acti ? h("span", { sinif: "okey-rozet" + (kol.acti === "cift" ? " cift" : "") }, kol.acti === "cift" ? "Çift açtı" : "Açtı · " + kol.acilisDegeri) : null,
              kol.ceza ? h("span", { stil: { color: "#ff8a7a", fontWeight: 800 } }, "Ceza " + kol.ceza) : null)),
          yancilar);
      });

      const durum = g.durumYazisi ? h("div", { sinif: "durum-yazisi" }, g.durumYazisi) : null;
      kose.replaceChildren(
        ...(g.ekTuslar || []).map((t) => h("button", { sinif: "okey-tus" + (t.secili ? " ana" : ""), onclick: t.is, title: t.ipucu || "" }, t.yazi)),
        h("button", { sinif: "okey-tus", onclick: olaylar.cetele }, "📋 Çetele"),
        h("button", { sinif: "okey-tus", onclick: olaylar.kurallar }, "📖 Kurallar"));
      iskelet.ust.replaceChildren(...koltuklar, durum || "", istakaCiz());
      sigdir();
    }

    // Atılan taş yığını yerinde güncellenir: yığından sadece sondan taş alınır ve sona taş eklenir; var olan taş
    // öğeleri korunur (fare üstündeyken yığın kapanıp açılmaz, yeni taş gelince diğerleri yumuşakça bir adım kayar).
    function yiginGuncelle(k, yigin) {
      const kutu = iskelet.yiginlar[k];
      const alinabilir = k === 3 && g.benimSiram && g.asama === "cek" && yigin.length;
      const atabilirim = k === 0 && g.benimSiram && g.asama === "at" && !g.benim.saltOkunur;
      kutu.classList.toggle("alinabilir", !!alinabilir);
      kutu.classList.toggle("parlak", !!alinabilir);
      kutu.classList.toggle("acik", !!atabilirim);
      kutu.title = (k === 3 ? "Soldan al (o tur açmak zorundasın)" : k === 0 ? "Atmak için taşı buraya bırak" : "") +
        (yigin.length > 1 ? (k === 0 || k === 3 ? " · " : "") + "Üstüne gel: atılan " + yigin.length + " taşı gör" : "");

      let ipucu = kutu.querySelector(".atilan-ipucu");
      if (atabilirim && !yigin.length && !ipucu) kutu.prepend(ipucu = h("div", { sinif: "atilan-ipucu" }, "Atmak için taşı buraya bırak"));
      else if (ipucu && !(atabilirim && !yigin.length)) ipucu.remove();

      const ids = new Set(yigin.map((t) => t.id));
      const mevcut = new Map();
      for (const oge of kutu.querySelectorAll(".tas")) {
        if (!ids.has(oge.dataset.id)) oge.remove();
        else mevcut.set(oge.dataset.id, oge);
      }
      const etiket = kutu.querySelector(".atilan-etiket");
      // --k: sondan kaçıncı; en son atılan yerinde kalır, ilk atılan açılınca en uçta
      yigin.forEach((tas, i) => {
        let oge = mevcut.get(tas.id);
        if (!oge) {
          oge = tasOgesi(tas, g.okey, { kucuk: true });
          kutu.insertBefore(oge, etiket);
        }
        oge.style.visibility = "";
        oge.style.setProperty("--k", yigin.length - 1 - i);
        // İşlek diye gösterilen taş kilitli (kimse alamaz); en üstteki taş gösterilebilir olabilir
        oge.classList.toggle("kilitli", !!(g.kilitliler && g.kilitliler.has(tas.id)));
        const gosterilir = !!(g.gosterilebilir && g.gosterilebilir.yigin === k && g.gosterilebilir.tasId === tas.id && i === yigin.length - 1);
        oge.dataset.gosterilebilir = gosterilir ? "1" : "";
        oge.title = gosterilir ? "İşlek mi? Bir pere sürükleyip göster" : oge.classList.contains("kilitli") ? "İşlek diye gösterildi, alınamaz" : "";
      });
    }

    // Atılan taşı bir pere sürükleyip "işlek" diye göster. Sürüklenen kopya fareyle gezer; bırakılan yer bir perse
    // sunucuya bildirilir (işlek mi değil mi orada karar verilir). Sürükleme sonrası yığına tıklama sayılmaz.
    let surukBitti = 0;
    const sonSurukleme = () => Date.now() - surukBitti < 300;
    function islekSurukle(e, oge) {
      if (e.button !== 0) return;
      e.stopPropagation();
      const kutu = oge.getBoundingClientRect();
      const fark = { x: e.clientX - kutu.left, y: e.clientY - kutu.top };
      let kopya = null;
      let hedef = null;
      const vurgula = (yeni) => {
        if (hedef === yeni) return;
        if (hedef) hedef.classList.remove("isle-hedef");
        hedef = yeni;
        if (hedef) hedef.classList.add("isle-hedef");
      };
      const hareket = (ev) => {
        if (!kopya) {
          if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
          kopya = oge.cloneNode(true);
          kopya.classList.add("surukleniyor");
          kopya.style.transform = "scale(" + olcek + ") rotate(-4deg)";
          kopya.style.transformOrigin = "0 0";
          document.body.append(kopya);
          document.body.classList.add("okey-surukleme");
        }
        kopya.style.left = ev.clientX - fark.x + "px";
        kopya.style.top = ev.clientY - fark.y + "px";
        vurgula(document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest("[data-per]")).find(Boolean) || null);
      };
      const birak = () => {
        removeEventListener("pointermove", hareket);
        removeEventListener("pointerup", birak);
        removeEventListener("pointercancel", birak);
        document.body.classList.remove("okey-surukleme");
        if (!kopya) return;
        surukBitti = Date.now();
        kopya.remove();
        const son = hedef;
        vurgula(null);
        if (son && olaylar.islekGoster) olaylar.islekGoster(Number(son.dataset.per));
      };
      addEventListener("pointermove", hareket);
      addEventListener("pointerup", birak);
      addEventListener("pointercancel", birak);
    }

    // İşlek gösterilen per bir an kırmızı parlar
    function islekVurgula(perNo) {
      const per = sahne.querySelector(`[data-per="${perNo}"]`);
      if (!per) return;
      per.classList.add("islek-gosterildi");
      setTimeout(() => per.classList.remove("islek-gosterildi"), 1800);
    }
    function istakaCiz() {
      const b = g.benim;
      const okey = g.okey;
      const istaka = h("div", { sinif: "istaka" + (b.saltOkunur ? " salt-okunur" : "") });
      // Geçerli perlerin çerçeveleri: perin bir taşının üstüne gelince çevresi sarı parlar, puanı görünür
      const perIcin = new Map();   // yuva -> çerçeve
      for (let s = 0; s < 2; s++) {
        const satir = h("div", { sinif: "istaka-satir" });
        for (const p of (b.perler || []).filter((p) => Math.floor(p.bas / SATIR) === s)) {
          // Çerçevenin üst kenarı (puan etiketiyle) tutamaçtır: oradan sürükleyince bütün per birlikte taşınır
          const tutamac = b.saltOkunur ? null : h("div", { sinif: "istaka-per-tut", title: "Peri bütün olarak taşımak için buradan sürükle" });
          const cerceve = h("div", { sinif: "istaka-per", stil: { gridColumn: (p.bas % SATIR + 1) + " / " + (p.son % SATIR + 2) } },
            tutamac, h("span", {}, p.yazi));
          if (tutamac) {
            tutamac.addEventListener("pointerenter", () => cerceve.classList.add("acik"));
            tutamac.addEventListener("pointerleave", () => cerceve.classList.remove("acik"));
            tutamac.addEventListener("pointerdown", (e) => perSurukle(e, p, cerceve));
          }
          satir.append(cerceve);
          for (let i = p.bas; i <= p.son; i++) perIcin.set(i, cerceve);
        }
        for (let i = s * SATIR; i < (s + 1) * SATIR; i++) {
          const yuva = h("div", { sinif: "yuva", veri: { yuva: i }, stil: { gridColumn: String(i % SATIR + 1), gridRow: "1" } });
          const cerceve = perIcin.get(i);
          if (cerceve) {
            yuva.addEventListener("pointerenter", () => cerceve.classList.add("acik"));
            yuva.addEventListener("pointerleave", () => cerceve.classList.remove("acik"));
          }
          const tas = b.yuvalar[i];
          if (tas) {
            const oge = tasOgesi(tas, okey, {
              sinif: [tas.id === b.yandanId && "yandan", tas.id === b.yeniId && tas.id !== sekenId && "yeni",
                b.islenebilir && b.islenebilir.has(tas.id) && "islenebilir"].filter(Boolean).join(" ")
            });
            if (oge.classList.contains("islenebilir")) oge.title += " · masadaki bir pere işlenebilir";
            if (yatiklar.has(tas.id)) oge.classList.add("yatik");
            if (tas.id === surukleneId) oge.classList.add("hayalet");
            if (!b.saltOkunur) {
              oge.addEventListener("pointerdown", (e) => surukleBaslat(e, tas, oge));
              oge.addEventListener("dblclick", () => olaylar.tasAt(tas.id));
              // Sağ tık: taşı yan yatır / kaldır — oyuncunun kendine notu ("bunu atmayacağım", "bekletiyorum")
              oge.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                if (yatiklar.has(tas.id)) yatiklar.delete(tas.id);
                else yatiklar.add(tas.id);
                oge.classList.toggle("yatik", yatiklar.has(tas.id));
              });
            }
            yuva.append(oge);
          }
          satir.append(yuva);
        }
        istaka.append(satir);
      }
      sekenId = b.yeniId;

      const bant = h("div", { sinif: "istaka-bandi" });
      if (b.yanciBandi) {
        bant.append(h("span", { sinif: "yanci-bandi" }, "👁 " + b.yanciBandi),
          b.donulebilir ? h("button", { sinif: "okey-tus", onclick: olaylar.masayaDon }, "Yanından kalk") : "");
      } else {
        const a = g.acilis;
        if (g.bitti) {
          // sonrakiYazi: null ise düğme yok (masa dolmadı); verilmezse "Sonraki el"
          bant.append(g.sonrakiYazi === null ? "" : h("button", { sinif: "okey-tus ana", onclick: olaylar.sonrakiEl }, g.sonrakiYazi || "Sonraki el"),
            h("button", { sinif: "okey-tus", onclick: olaylar.cetele }, "Çetele"));
          return h("div", { sinif: "istaka-alani" }, istaka, bant);
        }
        bant.append(...[
          h("button", { sinif: "okey-tus", onclick: olaylar.seriDiz, title: "Serileri ve kütleri yan yana dizer" }, "Seri diz"),
          h("button", { sinif: "okey-tus", onclick: olaylar.ciftDiz, title: "Çiftleri yan yana dizer" }, "Çift diz"),
          a ? h("span", { sinif: "gosterge-durum", title: "Istakada yan yana duran geçerli perlerin toplamı" },
            a.acti ? (a.yeniPer ? "Konabilecek per var" : "Yeni per yok") : [
              "Seri ", h("b", { sinif: a.seri >= a.seriBaraj ? "tamam" : "" }, String(a.seri)), " / " + a.seriBaraj,
              "  ·  Çift ", h("b", { sinif: a.cift >= a.ciftBaraj ? "tamam" : "" }, String(a.cift)), " / " + a.ciftBaraj
            ]) : null,
          h("button", { sinif: "okey-tus ana", disabled: !g.tuslar.ac.etkin, title: g.tuslar.ac.ipucu || "", onclick: olaylar.ac }, g.tuslar.ac.yazi),
          // İşle: işlenebilen taşları masadaki perlere işler (taşı pere sürükleyerek de olur)
          g.tuslar.isle ? h("button", {
            sinif: "okey-tus" + (g.tuslar.isle.sayi ? " ana" : ""), onclick: olaylar.isleHepsi,
            title: "İşlenebilen taşları masadaki perlere işler (bir taş elde kalır). Taşı pere sürükleyerek de işleyebilirsin."
          }, "İşle" + (g.tuslar.isle.sayi ? " (" + g.tuslar.isle.sayi + ")" : "")) : null
        ].filter(Boolean));
      }
      return h("div", { sinif: "istaka-alani" }, istaka, bant);
    }

    // ---------- sürükle-bırak ----------
    // Taş ıstakada başka bir yuvaya, "Attığın" kutusuna ya da masadaki bir pere bırakılabilir.
    // Sürüklemeden tıklamak bir şey yapmaz; çift tıklamak taşı atar.
    function surukleBaslat(e, tas, oge) {
      if (e.button !== 0) return;
      const bas = { x: e.clientX, y: e.clientY };
      const kutu = oge.getBoundingClientRect();
      const fark = { x: e.clientX - kutu.left, y: e.clientY - kutu.top };
      let kopya = null;
      let hedef = null;
      const vurgula = (yeni) => {
        if (hedef === yeni) return;
        if (hedef) hedef.classList.remove(hedef.classList.contains("yuva") ? "hedef" : hedef.classList.contains("per") ? "isle-hedef" : "hedef");
        hedef = yeni;
        if (hedef) hedef.classList.add(hedef.classList.contains("per") ? "isle-hedef" : "hedef");
      };
      const hareket = (ev) => {
        if (!kopya) {
          if (Math.hypot(ev.clientX - bas.x, ev.clientY - bas.y) < 5) return;
          kopya = oge.cloneNode(true);
          kopya.classList.add("surukleniyor");
          kopya.style.transform = "scale(" + olcek + ") rotate(-4deg)";
          kopya.style.transformOrigin = "0 0";
          document.body.append(kopya);
          oge.classList.add("hayalet");
          surukleneId = tas.id;
        }
        kopya.style.left = ev.clientX - fark.x + "px";
        kopya.style.top = ev.clientY - fark.y + "px";
        document.body.classList.add("okey-surukleme");   // sürüklerken atılan taş yığınları açılmasın
        const altta = document.elementsFromPoint(ev.clientX, ev.clientY);
        vurgula(altta.map((x) => x.closest("[data-yuva], [data-hedef='at'], [data-per]" + (tas.id === g.benim.yandanId ? ", [data-atilan='3']" : ""))).find(Boolean) || null);
      };
      const birak = () => {
        removeEventListener("pointermove", hareket);
        removeEventListener("pointerup", birak);
        removeEventListener("pointercancel", birak);
        document.body.classList.remove("okey-surukleme");
        if (!kopya) return;
        kopya.remove();
        surukleneId = null;
        // Taşın öğesi sürükleme sırasında yeniden çizilmiş olabilir: ıstakadaki güncel öğeyi aç
        (sahne.querySelector(`.istaka [data-id="${tas.id}"]`) || oge).classList.remove("hayalet");
        const son = hedef;
        vurgula(null);
        if (!son) return;
        if (son.dataset.yuva != null) olaylar.tasTasi(tas.id, Number(son.dataset.yuva));
        else if (son.dataset.hedef === "at") olaylar.tasAt(tas.id);
        else if (son.dataset.atilan === "3") olaylar.geriBirak(tas.id);   // soldan alınanı geri bırak
        else if (son.dataset.per != null) olaylar.isle(tas.id, Number(son.dataset.per));
      };
      addEventListener("pointermove", hareket);
      addEventListener("pointerup", birak);
      addEventListener("pointercancel", birak);
    }

    // Istakadaki bir peri çerçevesinin üst kenarından tutup bütün olarak taşı. Perin taşlarının bir kopyası
    // fareyle gezer; bırakınca perin ilk taşının altına geldiği yuva hedeftir (sığmazsa per yerinde kalır).
    function perSurukle(e, p, cerceve) {
      if (e.button !== 0) return;
      e.preventDefault();
      const taslar = [...sahne.querySelectorAll(".istaka .yuva")].filter((y) => {
        const i = Number(y.dataset.yuva);
        return i >= p.bas && i <= p.son;
      }).map((y) => y.querySelector(".tas")).filter(Boolean);
      if (!taslar.length) return;
      const ilk = taslar[0].getBoundingClientRect();
      const fark = { x: e.clientX - ilk.left, y: e.clientY - ilk.top };
      const kopya = h("div", { sinif: "per-surukleniyor" }, taslar.map((t) => t.cloneNode(true)));
      kopya.style.transform = "scale(" + olcek + ") rotate(-2deg)";
      kopya.style.transformOrigin = "0 0";
      let hedef = null;
      const vurgula = (yeni) => {
        if (hedef === yeni) return;
        if (hedef) hedef.classList.remove("hedef");
        hedef = yeni;
        if (hedef) hedef.classList.add("hedef");
      };
      let basladi = false;
      const hareket = (ev) => {
        if (!basladi) {
          if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
          basladi = true;
          document.body.append(kopya);
          taslar.forEach((t) => t.classList.add("hayalet"));
          document.body.classList.add("okey-surukleme");
        }
        kopya.style.left = ev.clientX - fark.x + "px";
        kopya.style.top = ev.clientY - fark.y + "px";
        // Hedef: kopyadaki ilk taşın ortasının altındaki yuva
        const x = ev.clientX - fark.x + ilk.width / 2;
        const y = ev.clientY - fark.y + ilk.height / 2;
        vurgula(document.elementsFromPoint(x, y).map((o) => o.closest("[data-yuva]")).find(Boolean) || null);
      };
      const birak = () => {
        removeEventListener("pointermove", hareket);
        removeEventListener("pointerup", birak);
        removeEventListener("pointercancel", birak);
        document.body.classList.remove("okey-surukleme");
        cerceve.classList.remove("acik");
        if (!basladi) return;
        kopya.remove();
        taslar.forEach((t) => t.classList.remove("hayalet"));
        const son = hedef;
        vurgula(null);
        if (son && olaylar.perTasi) olaylar.perTasi(p.bas, p.son, Number(son.dataset.yuva));
      };
      addEventListener("pointermove", hareket);
      addEventListener("pointerup", birak);
      addEventListener("pointercancel", birak);
    }

    // ---------- animasyon ve bildirim ----------
    // Bir taşı (ön ya da arka yüzüyle) iki öğe arasında uçurur. Masa eğik olduğu için ekrandaki kutular kullanılır.
    // Sekme arka plandayken tarayıcı animasyonları ilerletmez; oyun beklemesin diye o zaman uçuş atlanır,
    // ve her uçuş en geç süresi dolunca biter sayılır.
    // Kaynak bir taşsa uçuş boyunca gizlenir; yoksa taş bir an iki yerde birden görünür (yerinde ve havada).
    function ucur(kaynak, hedef, tas, sure = 420) {
      if (!kaynak || !hedef || document.hidden) return Promise.resolve();
      const gizlenen = kaynak.classList.contains("tas") ? kaynak : null;
      if (gizlenen) gizlenen.style.visibility = "hidden";
      const a = kaynak.getBoundingClientRect();
      const b = hedef.getBoundingClientRect();
      const oge = tas ? tasOgesi(tas, g.okey, { kucuk: true }) : h("div", { sinif: "tas-arka" });
      const kap = h("div", { sinif: "ucan-tas" }, oge);
      document.body.append(kap);
      const w = oge.offsetWidth || 30;
      const y = oge.offsetHeight || 41;
      // Kaynak ya da hedef bir ıstaka/alan olabilir (taştan büyük); boyut taş boyunun makul aralığında tutulur
      const boy = (kutu) => Math.min(Math.max(kutu.width / w, olcek * 0.6), olcek * 1.6);
      const s1 = boy(a), s2 = boy(b);
      kap.style.left = a.left + a.width / 2 - w / 2 + "px";
      kap.style.top = a.top + a.height / 2 - y / 2 + "px";
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const anim = kap.animate([
        { transform: `translate(0,0) scale(${s1})` },
        { transform: `translate(${dx / 2}px, ${dy / 2 - 40}px) scale(${(s1 + s2) / 2 * 1.15})` },
        { transform: `translate(${dx}px, ${dy}px) scale(${s2})` }
      ], { duration: sure, easing: "cubic-bezier(.3,.7,.3,1)" });
      const yedek = new Promise((r) => setTimeout(r, sure + 150));
      // Gizlenen taş geri açılmaz: uçuştan hemen sonra masa yeniden çizilir ve taş yeni yerinde görünür
      return Promise.race([anim.finished.catch(() => { }), yedek]).then(() => kap.remove());
    }

    // Süre halkası her saniye sadece kendisi güncellenir (bütün masayı yeniden çizmek sürüklemeyi ve çift tıklamayı bozar)
    function sureGuncelle(sure) {
      if (!g) return;
      g.sure = sure;
      const c = sahne.querySelector(".koltuk.sira circle");
      if (!c) return;
      const cevre = 2 * Math.PI * 24;
      c.style.strokeDashoffset = cevre * (1 - sure.kalan / sure.toplam);
      c.style.stroke = sure.kalan / sure.toplam < 0.3 ? "#e5484d" : "";
    }

    let bildirimZamani = null;
    function bildir(metin, tur) {
      kok.querySelectorAll(".okey-bildirim").forEach((x) => x.remove());
      const oge = h("div", { sinif: "okey-bildirim" + (tur === "ceza" ? " ceza" : "") }, metin);
      kok.append(oge);
      clearTimeout(bildirimZamani);
      bildirimZamani = setTimeout(() => oge.remove(), 2600);
    }

    // Koltuğun üstünde yukarı süzülen puan (+101, −101)
    function puanUcur(koltuk, miktar) {
      const kol = sahne.querySelector(`[data-koltuk="${koltuk}"]`);
      if (!kol) return;
      const oge = h("div", { sinif: "ucan-puan" + (miktar < 0 ? " eksi" : "") }, (miktar > 0 ? "+" : "−") + Math.abs(miktar));
      kol.append(oge);
      setTimeout(() => oge.remove(), 1700);
    }

    // genis: çetele gibi büyük içerik için; "tam": masa alanını neredeyse tamamen kaplar (odanın çetelesi)
    // kapaninca: pencere nasıl kapanırsa kapansın (düğme ya da dışına tıklama) çağrılır
    function pencere(baslik, govde, tuslar = [], genis = false, kapaninca = null) {
      kok.querySelectorAll(".okey-pencere").forEach((x) => x.remove());
      const kapat = () => { p.remove(); if (kapaninca) kapaninca(); };
      const p = h("div", { sinif: "okey-pencere", onclick: (e) => e.target === p && kapat() },
        h("div", { sinif: genis === "tam" ? "okey-genis okey-tam" : genis ? "okey-genis" : "" }, h("h3", {}, baslik), govde,
          h("div", { sinif: "alt-tuslar" }, (tuslar.length ? tuslar : [{ yazi: "Kapat" }]).map((t) =>
            h("button", { sinif: "okey-tus" + (t.ana ? " ana" : "") + (t.sinif ? " " + t.sinif : ""), onclick: () => { kapat(); t.is && t.is(); } }, t.yazi)))));
      kok.append(p);
    }

    // Uçuş animasyonu için öğe bulucular
    const oge = {
      deste: () => sahne.querySelector(".deste"),
      gosterge: () => sahne.querySelector("[data-gosterge] .tas"),
      atilan: (k) => sahne.querySelector(".atilan.a" + k),
      atilanUst: (k) => [...sahne.querySelectorAll(".atilan.a" + k + " .tas")].pop() || sahne.querySelector(".atilan.a" + k),
      rakipIstaka: (k) => sahne.querySelector(`[data-istaka="${k}"]`),
      tas: (id) => sahne.querySelector(`.istaka [data-id="${id}"]`),
      yuva: (i) => sahne.querySelector(`[data-yuva="${i}"]`),
      perAlani: (k) => sahne.querySelector(".per-alani.p" + k)
    };

    return { ciz, sureGuncelle, ucur, bildir, puanUcur, pencere, oge, h, tasOgesi, islekVurgula };
  };
})();
