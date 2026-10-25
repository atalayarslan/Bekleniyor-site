// Oda görünümü: herkesin aynı anda dinlediği müzik, arama, sıra ve geçmiş.

let odaId = null;
let odaRef = null;
let muzikRef = null;
let odaBilgi = null;
let odaTasarim = null;
let odaFotolar = null;
let simdiki = null;           // odada şu an çalan şarkı
let siraVerisi = {};
let oncekiListesi = [];       // geri düğmesi için son çalınan şarkılar
let gecmisListesi = [];
let ilerlemeSurukleniyor = false;
let oynatici = null;
let oynaticiHazir = false;
let yuklenenId = null;        // YouTube oynatıcısına yüklü video
let katildi = false;
let asansorSustur = false;
let isim = "Misafir";
let benimKaydim = null;
const asansor = $("elevatorMusic");
const basariSesi = $("successSound");

// ---------- Yardımcılar ----------

function konumHesapla(sarki) {
  if (!sarki) return 0;
  if (sarki.duraklatildi) return sarki.konum || 0;
  return Math.max(0, (sunucuZamani() - sarki.baslangic) / 1000);
}

function odaSahibiMi() {
  return !!(kullanici && odaBilgi && odaBilgi.sahip === kullanici.uid);
}

function duzenleyebilirMi() {
  return odaSahibiMi() || yonetici;
}

function odaVarsayilanAdi() {
  return odaId === ANA_ODA ? "Ana Oda ⭐" : "Oda";
}

function siraListesi() {
  return Object.keys(siraVerisi).sort().map((k) => Object.assign({ anahtar: k }, siraVerisi[k]));
}

// ---------- Başlangıç ----------

function odayiBaslat(id) {
  odaId = id;
  $("oda").hidden = false;
  document.title = "Bekleniyor · oda";
  odaTasariminiUygula();
  odaBasligiCiz();

  const sorun = db ? null : "Firebase bağlantısı kurulamadı.";
  if (sorun) {
    $("kurulumUyarisi").textContent = sorun;
    $("kurulumUyarisi").hidden = false;
    return;
  }

  odaRef = db.ref("odalar/" + id);
  muzikRef = odaRef.child("muzik");

  let bilgiGeldi = false;
  odaRef.child("bilgi").on("value", (s) => {
    odaBilgi = s.val();
    if (!bilgiGeldi && !odaBilgi && id !== ANA_ODA) odaBulunamadi();
    bilgiGeldi = true;
    odaBasligiCiz();
    yetkileriGuncelle();
  });
  odaRef.child("tasarim").on("value", (s) => { odaTasarim = s.val(); odaTasariminiUygula(); });
  db.ref("odaFotolari/" + id).on("value", (s) => { odaFotolar = s.val(); odaTasariminiUygula(); });

  // Müzik düğümünün tamamını dinlemek, işlemlerin (transaction) her zaman dolu veriyle başlamasını sağlar.
  muzikRef.on("value", (s) => {
    const m = s.val() || {};
    simdiki = m.simdiki || null;
    siraVerisi = m.sira || {};
    oncekiListesi = Object.values(m.onceki || {});
    arayuzuGuncelle();
    siraCiz();
    senkronla();
  });

  // Sadece gerçekten yeni basılmış bir "Sonunda"yı kutla.
  let sonKutlama = null;
  muzikRef.child("kutlama").on("value", (s) => {
    const deger = s.val() || 0;
    if (sonKutlama !== null && deger > sonKutlama + 3000 && sunucuZamani() - deger < 15000) kutla();
    sonKutlama = Math.max(sonKutlama || 0, deger);
  });

  odaRef.child("katilanlar").on("value", (s) => {
    const sayi = s.numChildren();
    $("kisiSayisi").textContent = sayi ? sayi + " kişi bekliyor" : "";
  });

  db.ref("odaGecmisi/" + id).limitToLast(100).on("value", (s) => {
    const veri = s.val() || {};
    gecmisListesi = Object.keys(veri).sort().reverse().map((k) => veri[k]);
    gecmisCiz();
  });

  db.ref(".info/connected").on("value", (s) => { if (s.val() && katildi) varliginiBildir(); });

  oturumDegisince(() => {
    yetkileriGuncelle();
    listeleriBaslat();
    if (!$("isimKutusu").value && kisaAd()) $("isimKutusu").value = kisaAd();
  });

  $("isimKutusu").value = hafizadanOku("isim") || "";
  const kayitliSes = hafizadanOku("ses");
  if (kayitliSes !== null) $("sesAyari").value = kayitliSes;
  asansor.volume = Number($("sesAyari").value) / 100;

  odaOlaylariniBagla();
  duzenOlaylariniBagla();
  sahneyiPanellereBagla();
  listelerCiz();
  siraCiz();
  gecmisCiz();
  arayuzuGuncelle();

  const betik = document.createElement("script");
  betik.src = "https://www.youtube.com/iframe_api";
  document.body.append(betik);
}

