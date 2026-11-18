// Lobi: odaların listesi, oda oluşturma (hesap başına 2 oda) ve oda silme.

let tumOdalar = {};
let benimSlotlarim = {};
let odaOyunlari = {};

// Odadaki masaların rozetleri: son 10 dakikada güncellenmiş ve en az bir kişinin oturduğu masalar
const OYUN_ADLARI = { okey: ["🀄", "Okey"], bilardo: ["🎱", "Bilardo"] };
function oyunRozetleri(id) {
  const masalar = odaOyunlari[id] || {};
  return Object.entries(OYUN_ADLARI).map(([oyun, [simge, ad]]) => {
    const m = masalar[oyun];
    if (!m || !(m.oturan > 0) || sunucuZamani() - (m.zaman || 0) > 10 * 60 * 1000) return null;
    return el("span", { className: "kart-rozet oyun" + (m.oyunVar ? " oynaniyor" : ""), title: m.oyunVar ? ad + " oynanıyor" : ad + " masasında bekleyen var" },
      simge + " " + ad + " " + m.oturan + "/4" + (m.oyunVar ? "" : " · bekliyor"));
  }).filter(Boolean);
}

function lobiyiBaslat() {
  $("lobi").hidden = false;
  if (!db) {
    $("acikOdalar").replaceChildren(el("div", { className: "bos-kutu" }, "Bağlantı kurulamadı. Sayfayı yenilemeyi dene."));
    return;
  }
  db.ref("odalar").on("value", (s) => { tumOdalar = s.val() || {}; lobiyiCiz(); });
  // Odalardaki masaların kısa özeti (oyun rozeti için; oyun açık olan tarayıcılar yazar)
  db.ref("odaOyunlari").on("value", (s) => { odaOyunlari = s.val() || {}; lobiyiCiz(); }, () => { });
  let slotRef = null;
  const oturumaGore = () => {
    if (slotRef) slotRef.off();
    slotRef = null;
    benimSlotlarim = {};
    if (kullanici) {
      slotRef = db.ref("kullanicilar/" + kullanici.uid);
      slotRef.on("value", (s) => {
        const v = s.val() || {};
        benimSlotlarim = { slot1: v.slot1 || null, slot2: v.slot2 || null };
        lobiyiCiz();
      });
    }
    lobiyiCiz();
  };
  oturumDegisince(oturumaGore);
  // Lobi odadan sonra açıldıysa (mini oynatıcı) oturum zaten bellidir
  if (kullanici) oturumaGore();
  $("lobiYonetimTus").addEventListener("click", yonetimiAc);
  lobiyiCiz();
}

