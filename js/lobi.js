// Lobi: odaların listesi, oda oluşturma (hesap başına 2 oda) ve oda silme.

let tumOdalar = {};
let benimSlotlarim = {};

function lobiyiBaslat() {
  $("lobi").hidden = false;
  if (!db) {
    $("acikOdalar").replaceChildren(el("div", { className: "bos-kutu" }, "Bağlantı kurulamadı. Sayfayı yenilemeyi dene."));
    return;
  }
  db.ref("odalar").on("value", (s) => { tumOdalar = s.val() || {}; lobiyiCiz(); });
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

function odaKarti(id, oda) {
  const bilgi = oda.bilgi || {};
  const tasarim = tasarimiTamamla(oda.tasarim, id);
  const icerdekiler = katilanListesi(oda.katilanlar);
  const calan = oda.muzik && oda.muzik.simdiki;
  // İçeridekiler: ilk 5 kişinin fotoğrafı ve isimleri
  const isimler = icerdekiler.slice(0, 3).map((k) => k.ad).join(", ") + (icerdekiler.length > 3 ? " +" + (icerdekiler.length - 3) : "");
  // Mini oynatıcıda dinlenen oda: kartına basınca sayfa yenilenmeden odaya dönülür
  const dinlenen = typeof katildi !== "undefined" && katildi && id === odaId;
  const kart = el("a", {
    className: "oda-karti" + (dinlenen ? " dinlenen" : ""), href: "?oda=" + id,
    onclick: (e) => { if (dinlenen) { e.preventDefault(); odayaGeriDon(); } }
  },
    dinlenen ? el("div", { className: "kart-rozet" }, "🎧 Buradasın") : null,
    el("div", { className: "kart-emoji" }, tasarim.emojiSayisi ? tasarim.emoji : "🎧"),
    el("h3", {}, bilgi.ad || (id === ANA_ODA ? "Ana Oda ⭐" : id)),
    el("div", { className: "kart-alt" },
      (bilgi.sahipAdi ? bilgi.sahipAdi + " · " : "") + (icerdekiler.length ? icerdekiler.length + " kişi içeride" : "şu an boş")),
    // Kişilere basınca odaya girilmez, içeridekilerin listesi açılır
    icerdekiler.length ? el("div", {
      className: "kart-kisiler", title: "Kimler var?",
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); kisileriGoster(e.currentTarget, icerdekiler); }
    }, avatarYigini(icerdekiler, 5), el("span", {}, isimler)) : null,
    calan ? el("div", { className: "kart-calan" }, "♪ " + calan.baslik) : null);
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
    $("odaHakki").textContent = benim.length + " / " + ODA_HAKKI + " oda";
    const kartlar = hepsi.map((id) => odaKarti(id, tumOdalar[id]));
    if (yasakli) {
      kartlar.push(el("div", { className: "bos-kutu" }, "Hesabın oda açmaya kapatılmış."));
    } else if (benim.length < ODA_HAKKI || yonetici) {
      kartlar.push(el("button", { className: "oda-karti yeni", onclick: odaOlusturPenceresi },
        el("div", { className: "arti" }, "+"), el("div", {}, "Yeni oda oluştur")));
    }
    odalarim.replaceChildren(...kartlar);
  }

  // Açık odalar: ana oda her zaman en başta
  const acik = Object.keys(tumOdalar).filter((id) => id !== ANA_ODA && tumOdalar[id].bilgi && tumOdalar[id].bilgi.herkeseAcik !== false)
    .sort((a, b) => Object.keys(tumOdalar[b].katilanlar || {}).length - Object.keys(tumOdalar[a].katilanlar || {}).length
      || (tumOdalar[b].bilgi.olusturma || 0) - (tumOdalar[a].bilgi.olusturma || 0));
  $("acikOdalar").replaceChildren(
    odaKarti(ANA_ODA, tumOdalar[ANA_ODA] || {}),
    ...acik.map((id) => odaKarti(id, tumOdalar[id])));

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