// Bir yan panel açılıp kapandığında sahneyi (daire, fotoğraflar, üst çubuk) kalan alana kaydırır.
function sahneyiPanellereBagla() {
  const guncelle = () => {
    $("oda").classList.toggle("sag-acik", $("listePaneli").classList.contains("acik"));
    $("oda").classList.toggle("sol-acik", $("duzenPaneli").classList.contains("acik"));
  };
  const gozlemci = new MutationObserver(guncelle);
  gozlemci.observe($("listePaneli"), { attributes: true, attributeFilter: ["class"] });
  gozlemci.observe($("duzenPaneli"), { attributes: true, attributeFilter: ["class"] });
  guncelle();
}

function odaBulunamadi() {
  $("katilEkrani").querySelector(".katil-kart").replaceChildren(
    el("h2", {}, "Oda bulunamadı"),
    el("p", {}, "Bu oda silinmiş ya da link yanlış olabilir."),
    el("a", { className: "tus-ana genis", href: "./", style: { display: "inline-block", textDecoration: "none" } }, "Lobiye dön")
  );
}

function odaTasariminiUygula() {
  if (duzenAcik) return;
  tasarimiUygula(tasarimiTamamla(odaTasarim, odaId), gecerliFotolar(odaId, odaFotolar));
}

function odaBasligiCiz() {
  const ad = (odaBilgi && odaBilgi.ad) || odaVarsayilanAdi();
  $("odaAdi").textContent = ad;
  $("katilBaslik").textContent = ad;
  document.title = ad + " · Bekleniyor";
}

function yetkileriGuncelle() {
  $("duzenTus").hidden = !duzenleyebilirMi();
  $("odaYonetimTus").hidden = !yonetici;
}

// ---------- Katılma ve varlık ----------

function varliginiBildir() {
  if (!odaRef) return;
  if (!benimKaydim) benimKaydim = odaRef.child("katilanlar").push();
  benimKaydim.onDisconnect().remove();
  benimKaydim.set(isim);
}

function odayaKatil() {
  isim = $("isimKutusu").value.trim().slice(0, 20) || kisaAd() || "Misafir";
  hafizayaYaz("isim", isim);
  katildi = true;
  $("katilEkrani").hidden = true;
  varliginiBildir();
  senkronla();
  arayuzuGuncelle();
}

// ---------- Oda işlemleri (herkese yansır) ----------

function gecmiseYaz(sarki) {
  db.ref("odaGecmisi/" + odaId).push(Object.assign(sarkiKaydi(sarki), {
    ekleyen: String(sarki.ekleyen || "").slice(0, 40),
    zaman: firebase.database.ServerValue.TIMESTAMP
  })).catch(() => { });
}

// Bir ya da daha fazla şarkıyı sıraya ekler; oda boşsa ilki hemen çalmaya başlar.
function sarkilariEkle(liste) {
  if (!muzikRef) return;
  const kayitlar = liste.filter((s) => gecerliId(s.videoId)).map((s) => Object.assign(sarkiKaydi(s), { ekleyen: isim }));
  if (!kayitlar.length) return;
  const anahtarlar = kayitlar.map(() => muzikRef.child("sira").push().key);
  let baslayan = null;
  return muzikRef.transaction((m) => {
    m = m || {};
    baslayan = null;
    let i = 0;
    if (!m.simdiki) {
      m.simdiki = Object.assign({}, kayitlar[0], { baslangic: sunucuZamani(), duraklatildi: false, konum: 0 });
      baslayan = m.simdiki;
      i = 1;
    }
    m.sira = m.sira || {};
    for (; i < kayitlar.length; i++) m.sira[anahtarlar[i]] = kayitlar[i];
    return m;
  }).then((sonuc) => {
    if (!sonuc.committed) return;
    if (baslayan) gecmiseYaz(baslayan);
    bildir(kayitlar.length === 1 ? "Eklendi: " + kayitlar[0].baslik : kayitlar.length + " şarkı sıraya eklendi");
  }).catch((e) => bildir("Eklenemedi: " + e.message));
}