// Odanın kartı: üstte odanın kendi arka planı (resim; video ise karta gelince oynar), adı ve canlılık rozeti;
// altta çalan şarkı (kapağıyla, çalıyorsa ses çubukları oynar) ve içeridekiler.
function odaKarti(id, oda) {
  const bilgi = oda.bilgi || {};
  const tasarim = tasarimiTamamla(oda.tasarim, id);
  const icerdekiler = katilanListesi(oda.katilanlar);
  const calan = oda.muzik && oda.muzik.simdiki;
  const caliyor = !!(calan && !calan.duraklatildi && icerdekiler.length);
  const isimler = icerdekiler.slice(0, 3).map((k) => k.ad).join(", ") + (icerdekiler.length > 3 ? " +" + (icerdekiler.length - 3) : "");
  // Mini oynatıcıda dinlenen oda: kartına basınca sayfa yenilenmeden odaya dönülür
  const dinlenen = typeof katildi !== "undefined" && katildi && id === odaId;
  const gorsel = el("div", { className: "kart-gorsel" },
    el("div", { className: "kart-rozetler" },
      dinlenen ? el("span", { className: "kart-rozet burada" }, "Buradasın") : null,
      // Boş oda için rozet yok (ekran "boş" yazılarıyla dolmasın); dolu oda canlı sayıyla öne çıkar
      icerdekiler.length ? el("span", { className: "kart-rozet canli" }, icerdekiler.length + " kişi içeride") : null,
      ...oyunRozetleri(id)),
    el("div", { className: "kart-emoji" }, tasarim.emojiSayisi ? tasarim.emoji : "🎧"),
    el("div", { className: "kart-baslik" },
      el("h3", {}, bilgi.ad || (id === ANA_ODA ? "Ana Oda ⭐" : id)),
      bilgi.sahipAdi ? el("div", { className: "kart-sahip" }, bilgi.sahipAdi) : null));
  kartGorseliniYukle(id, gorsel);
  const sanatci = calan ? sanatciBul(calan) : "";
  const kart = el("a", {
    className: "oda-karti" + (dinlenen ? " dinlenen" : "") + (caliyor ? " caliyor" : ""), href: "?oda=" + id,
    onclick: (e) => { if (dinlenen) { e.preventDefault(); odayaGeriDon(); } },
    onmouseenter: () => { const v = gorsel.querySelector("video"); if (v) v.play().catch(() => { }); },
    onmouseleave: () => { const v = gorsel.querySelector("video"); if (v) v.pause(); }
  },
    gorsel,
    el("div", { className: "kart-govde" },
      calan ? el("div", { className: "kart-calan" },
        kapakResmi(calan, { className: "kart-kapak" }),
        el("div", { className: "kart-sarki" }, el("b", {}, calan.baslik), el("small", {}, sanatci || (caliyor ? "Çalıyor" : "Duraklatıldı"))),
        caliyor ? el("span", { className: "kart-dalga", "aria-hidden": "true" }, el("i"), el("i"), el("i"), el("i")) : null)
        : null,
      // Kişilere basınca odaya girilmez, içeridekilerin listesi açılır
      icerdekiler.length ? el("div", {
        className: "kart-kisiler", title: "Kimler var?",
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); kisileriGoster(e.currentTarget, icerdekiler, id); }
      }, avatarYigini(icerdekiler, 5), el("span", {}, isimler)) : null));
  kart.style.setProperty("--k1", tasarim.arka2 === tasarim.arka1 ? tasarim.daire1 : tasarim.arka1);
  kart.style.setProperty("--k2", tasarim.arka2 === tasarim.arka1 ? tasarim.daire2 : tasarim.arka2);
  kart.style.setProperty("--kv", /^#[0-9a-f]{6}$/i.test(tasarim.vurgu || "") ? tasarim.vurgu : "#1db954");
  return kart;
}

// Kartın arka planı: odanın arka plan resmi/videosu, yoksa ilk fotoğrafı. Her oda için bir kez okunur.
const kartGorselleri = new Map();
function kartGorseliniYukle(id, kutu) {
  if (!db) return;
  if (!kartGorselleri.has(id)) {
    kartGorselleri.set(id, (async () => {
      const fotolar = (await db.ref("odaFotolari/" + id).get()).val() || (id === ANA_ODA ? Object.assign({}, ANA_ODA_FOTOLARI) : {});
      return fotolar.arka || fotolar.f0 || null;
    })().catch(() => null));
  }
  kartGorselleri.get(id).then((kaynak) => {
    if (!kaynak) return;
    const medya = videoMu(kaynak)
      ? el("video", { src: kaynak, muted: true, loop: true, playsInline: true, preload: "metadata" })
      : el("img", { src: kaynak, alt: "", loading: "lazy" });
    medya.className = "kart-medya";
    kutu.prepend(medya);
    kutu.classList.add("resimli");
  });
}

