// Sayfa açılışı: önce Google girişi istenir (giriş kapısı). Giriş yapılınca ?oda=... varsa oda, yoksa lobi açılır.
// Girişten önce hiçbir veri okunmaz ve hiçbir şey başlatılmaz; çıkış yapılınca sayfa yenilenip kapıya dönülür.

(function () {
  if (new URLSearchParams(location.search).has("tani")) taniModunuAc();
  yeniSurumuDenetle();
  const sorun = firebaseBaslat();
  if (sorun) return girisKapisiniGoster(sorun);
  let basladi = false;
  oturumDegisince(() => {
    if (googleGirisli()) {
      $("girisKapisi").hidden = true;
      if (!basladi) {
        basladi = true;
        siteyiBaslat();
      }
    } else if (basladi) {
      // Çıkış yapıldı: açık kalan hiçbir dinleyici/görüntü kalmasın
      location.reload();
    } else {
      girisKapisiniGoster();
    }
  });
})();

function girisKapisiniGoster(sorun) {
  $("girisKapisi").hidden = false;
  $("girisKapisiYazi").textContent = sorun || "Bekleniyor'a girmek için Google hesabınla giriş yap.";
  $("girisKapisiTus").replaceChildren(sorun ? "" : googleTusu("Google ile giriş yap"));
  $("girisKapisiNot").textContent = sorun ? "" : "Sadece Google hesabıyla girilebilir. Giriş yapmadan site görünmez.";
}

function siteyiBaslat() {
  const istenenOda = new URLSearchParams(location.search).get("oda");
  oturumDegisince(() => { if (yonetici) anaOdayiHazirla(); });
  if (istenenOda && gecerliOdaId(istenenOda)) {
    odayiBaslat(istenenOda);
  } else {
    lobiyiBaslat();
    siralamayiBaslat();
  }
  istatistikBaslat();
  akisAdresiniKaydet();
  oturumRozetleriniCiz();
  // Şimdi eklenen dinleyiciler giriş bilgisini alsın
  oturumuYenidenBildir();
}

// GitHub Pages sayfayı tarayıcıda 10 dk saklatıyor; güncellemeden sonra yenileyen eski sürümü görebiliyor.
// Ara ara sayfanın en yeni hâli önbelleksiz okunur, içindeki ?v=N bizimkinden büyükse üstte
// "Yeni sürüm var" düğmesi çıkar. Müzik kesilmesin diye kendiliğinden yenilenmez; basınca yenilenir.
function yeniSurumuDenetle() {
  const surumu = (metin) => {
    const m = /temel\.js\?v=(\d+)/.exec(metin);
    return m ? Number(m[1]) : 0;
  };
  const bendeki = surumu([...document.scripts].map((s) => s.getAttribute("src") || "").join(" "));
  if (!bendeki) return;
  let tus = null;
  let sonDenetim = 0;
  async function denetle() {
    if (tus || document.hidden || Date.now() - sonDenetim < 60000) return;
    sonDenetim = Date.now();
    let yeni = 0;
    try {
      const cevap = await fetch(location.pathname + "?surumDenetimi=" + Date.now(), { cache: "no-store" });
      if (cevap.ok) yeni = surumu(await cevap.text());
    } catch (e) { }
    if (yeni <= bendeki) return;
    tus = el("button", {
      className: "yeni-surum", type: "button",
      title: "Sayfa yenilenir" + (typeof katildi !== "undefined" && katildi ? "; odaya tekrar katılman gerekir" : ""),
      onclick: () => location.reload()
    }, "🔄 Yeni sürüm var · yenile");
    document.body.append(tus);
  }
  setInterval(denetle, 3 * 60 * 1000);
  document.addEventListener("visibilitychange", denetle);
  setTimeout(denetle, 5000);
}

// Reklamsız akış sunucusu açılınca ("Bekleniyor akışı başlat.bat") yöneticinin tarayıcısında
// ?akis=<tünel adresi> ile site açılır; adres Firebase'e yazılır ve bütün odalar onu kullanır.
// Erişim anahtarı (&anahtar=) de birlikte saklanır; akış sunucusu anahtarsız isteği reddeder.
function akisAdresiniKaydet() {
  const p = new URLSearchParams(location.search);
  const adres = p.get("akis");
  const anahtar = p.get("anahtar") || "";
  if (!adres || !db) return;
  if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(adres)) return bildir("Akış sunucusu adresi geçersiz");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(anahtar)) return bildir("Akış sunucusu eski sürüm: pencereyi kapatıp 'Bekleniyor akışı başlat'ı yeniden aç");
  let bitti = false;
  oturumDegisince(() => {
    if (bitti) return;
    if (!kullanici || !yonetici) return bildir("Akış sunucusunu açmak için yönetici hesabıyla Google'dan giriş yap");
    bitti = true;
    db.ref("ayarlar/akis").set({ adres, anahtar, zaman: firebase.database.ServerValue.TIMESTAMP }).then(() => {
      bildir("Reklamsız akış açıldı ✓ Odalarda şarkılar artık reklamsız çalacak");
      history.replaceState(null, "", location.pathname);
    }).catch((e) => bildir("Akış adresi kaydedilemedi: " + e.message));
  });
}

// ?tani=1 ile açılır: sayfanın aldığı tıklamaları ve farenin altındaki öğeyi sol alta yazar.
// Tıklamanın sayfaya hiç ulaşıp ulaşmadığını görmek için kullanılır.
function taniModunuAc() {
  const kutu = el("div", {
    style: {
      position: "fixed", left: "8px", bottom: "8px", zIndex: "99999", maxWidth: "70vw",
      padding: "6px 8px", borderRadius: "6px", background: "rgba(0,0,0,0.85)", color: "#3f3",
      font: "12px monospace", whiteSpace: "pre", pointerEvents: "none"
    }
  });
  document.body.append(kutu);
  const satirlar = [];
  let fareSatiri = "";
  const ad = (h) => h ? (h.id || (typeof h.className === "string" && h.className) || h.tagName) : "yok";
  const ciz = () => {
    kutu.textContent = ["TANI · pencere " + innerWidth + "x" + innerHeight + " · zoom %" + Math.round(devicePixelRatio * 100),
      fareSatiri, ...satirlar.slice(0, 6)].join("\n");
  };
  ["pointerdown", "click"].forEach((tur) => document.addEventListener(tur, (e) => {
    satirlar.unshift(tur + " " + Math.round(e.clientX) + "," + Math.round(e.clientY) + " → " + ad(e.target));
    ciz();
  }, true));
  let sonFare = null;
  document.addEventListener("mousemove", (e) => { sonFare = e; }, true);
  setInterval(() => {
    if (!sonFare) return;
    fareSatiri = "fare " + sonFare.clientX + "," + sonFare.clientY + " altında: " + ad(document.elementFromPoint(sonFare.clientX, sonFare.clientY));
    ciz();
  }, 300);
  addEventListener("resize", ciz);
  ciz();
}