// Sadece biten şarkı hâlâ çalıyorsa ilerler; böylece birden fazla kişi aynı anda tetiklese de tek şarkı atlanır.
function sonrakineGec(bitenId) {
  if (!muzikRef) return;
  let baslayan = null;
  muzikRef.transaction((m) => {
    baslayan = null;
    if (!m) return m;
    if (!m.simdiki || m.simdiki.videoId !== bitenId) return;
    m.onceki = oncekiyeEkle(m.onceki, m.simdiki);
    const anahtarlar = Object.keys(m.sira || {}).sort();
    if (!anahtarlar.length) {
      m.simdiki = null;
      return m;
    }
    const sonraki = m.sira[anahtarlar[0]];
    delete m.sira[anahtarlar[0]];
    m.simdiki = Object.assign({}, sonraki, { baslangic: sunucuZamani(), duraklatildi: false, konum: 0 });
    baslayan = m.simdiki;
    return m;
  }).then((sonuc) => {
    if (sonuc.committed && baslayan) gecmiseYaz(baslayan);
  }).catch(() => { });
}

// Geri düğmesi için odada son 5 şarkı tutulur.
const ONCEKI_SINIRI = 5;

function oncekiyeEkle(onceki, sarki) {
  const liste = Object.values(onceki || {});
  liste.push(Object.assign(sarkiKaydi(sarki), { ekleyen: String(sarki.ekleyen || "").slice(0, 40) }));
  return liste.slice(-ONCEKI_SINIRI);
}

// Sıranın en başına eklenecek şarkı için, mevcut anahtarların hepsinden önce sıralanan bir anahtar.
function sirabasiAnahtari() {
  return "!" + String(9e15 - Date.now()).padStart(16, "0");
}

// Seçilen şarkıyı hemen çalar; çalan şarkı kapanır, sıra olduğu gibi devam eder.
// Şarkı sıradan seçildiyse sıradan çıkarılır.
function hemenCal(sarki, siraAnahtari) {
  if (!muzikRef || !gecerliId(sarki.videoId)) return;
  const kayit = Object.assign(sarkiKaydi(sarki), { ekleyen: String(sarki.ekleyen || isim).slice(0, 40) });
  let baslayan = null;
  muzikRef.transaction((m) => {
    m = m || {};
    if (m.simdiki) m.onceki = oncekiyeEkle(m.onceki, m.simdiki);
    if (siraAnahtari && m.sira) delete m.sira[siraAnahtari];
    m.simdiki = Object.assign({}, kayit, { baslangic: sunucuZamani(), duraklatildi: false, konum: 0 });
    baslayan = m.simdiki;
    return m;
  }).then((sonuc) => {
    if (!sonuc.committed) return;
    gecmiseYaz(baslayan);
    bildir("Şimdi çalıyor: " + kayit.baslik);
  }).catch((e) => bildir("Çalınamadı: " + e.message));
}

// Spotify gibi: şarkı 3 saniyeyi geçtiyse başa sarar, değilse önceki şarkıya döner.
// Çalan şarkı kaybolmasın diye sıranın en başına geri konur.
function geriGit() {
  if (!muzikRef || !simdiki) return;
  if (konumHesapla(simdiki) > 3 || !oncekiListesi.length) {
    konumaGit(0);
    return;
  }
  let baslayan = null;
  muzikRef.transaction((m) => {
    baslayan = null;
    if (!m || !m.simdiki) return m;
    const liste = Object.values(m.onceki || {});
    if (!liste.length) return;
    const onceki = liste.pop();
    m.onceki = liste.length ? liste : null;
    m.sira = m.sira || {};
    m.sira[sirabasiAnahtari()] = Object.assign(sarkiKaydi(m.simdiki), { ekleyen: String(m.simdiki.ekleyen || "").slice(0, 40) });
    m.simdiki = Object.assign({}, onceki, { baslangic: sunucuZamani(), duraklatildi: false, konum: 0 });
    baslayan = m.simdiki;
    return m;
  }).then((sonuc) => {
    if (sonuc.committed && baslayan) gecmiseYaz(baslayan);
  }).catch(() => { });
}

function simdikiniDegistir(degistir) {
  if (!muzikRef) return;
  muzikRef.child("simdiki").transaction((s) => {
    if (!s) return s;
    degistir(s);
    return s;
  });
}

function duraklat() {
  simdikiniDegistir((s) => {
    if (s.duraklatildi) return;
    s.konum = konumHesapla(s);
    s.duraklatildi = true;
  });
}

function devamEt() {
  simdikiniDegistir((s) => {
    if (!s.duraklatildi) return;
    s.baslangic = sunucuZamani() - (s.konum || 0) * 1000;
    s.duraklatildi = false;
  });
}