// Gizli oda (lobide listelenmesin denmiş) içinde biri varken kilitli kart olarak görünür: adı, görüntüsü ve
// kaç kişi olduğu belli olur ama kart bir bağlantı değildir; girmek için oda sahibinin paylaştığı link gerekir.
function kilitliOdaKarti(id, oda) {
  const bilgi = oda.bilgi || {};
  const tasarim = tasarimiTamamla(oda.tasarim, id);
  const sayi = katilanListesi(oda.katilanlar).length;
  const gorsel = el("div", { className: "kart-gorsel" },
    el("div", { className: "kart-rozetler" },
      el("span", { className: "kart-rozet canli" }, sayi + " kişi içeride")),
    el("div", { className: "kart-emoji", "aria-hidden": "true" }, "🔒"),
    el("div", { className: "kart-baslik" },
      el("h3", {}, bilgi.ad || id),
      bilgi.sahipAdi ? el("div", { className: "kart-sahip" }, bilgi.sahipAdi) : null));
  kartGorseliniYukle(id, gorsel);
  const aciklama = "Gizli oda. Girmek için " + (bilgi.sahipAdi || "oda sahibi") + " sana davet linkini göndermeli.";
  const kart = el("button", {
    type: "button", className: "oda-karti kilitli", title: aciklama,
    onclick: () => bildir("🔒 " + aciklama)
  }, gorsel, el("div", { className: "kart-govde" }, el("div", { className: "kart-kilit" }, "🔒 Davetle girilir")));
  kart.style.setProperty("--k1", tasarim.arka2 === tasarim.arka1 ? tasarim.daire1 : tasarim.arka1);
  kart.style.setProperty("--k2", tasarim.arka2 === tasarim.arka1 ? tasarim.daire2 : tasarim.arka2);
  return kart;
}

function benimOdalarim() {
  return Object.values(benimSlotlarim).filter((id) => id && tumOdalar[id] && tumOdalar[id].bilgi);
}

function lobiyiCiz() {
  // Odalarım
  const odalarim = $("odalarim");
  if (!kullanici) {
    $("odaHakki").textContent = "";
    odalarim.replaceChildren(el("div", { className: "bos-kutu" },
      el("p", {}, "Kendi odanı açıp tasarlamak için Google ile giriş yap. Her hesap en fazla " + ODA_HAKKI + " oda açabilir."),
      googleTusu()));
  } else {
    const benim = benimOdalarim();
    const yoneticiOdalari = yonetici ? Object.keys(tumOdalar).filter((id) =>
      tumOdalar[id].bilgi && tumOdalar[id].bilgi.sahip === kullanici.uid && !benim.includes(id)) : [];
    const hepsi = [...yoneticiOdalari, ...benim];
    // Yöneticinin oda sınırı yok; ona kendi odalarının sayısı gösterilir. Hiç odası yokken sayı gösterilmez.
    $("odaHakki").textContent = !hepsi.length ? "" : yonetici ? hepsi.length + " oda" : benim.length + " / " + ODA_HAKKI + " oda";
    // Yeni oda: büyük boş kart yerine başlığın yanında küçük bir düğme
    const acabilir = !yasakli && (benim.length < ODA_HAKKI || yonetici);
    const yeniTus = $("yeniOdaTus");
    yeniTus.hidden = !acabilir;
    yeniTus.onclick = odaOlusturPenceresi;
    const kartlar = hepsi.map((id) => odaKarti(id, tumOdalar[id]));
    if (yasakli) kartlar.push(el("div", { className: "bos-kutu" }, "Hesabın oda açmaya kapatılmış."));
    else if (!hepsi.length) kartlar.push(el("p", { className: "lobi-not" }, "Henüz odan yok. Kendi odanı açıp süsleyebilir, linkini arkadaşlarına gönderebilirsin."));
    odalarim.replaceChildren(...kartlar);
  }

  // Odalar: içinde insan olan odalar başta (kalabalıktan aza), sonra ana oda, sonra diğer açık odalar.
  // Gizli odalar yalnızca içinde biri varken kilitli kart olarak görünür. "Odalarım"dakiler burada tekrar edilmez.
  const benimkiler = new Set(kullanici ? [...benimOdalarim(), ...Object.keys(tumOdalar).filter((id) =>
    yonetici && tumOdalar[id].bilgi && tumOdalar[id].bilgi.sahip === kullanici.uid)] : []);
  const kisi = (id) => katilanListesi((tumOdalar[id] || {}).katilanlar).length;
  const dinlenenOda = typeof katildi !== "undefined" && katildi ? odaId : null;
  const listede = Object.keys(tumOdalar).filter((id) => !benimkiler.has(id) && tumOdalar[id].bilgi &&
    (id === ANA_ODA || tumOdalar[id].bilgi.herkeseAcik !== false || kisi(id) > 0 || id === dinlenenOda));
  if (!benimkiler.has(ANA_ODA) && !listede.includes(ANA_ODA)) listede.push(ANA_ODA);
  listede.sort((a, b) => kisi(b) - kisi(a) || (b === ANA_ODA) - (a === ANA_ODA)
    || ((tumOdalar[b] || {}).bilgi || {}).olusturma - ((tumOdalar[a] || {}).bilgi || {}).olusturma || 0);
  const acikKartlar = listede.map((id) => {
    const oda = tumOdalar[id] || {};
    const gizli = id !== ANA_ODA && oda.bilgi && oda.bilgi.herkeseAcik === false && id !== dinlenenOda;
    return gizli ? kilitliOdaKarti(id, oda) : odaKarti(id, oda);
  });
  $("acikOdalar").replaceChildren(...acikKartlar);

  // Karşılamadaki canlı sayı: şu an kaç kişi kaç odada
  const kisiSayisi = Object.values(tumOdalar).reduce((t, o) => t + katilanListesi(o.katilanlar).length, 0);
  const doluOda = Object.values(tumOdalar).filter((o) => katilanListesi(o.katilanlar).length).length;
  const canli = $("lobiCanli");
  // Kimse yokken tek bir davet: üç ayrı "boş" yazısı yerine
  if (canli) canli.textContent = kisiSayisi ? "Şu an " + kisiSayisi + " kişi, " + doluOda + " odada dinliyor" : "Şu an kimse yok · bir odaya gir, müziği sen başlat";
  if (canli) canli.classList.toggle("canli", kisiSayisi > 0);

  $("lobiYonetimTus").hidden = !yonetici;
}