function konumaGit(saniye) {
  simdikiniDegistir((s) => {
    if (s.duraklatildi) s.konum = saniye;
    else s.baslangic = sunucuZamani() - saniye * 1000;
  });
}

function siraKaristir() {
  muzikRef.child("sira").transaction((sira) => {
    if (!sira) return sira;
    const yeni = {};
    for (const s of karistir(Object.values(sira))) yeni[muzikRef.child("sira").push().key] = s;
    return yeni;
  });
}

// ---------- Bu cihazdaki oynatıcıyı odaya uydurma ----------

function senkronla() {
  if (!katildi) return;

  if (!simdiki) {
    if (oynaticiHazir && yuklenenId) {
      oynatici.stopVideo();
      yuklenenId = null;
    }
    if (asansorSustur) asansor.pause();
    else asansor.play().catch(() => { });
    return;
  }

  asansor.pause();
  if (!oynaticiHazir) return;

  const hedef = konumHesapla(simdiki);
  if (simdiki.videoId !== yuklenenId) {
    yuklenenId = simdiki.videoId;
    if (simdiki.duraklatildi) oynatici.cueVideoById({ videoId: yuklenenId, startSeconds: hedef });
    else oynatici.loadVideoById({ videoId: yuklenenId, startSeconds: hedef });
    return;
  }

  const durum = oynatici.getPlayerState();
  const fark = Math.abs(oynatici.getCurrentTime() - hedef);
  if (simdiki.duraklatildi) {
    if (durum === YT.PlayerState.PLAYING || durum === YT.PlayerState.BUFFERING) oynatici.pauseVideo();
    if (fark > 1) oynatici.seekTo(hedef, true);
  } else {
    if (fark > 2.5) oynatici.seekTo(hedef, true);
    if (durum !== YT.PlayerState.PLAYING && durum !== YT.PlayerState.BUFFERING && durum !== YT.PlayerState.ENDED) {
      oynatici.playVideo();
    }
  }
}

function onYouTubeIframeAPIReady() {
  const ayarlar = { controls: 0, disablekb: 1, rel: 0, playsinline: 1 };
  if (location.protocol.startsWith("http")) ayarlar.origin = location.origin;
  oynatici = new YT.Player("ytOynatici", {
    width: "100%",
    height: "100%",
    playerVars: ayarlar,
    events: {
      onReady: () => {
        oynaticiHazir = true;
        oynatici.setVolume(Number($("sesAyari").value));
        senkronla();
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED && simdiki && simdiki.videoId === yuklenenId) {
          sonrakineGec(simdiki.videoId);
        }
      },
      onError: () => {
        if (!simdiki) return;
        bildir("Bu video sitede çalınamıyor, sıradakine geçiliyor");
        sonrakineGec(simdiki.videoId);
      }
    }
  });
}

setInterval(senkronla, 3000);

// ---------- Arayüz ----------

const SIMGE_OYNAT = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
const SIMGE_DURAKLAT = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';

function oynatSimgesi(caliyor) {
  const tus = $("oynatTus");
  const yeni = caliyor ? "duraklat" : "oynat";
  if (tus.dataset.simge === yeni) return;
  tus.dataset.simge = yeni;
  tus.innerHTML = caliyor ? SIMGE_DURAKLAT : SIMGE_OYNAT;
  tus.title = caliyor ? "Duraklat" : "Oynat";
}

function arayuzuGuncelle() {
  if (!$("oda") || $("oda").hidden) return;
  if (simdiki) {
    $("kapak").src = kapakAdresi(simdiki.videoId);
    $("sarkiAdi").textContent = simdiki.baslik || "Bilinmeyen şarkı";
    $("sarkiAlt").textContent = (simdiki.kanal ? simdiki.kanal + " · " : "") + "ekleyen: " + (simdiki.ekleyen || "?");
    oynatSimgesi(!simdiki.duraklatildi);
    $("simdikiListeye").hidden = false;
  } else {
    $("kapak").src = odaId === ANA_ODA ? "1.png" : BOS_KAPAK;
    $("sarkiAdi").textContent = "Asansör müziği";
    $("sarkiAlt").textContent = "Sırada şarkı yok — ☰ ile ekle";
    oynatSimgesi(katildi && !asansorSustur);
    $("gecenSure").textContent = "0:00";
    $("toplamSure").textContent = "0:00";
    ilerlemeyiCiz(0);
    $("simdikiListeye").hidden = true;
  }
  $("geriTus").disabled = !simdiki;
  $("atlaTus").disabled = !simdiki;
  $("geriTus").title = oncekiListesi.length ? "Önceki şarkı (çalan şarkı 3 sn'yi geçtiyse başa sarar)" : "Başa sar";
}