function odaOlusturPenceresi() {
  let secilenTema = "gece";
  const adKutusu = el("input", { className: "metin-kutusu", maxLength: 40, placeholder: "ör. Ahmet'i bekleme salonu" });
  const acikKutusu = el("input", { type: "checkbox", checked: true });
  const seridi = el("div", { className: "tema-seridi" });
  const temalariCiz = () => {
    seridi.replaceChildren(...Object.entries(TEMALAR).map(([id, tema]) => {
      const kart = el("button", {
        type: "button",
        className: "tema-karti" + (id === secilenTema ? " secili" : ""),
        onclick: () => { secilenTema = id; temalariCiz(); }
      }, el("span", {}, tema.simge), tema.ad);
      kart.style.setProperty("--k1", tema.tasarim.arka1);
      kart.style.setProperty("--k2", tema.tasarim.arka2);
      return kart;
    }));
  };
  temalariCiz();
  pencereAc("Yeni oda", [
    el("label", { className: "alan" }, "Oda adı", adKutusu),
    el("div", { className: "alan" }, "Başlangıç teması (sonra düzen modunda değiştirebilirsin)", seridi),
    el("label", { className: "anahtar" }, acikKutusu, "Lobideki “Açık odalar”da görünsün")
  ], [
    { yazi: "Vazgeç", is: pencereKapat },
    {
      yazi: "Oluştur", ana: true, is: () => {
        const ad = adKutusu.value.trim();
        if (!ad) { adKutusu.focus(); return; }
        pencereKapat();
        odaOlustur(ad, acikKutusu.checked, secilenTema);
      }
    }
  ]);
}