function sesiAyarla(ses) {
  $("sesAyari").value = ses;
  $("sesAyari").style.setProperty("--dolu", ses + "%");
  $("sesTus").textContent = ses === 0 ? "🔇" : ses < 50 ? "🔉" : "🔊";
  asansor.volume = ses / 100;
  if (oynaticiHazir) oynatici.setVolume(ses);
  hafizayaYaz("ses", ses);
}

function ilerlemeyiCiz(oran) {
  const yuzde = Math.max(0, Math.min(1, oran)) * 100 + "%";
  $("ilerlemeDolu").style.width = yuzde;
  $("ilerlemeTopu").style.left = yuzde;
}

function sarkiSuresi() {
  return simdiki && oynaticiHazir ? oynatici.getDuration() || 0 : 0;
}

setInterval(() => {
  if (!simdiki || !oynaticiHazir || ilerlemeSurukleniyor) return;
  const sure = sarkiSuresi();
  const gecen = Math.min(konumHesapla(simdiki), sure || Infinity);
  $("gecenSure").textContent = sureYaz(gecen);
  $("toplamSure").textContent = sureYaz(sure);
  ilerlemeyiCiz(sure ? gecen / sure : 0);
}, 250);

// İlerleme çubuğu: üzerinde gezerken baloncukta süreyi gösterir, tıklayınca ya da sürükleyince oraya sarar.
function ilerlemeOlaylariniBagla() {
  const cubuk = $("ilerleme");
  const balon = $("ilerlemeBalonu");
  const oranBul = (e) => {
    const kutu = cubuk.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - kutu.left) / kutu.width));
  };
  const balonuGoster = (oran) => {
    const sure = sarkiSuresi();
    if (!sure) { balon.hidden = true; return; }
    balon.hidden = false;
    balon.textContent = sureYaz(oran * sure);
    balon.style.left = (oran * 100) + "%";
  };
  cubuk.addEventListener("pointermove", (e) => {
    const oran = oranBul(e);
    balonuGoster(oran);
    if (ilerlemeSurukleniyor) {
      ilerlemeyiCiz(oran);
      $("gecenSure").textContent = sureYaz(oran * sarkiSuresi());
    }
  });
  cubuk.addEventListener("pointerleave", () => { if (!ilerlemeSurukleniyor) balon.hidden = true; });
  cubuk.addEventListener("pointerdown", (e) => {
    if (!simdiki || !sarkiSuresi()) return;
    ilerlemeSurukleniyor = true;
    cubuk.classList.add("surukleniyor");
    cubuk.setPointerCapture(e.pointerId);
    ilerlemeyiCiz(oranBul(e));
    balonuGoster(oranBul(e));
  });
  const birak = (e) => {
    if (!ilerlemeSurukleniyor) return;
    ilerlemeSurukleniyor = false;
    cubuk.classList.remove("surukleniyor");
    if (e.type === "pointerup") konumaGit(oranBul(e) * sarkiSuresi());
    if (!cubuk.matches(":hover")) balon.hidden = true;
  };
  cubuk.addEventListener("pointerup", birak);
  cubuk.addEventListener("pointercancel", birak);
}

// dugmeler: [{ yazi, baslik, is(olay) }]; tikla verilirse satırın kendisine tıklamak onu çalar.
function sarkiSatiri(sarki, altYazi, dugmeler, tikla) {
  const caliyor = simdiki && simdiki.videoId === sarki.videoId;
  const satir = el("div", { className: "sarki-satiri" + (tikla ? " tiklanir" : "") + (caliyor ? " caliyor" : "") },
    el("div", { className: "kapak-kutu" },
      el("img", { src: kapakAdresi(sarki.videoId), alt: "", loading: "lazy" }),
      tikla ? el("span", { className: "kapak-oynat" }, "▶") : null),
    el("div", { className: "sarki-bilgi" },
      el("div", { className: "sarki-adi", title: sarki.baslik }, sarki.baslik),
      el("div", { className: "sarki-alt" }, altYazi)),
    el("div", { className: "sarki-tuslari" }, dugmeler.map((d) => el("button", {
      type: "button", title: d.baslik, onclick: (e) => { e.stopPropagation(); d.is(e); }
    }, d.yazi)))
  );
  if (tikla) {
    satir.title = "Hemen çal";
    satir.tabIndex = 0;
    satir.addEventListener("click", tikla);
    satir.addEventListener("keydown", (e) => { if (e.key === "Enter") tikla(); });
  }
  return satir;
}

function listeDugmesi(sarki) {
  return { yazi: "☆", baslik: "Listeye ekle", is: (e) => listeyeEkleMenusu(sarki, e.currentTarget) };
}

function siraCiz() {
  const kutu = $("sira");
  if (!kutu) return;
  const sira = siraListesi();
  $("siraSayisi").textContent = sira.length || "";
  if (!sira.length) {
    kutu.replaceChildren(el("div", { className: "not" }, "Sıra boş. Ara sekmesinden ya da listelerinden şarkı ekle."));
    return;
  }
  kutu.replaceChildren(...sira.map((s, i) => sarkiSatiri(s, (i + 1) + ". · ekleyen: " + (s.ekleyen || "?"), [
    listeDugmesi(s),
    { yazi: "✕", baslik: "Sıradan çıkar", is: () => muzikRef.child("sira/" + s.anahtar).remove() }
  ], () => hemenCal(s, s.anahtar))));
}

function gecmisCiz() {
  const kutu = $("gecmis");
  if (!kutu) return;
  if (!gecmisListesi.length) {
    kutu.replaceChildren(el("div", { className: "not" }, "Bu odada henüz şarkı çalınmadı."));
    return;
  }
  kutu.replaceChildren(
    el("div", { className: "not" }, "Son " + gecmisListesi.length + " şarkı. Buradan eklemek arama hakkı harcamaz."),
    ...gecmisListesi.map((s) => sarkiSatiri(s, tarihYaz(s.zaman) + (s.ekleyen ? " · " + s.ekleyen : ""), [
      listeDugmesi(s),
      { yazi: "+", baslik: "Sıraya ekle", is: () => sarkilariEkle([s]) }
    ], () => hemenCal(Object.assign({}, s, { ekleyen: isim })))));
}

function sonuclariGoster(liste, ust) {
  $("sonuclar").replaceChildren(
    ...(ust ? [ust] : []),
    ...liste.map((s) => sarkiSatiri(s, s.kanal || "", [
      listeDugmesi(s),
      { yazi: "+", baslik: "Sıraya ekle", is: () => sarkilariEkle([s]) }
    ], () => hemenCal(s))));
}

function sekmeSec(ad) {
  $("panelSekmeleri").querySelectorAll("button").forEach((b) => b.classList.toggle("secili", b.dataset.sekme === ad));
  $("listePaneli").querySelectorAll(".sekme-icerik").forEach((k) => { k.hidden = k.dataset.sekme !== ad; });
}

// ---------- Arama ve link çözme ----------

function youtubeIdBul(metin) {
  const m = metin.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function youtubeListeIdBul(metin) {
  const m = metin.match(/[?&]list=([\w-]{10,64})/);
  return m ? m[1] : null;
}

async function youtubeLinkiniCoz(id) {
  const adres = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id);
  const yanit = await fetch(adres);
  if (!yanit.ok) throw new Error("Video bulunamadı ya da gizli");
  const veri = await yanit.json();
  return { videoId: id, baslik: veri.title, kanal: veri.author_name };
}

// Spotify sesi dışarı vermiyor; Discord botları gibi şarkının adını alıp YouTube'da arıyoruz.
// Spotify aracısı (spotify-araci/worker.js) tanımlıysa sanatçı adı da alınır ("Rust" yerine "Black Label Society - Rust").
async function spotifyAdiniBul(link) {
  if (AYARLAR.spotifyAraci) {
    try {
      const veri = await (await fetch(AYARLAR.spotifyAraci + "?link=" + encodeURIComponent(link))).json();
      const s = veri.sarkilar && veri.sarkilar[0];
      if (s) return (s.sanatci ? s.sanatci + " - " : "") + s.baslik;
    } catch (e) { }
  }
  const yanit = await fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(link));
  if (!yanit.ok) throw new Error("Spotify linki okunamadı");
  return (await yanit.json()).title;
}

async function youtubeIstegi(yol, parametreler) {
  if (!AYARLAR.youtubeApiKey) throw new Error("YouTube API anahtarı tanımlı değil.");
  const yanit = await fetch("https://www.googleapis.com/youtube/v3/" + yol + "?" +
    new URLSearchParams(Object.assign({ key: AYARLAR.youtubeApiKey }, parametreler)));
  const veri = await yanit.json();
  if (veri.error) {
    const neden = veri.error.errors && veri.error.errors[0] && veri.error.errors[0].reason;
    if (neden === "quotaExceeded") {
      throw new Error("Bugünkü YouTube arama hakkı doldu. Yarın yenilenir; o zamana kadar link yapıştırarak, geçmişten ya da listelerinden ekleyebilirsin.");
    }
    throw new Error("YouTube isteği başarısız: " + veri.error.message);
  }
  return veri;
}