async function odaOlustur(ad, herkeseAcik, temaId) {
  if (!kullanici) return bildir("Önce Google ile giriş yap");
  try {
    // Boş ya da odası silinmiş bir hak bul
    const kayit = (await db.ref("kullanicilar/" + kullanici.uid).get()).val() || {};
    let bosSlot = null;
    for (const slot of ["slot1", "slot2"]) {
      const id = kayit[slot];
      if (!id || !(await db.ref("odalar/" + id + "/bilgi").get()).exists()) { bosSlot = slot; break; }
    }
    if (!bosSlot && !yonetici) return bildir("En fazla " + ODA_HAKKI + " oda açabilirsin. Yeni oda için birini sil.");

    const id = slugYap(ad) + "-" + rastgeleKimlik(4);
    const guncellemeler = {
      ["odalar/" + id + "/bilgi"]: {
        ad: ad.slice(0, 40),
        sahip: kullanici.uid,
        sahipAdi: (kisaAd() || "Biri").slice(0, 40),
        olusturma: firebase.database.ServerValue.TIMESTAMP,
        herkeseAcik
      },
      ["odalar/" + id + "/tasarim"]: temaTasarimi(temaId, "Bekleniyor")
    };
    if (bosSlot) guncellemeler["kullanicilar/" + kullanici.uid + "/" + bosSlot] = id;
    await db.ref().update(guncellemeler);
    location.href = "?oda=" + id;
  } catch (e) {
    bildir("Oda oluşturulamadı: " + (e.code === "PERMISSION_DENIED" ? "izin yok (oda hakkın dolmuş olabilir)" : e.message));
  }
}

async function odaSil(id, bilgi) {
  try {
    const guncellemeler = {
      ["odalar/" + id]: null,
      ["odaFotolari/" + id]: null,
      ["odaOyunlari/" + id]: null,
      ["odaGecmisi/" + id]: null
    };
    const sahip = bilgi && bilgi.sahip;
    if (sahip && (kullanici && sahip === kullanici.uid || yonetici)) {
      const kayit = (await db.ref("kullanicilar/" + sahip).get()).val() || {};
      for (const slot of ["slot1", "slot2"]) if (kayit[slot] === id) guncellemeler["kullanicilar/" + sahip + "/" + slot] = null;
    }
    await db.ref().update(guncellemeler);
    bildir("Oda silindi");
    if (new URLSearchParams(location.search).get("oda") === id) location.href = "./";
  } catch (e) {
    bildir("Silinemedi: " + (e.code === "PERMISSION_DENIED" ? "izin yok" : e.message));
  }
}

// Yönetici ilk girişte ana odayı kendi adına oluşturur; ilk tasarımı eski sayfanın görünümüdür.
async function anaOdayiHazirla() {
  try {
    if ((await db.ref("odalar/" + ANA_ODA + "/bilgi").get()).exists()) return;
    const guncellemeler = {
      ["odalar/" + ANA_ODA + "/bilgi"]: {
        ad: "Ana Oda ⭐",
        sahip: kullanici.uid,
        sahipAdi: (kisaAd() || "Kurucu").slice(0, 40),
        olusturma: firebase.database.ServerValue.TIMESTAMP,
        herkeseAcik: true
      }
    };
    if (!(await db.ref("odalar/" + ANA_ODA + "/tasarim").get()).exists()) {
      guncellemeler["odalar/" + ANA_ODA + "/tasarim"] = temaTasarimi("klasik", "Bekleniyor");
    }
    if (!(await db.ref("odaFotolari/" + ANA_ODA).get()).exists()) {
      for (const [anahtar, dosya] of Object.entries(ANA_ODA_FOTOLARI)) {
        guncellemeler["odaFotolari/" + ANA_ODA + "/" + anahtar] = await resmiKucult(dosya, 720, 230000);
      }
    }
    await db.ref().update(guncellemeler);
  } catch (e) {
    console.warn("Ana oda hazırlanamadı:", e);
  }
}