// Aynı arama 7 gün içinde tekrar yapılırsa YouTube'a hiç gidilmez (kota harcanmaz).
async function youtubeAra(sorgu) {
  const anahtar = guvenliAnahtar(sorgu.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim()) || "_";
  try {
    const onbellek = (await db.ref("aramaOnbellek/" + anahtar).get()).val();
    if (onbellek && sunucuZamani() - onbellek.zaman < 7 * 864e5) {
      return { sonuclar: Object.values(onbellek.sonuclar || {}), onbellekten: true };
    }
  } catch (e) { }

  const veri = await youtubeIstegi("search", { part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "10", q: sorgu });
  const sonuclar = veri.items.map((v) => sarkiKaydi({
    videoId: v.id.videoId,
    baslik: htmlCoz(v.snippet.title),
    kanal: htmlCoz(v.snippet.channelTitle)
  }));
  if (kullanici) {
    db.ref("aramaOnbellek/" + anahtar).set({ zaman: firebase.database.ServerValue.TIMESTAMP, sonuclar }).catch(() => { });
  }
  return { sonuclar, onbellekten: false };
}

// YouTube oynatma listesini okur (her 50 şarkı için 1 birim kota; arama 100 birim).
async function youtubeListesiCek(listeId) {
  const bilgi = await youtubeIstegi("playlists", { part: "snippet", id: listeId });
  const ad = (bilgi.items && bilgi.items[0] && bilgi.items[0].snippet.title) || "YouTube listesi";
  const sarkilar = [];
  let sayfa = "";
  do {
    const veri = await youtubeIstegi("playlistItems", Object.assign({ part: "snippet", maxResults: "50", playlistId: listeId }, sayfa ? { pageToken: sayfa } : {}));
    for (const o of veri.items || []) {
      const id = o.snippet.resourceId && o.snippet.resourceId.videoId;
      if (!gecerliId(id) || o.snippet.title === "Deleted video" || o.snippet.title === "Private video") continue;
      sarkilar.push(sarkiKaydi({ videoId: id, baslik: o.snippet.title, kanal: o.snippet.videoOwnerChannelTitle || "" }));
    }
    sayfa = veri.nextPageToken || "";
  } while (sayfa && sarkilar.length < 200);
  if (!sarkilar.length) throw new Error("Listede çalınabilir şarkı bulunamadı");
  return { ad: ad.slice(0, 60), sarkilar };
}

async function aramaYap(metin) {
  const not = $("aramaNotu");
  not.textContent = "Aranıyor…";
  $("sonuclar").replaceChildren();
  try {
    const listeKimligi = youtubeListeIdBul(metin);
    const ytId = youtubeIdBul(metin);

    if (listeKimligi && (!ytId || /\/playlist\?/.test(metin))) {
      const { ad, sarkilar } = await youtubeListesiCek(listeKimligi);
      not.textContent = "YouTube listesi: “" + ad + "” (" + sarkilar.length + " şarkı)";
      sonuclariGoster(sarkilar, el("div", { className: "arac-satiri" },
        el("button", { className: "tus-kucuk", onclick: () => sarkilariEkle(sarkilar) }, "▶ Hepsini sıraya ekle"),
        el("button", { className: "tus-kucuk", onclick: () => kullanici ? yeniListe(ad, sarkilar) : bildir("Liste için önce Google ile giriş yap") }, "☆ Listelerime kaydet")));
      return;
    }

    if (ytId) {
      sarkilariEkle([await youtubeLinkiniCoz(ytId)]);
      not.textContent = "";
      $("aramaKutusu").value = "";
      return;
    }

    if (/spotify\.(com|link)\//.test(metin)) {
      if (!/open\.spotify\.com\/(intl-[\w-]+\/)?track\//.test(metin)) {
        throw new Error("Spotify'dan sadece tek şarkı linki açılabiliyor (liste ve albüm değil).");
      }
      const ad = await spotifyAdiniBul(metin);
      $("aramaKutusu").value = ad;
      const { sonuclar } = await youtubeAra(ad);
      not.textContent = "Spotify'daki “" + ad + "” için YouTube sonuçları. Doğru olanı ekle:";
      sonuclariGoster(sonuclar);
      return;
    }

    const { sonuclar, onbellekten } = await youtubeAra(metin);
    not.textContent = !sonuclar.length ? "Sonuç bulunamadı." : onbellekten ? "Kayıtlı sonuçlar (arama hakkı harcanmadı)" : "";
    sonuclariGoster(sonuclar);
  } catch (hata) {
    not.textContent = hata.message;
  }
}

// ---------- Kutlama ----------

function kutla() {
  asansorSustur = true;
  asansor.pause();
  basariSesi.currentTime = 0;
  basariSesi.play().catch(() => { });
  createFireworks();
  arayuzuGuncelle();
}

function createFireworks() {
  for (let i = 0; i < 20; i++) {
    const firework = el("div", { className: "firework", style: { top: Math.random() * 100 + "vh", left: Math.random() * 100 + "vw" } });
    $("oda").appendChild(firework);
    setTimeout(() => firework.remove(), 1000);
  }
}

// ---------- Olaylar ----------

function odaOlaylariniBagla() {
  $("katilTus").addEventListener("click", odayaKatil);
  $("isimKutusu").addEventListener("keydown", (e) => { if (e.key === "Enter") odayaKatil(); });

  $("aramaFormu").addEventListener("submit", (e) => {
    e.preventDefault();
    const metin = $("aramaKutusu").value.trim();
    if (metin) aramaYap(metin);
  });

  $("panelSekmeleri").addEventListener("click", (e) => {
    const tus = e.target.closest("button");
    if (tus) sekmeSec(tus.dataset.sekme);
  });

  $("listeTus").addEventListener("click", () => {
    $("duzenPaneli").classList.contains("acik") && duzenModunuKapat();
    $("listePaneli").classList.toggle("acik");
  });

  $("listeKapat").addEventListener("click", () => $("listePaneli").classList.remove("acik"));

  $("oynatTus").addEventListener("click", () => {
    if (simdiki) {
      if (simdiki.duraklatildi) devamEt();
      else duraklat();
    } else {
      asansorSustur = !asansorSustur;
      senkronla();
      arayuzuGuncelle();
    }
  });

  $("atlaTus").addEventListener("click", () => { if (simdiki) sonrakineGec(simdiki.videoId); });
  $("geriTus").addEventListener("click", geriGit);

  ilerlemeOlaylariniBagla();

  let sessizOncesi = 80;
  $("sesAyari").addEventListener("input", (e) => sesiAyarla(Number(e.target.value)));
  $("sesTus").addEventListener("click", () => {
    const ses = Number($("sesAyari").value);
    if (ses > 0) { sessizOncesi = ses; sesiAyarla(0); }
    else sesiAyarla(sessizOncesi || 80);
  });
  sesiAyarla(Number($("sesAyari").value));

  $("simdikiListeye").addEventListener("click", (e) => { if (simdiki) listeyeEkleMenusu(simdiki, e.currentTarget); });

  $("siraKaristir").addEventListener("click", siraKaristir);
  $("siraKaydet").addEventListener("click", () => topluListeyeKaydet(siraListesi(), (odaBilgi && odaBilgi.ad || "Oda") + " sırası"));
  $("siraTemizle").addEventListener("click", async () => {
    if (await onayla("Sırayı temizle", "Sıradaki tüm şarkılar silinecek (çalan şarkı devam eder).", "Temizle", true)) {
      muzikRef.child("sira").remove();
    }
  });

  $("gecmisKaydet").addEventListener("click", () => topluListeyeKaydet(gecmisListesi, (odaBilgi && odaBilgi.ad || "Oda") + " geçmişi"));
  $("gecmisIndir").addEventListener("click", () => {
    if (!gecmisListesi.length) return bildir("Geçmiş boş");
    dosyaIndir(slugYap((odaBilgi && odaBilgi.ad) || "oda") + "-gecmis.json", {
      tur: "bekleniyor-liste",
      surum: 1,
      ad: ((odaBilgi && odaBilgi.ad) || "Oda") + " geçmişi",
      sarkilar: gecmisListesi.map((s) => Object.assign(sarkiKaydi(s), { zaman: s.zaman, ekleyen: s.ekleyen || "" }))
    });
  });

  $("endButton").addEventListener("click", () => {
    if (simdiki && !simdiki.duraklatildi) duraklat();
    muzikRef.child("kutlama").set(firebase.database.ServerValue.TIMESTAMP);
  });

  $("davetTus").addEventListener("click", async () => {
    const link = location.origin + location.pathname + "?oda=" + odaId;
    try {
      await navigator.clipboard.writeText(link);
      bildir("Davet linki kopyalandı, arkadaşına yapıştır 🔗");
    } catch (e) {
      metinSor("Davet linki", "Bu linki kopyalayıp arkadaşına gönder:", link, 300);
    }
  });

  $("odaYonetimTus").addEventListener("click", yonetimiAc);
}
