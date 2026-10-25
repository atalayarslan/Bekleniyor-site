// Kişisel şarkı listeleri: oluşturma, düzenleme, sıraya ekleme, dosyaya indirme/yükleme.
// Listeler Google hesabına bağlı olarak Firebase'de tutulur; listeden şarkı eklemek arama kotası harcamaz.

let listeler = {};
let acikListe = null;
let listelerRef = null;

function listeleriBaslat() {
  if (listelerRef) listelerRef.off();
  listelerRef = null;
  listeler = {};
  acikListe = null;
  if (kullanici && db) {
    listelerRef = db.ref("kullanicilar/" + kullanici.uid + "/listeler");
    listelerRef.on("value", (s) => { listeler = s.val() || {}; listelerCiz(); });
  }
  listelerCiz();
}

function listeSarkilari(liste) {
  const sarkilar = (liste && liste.sarkilar) || {};
  return Object.keys(sarkilar).sort().map((k) => Object.assign({ anahtar: k }, sarkilar[k]));
}

function listeKapagi(liste, buyuk) {
  const ilk = listeSarkilari(liste)[0];
  return el("div", { className: "liste-kapak" }, ilk ? el("img", { src: kapakAdresi(ilk.videoId), alt: "" }) : (buyuk ? "🎵" : "♪"));
}

function listelerCiz() {
  const kutu = $("listelerIcerik");
  if (!kutu) return;

  if (!kullanici) {
    kutu.replaceChildren(
      el("p", { className: "not" }, "Kendi şarkı listelerini oluşturmak ve saklamak için Google ile giriş yap. Listeden şarkı eklemek arama hakkı harcamaz."),
      googleTusu()
    );
    return;
  }

  if (acikListe && listeler[acikListe]) {
    const liste = listeler[acikListe];
    const sarkilar = listeSarkilari(liste);
    kutu.replaceChildren(
      el("button", { className: "tus-kucuk", onclick: () => { acikListe = null; listelerCiz(); } }, "← Listelerim"),
      el("div", { className: "liste-basligi" },
        listeKapagi(liste, true),
        el("div", {},
          el("h3", {}, liste.ad),
          el("div", { className: "not" }, sarkilar.length + " şarkı"))),
      el("div", { className: "arac-satiri" },
        el("button", { className: "tus-kucuk", disabled: !sarkilar.length, onclick: () => sarkilariEkle(sarkilar) }, "▶ Hepsini sıraya ekle"),
        el("button", { className: "tus-kucuk", disabled: !sarkilar.length, onclick: () => sarkilariEkle(karistir(sarkilar)) }, "🔀 Karıştırıp ekle"),
        el("button", { className: "tus-kucuk", onclick: () => listeyiYenidenAdlandir(acikListe) }, "✏️ Ad"),
        el("button", { className: "tus-kucuk", onclick: () => listeyiIndir(liste) }, "⬇ İndir"),
        el("button", { className: "tus-kucuk", onclick: () => listeyiSil(acikListe) }, "🗑️ Sil")),
      sarkilar.length
        ? el("div", {}, sarkilar.map((s) => sarkiSatiri(s, s.kanal || "", [
          { yazi: "+", baslik: "Sıraya ekle", is: () => sarkilariEkle([s]) },
          { yazi: "✕", baslik: "Listeden çıkar", is: () => listelerRef.child(acikListe + "/sarkilar/" + s.anahtar).remove() }
        ])))
        : el("p", { className: "not" }, "Liste boş. Arama sonuçlarında, sırada ya da geçmişte ☆ düğmesine basarak şarkı ekleyebilirsin.")
    );
    return;
  }

  const kayitlar = Object.entries(listeler).sort((a, b) => (b[1].olusturma || 0) - (a[1].olusturma || 0));
  kutu.replaceChildren(
    el("div", { className: "arac-satiri" },
      el("button", { className: "tus-kucuk", onclick: async () => { const ad = await metinSor("Yeni liste", null, "", 60); if (ad) yeniListe(ad, []); } }, "+ Yeni liste"),
      el("button", { className: "tus-kucuk", onclick: dosyadanListeYukle }, "⬆ Dosyadan yükle"),
      el("button", { className: "tus-kucuk", onclick: youtubeListesiniAktar }, "▶ YouTube listesi aktar")),
    kayitlar.length
      ? el("div", {}, kayitlar.map(([id, liste]) => el("button", {
        className: "liste-karti", onclick: () => { acikListe = id; listelerCiz(); }
      }, listeKapagi(liste), el("div", { className: "sarki-bilgi" },
        el("div", { className: "sarki-adi" }, liste.ad),
        el("div", { className: "sarki-alt" }, listeSarkilari(liste).length + " şarkı")))))
      : el("p", { className: "not" }, "Henüz listen yok. Yeni bir liste oluştur ya da daha önce indirdiğin bir liste dosyasını yükle.")
  );
}

function karistir(dizi) {
  const kopya = dizi.slice();
  for (let i = kopya.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopya[i], kopya[j]] = [kopya[j], kopya[i]];
  }
  return kopya;
}

async function yeniListe(ad, sarkilar) {
  if (!kullanici) { bildir("Liste için önce Google ile giriş yap"); return null; }
  const ref = listelerRef.push();
  const sarkiNesnesi = {};
  const gorulen = new Set();
  for (const s of sarkilar) {
    if (!gecerliId(s.videoId) || gorulen.has(s.videoId)) continue;
    gorulen.add(s.videoId);
    sarkiNesnesi[ref.child("sarkilar").push().key] = Object.assign(sarkiKaydi(s), { eklenme: Date.now() });
  }
  await ref.set({ ad: ad.slice(0, 60), olusturma: firebase.database.ServerValue.TIMESTAMP, sarkilar: sarkiNesnesi });
  bildir("“" + ad + "” listesi oluşturuldu (" + gorulen.size + " şarkı)");
  return ref.key;
}

async function listeyeSarkiEkle(listeId, sarki) {
  const liste = listeler[listeId];
  if (listeSarkilari(liste).some((s) => s.videoId === sarki.videoId)) {
    bildir("Bu şarkı zaten “" + liste.ad + "” listesinde");
    return;
  }
  await listelerRef.child(listeId + "/sarkilar").push(Object.assign(sarkiKaydi(sarki), { eklenme: Date.now() }));
  bildir("“" + liste.ad + "” listesine eklendi");
}

// ☆ düğmesine basınca açılan "hangi listeye?" menüsü
function listeyeEkleMenusu(sarki, hedef) {
  if (!kullanici) {
    menuAc(hedef, [{ baslik: "Listeler için giriş gerekli" }, { yazi: "Google ile giriş yap", is: googleIleGiris }]);
    return;
  }
  menuAc(hedef, [
    { baslik: "Listeye ekle" },
    ...Object.entries(listeler).map(([id, l]) => ({ yazi: l.ad, is: () => listeyeSarkiEkle(id, sarki) })),
    { yazi: "+ Yeni liste oluştur", is: async () => { const ad = await metinSor("Yeni liste", null, "", 60); if (ad) yeniListe(ad, [sarki]); } }
  ]);
}

// Birden fazla şarkıyı (sıra, geçmiş) yeni bir listeye kaydetme
async function topluListeyeKaydet(sarkilar, onerilenAd) {
  if (!kullanici) { bildir("Liste için önce Google ile giriş yap"); return; }
  if (!sarkilar.length) { bildir("Kaydedilecek şarkı yok"); return; }
  const ad = await metinSor("Listeye kaydet", sarkilar.length + " şarkı yeni bir listeye kaydedilecek.", onerilenAd, 60);
  if (ad) yeniListe(ad, sarkilar);
}

async function listeyiYenidenAdlandir(id) {
  const ad = await metinSor("Listenin adı", null, listeler[id].ad, 60);
  if (ad) listelerRef.child(id + "/ad").set(ad);
}

async function listeyiSil(id) {
  if (await onayla("Listeyi sil", "“" + listeler[id].ad + "” listesi silinecek.", "Sil", true)) {
    acikListe = null;
    await listelerRef.child(id).remove();
    bildir("Liste silindi");
  }
}

function listeyiIndir(liste) {
  dosyaIndir(slugYap(liste.ad) + ".json", {
    tur: "bekleniyor-liste",
    surum: 1,
    ad: liste.ad,
    sarkilar: listeSarkilari(liste).map(sarkiKaydi)
  });
}

async function dosyadanListeYukle() {
  if (!kullanici) return bildir("Liste için önce Google ile giriş yap");
  const dosya = await dosyaSec(".json,application/json");
  if (!dosya) return;
  try {
    const veri = JSON.parse(await dosya.text());
    const sarkilar = (Array.isArray(veri) ? veri : veri.sarkilar || []).filter((s) => s && gecerliId(s.videoId));
    if (!sarkilar.length) throw new Error("Dosyada şarkı bulunamadı");
    await yeniListe(String(veri.ad || dosya.name.replace(/\.json$/i, "")).slice(0, 60), sarkilar);
  } catch (e) {
    bildir("Dosya okunamadı: " + e.message);
  }
}

async function youtubeListesiniAktar() {
  if (!kullanici) return bildir("Liste için önce Google ile giriş yap");
  const link = await metinSor("YouTube listesi aktar", "YouTube'daki bir oynatma listesinin linkini yapıştır. Liste bir kez okunur, sonra arama hakkı harcamadan kullanılır.", "", 300);
  if (!link) return;
  const kimlik = youtubeListeIdBul(link);
  if (!kimlik) return bildir("Bu bir YouTube oynatma listesi linki değil");
  try {
    bildir("Liste okunuyor…");
    const { ad, sarkilar } = await youtubeListesiCek(kimlik);
    await yeniListe(ad, sarkilar);
  } catch (e) {
    bildir(e.message);
  }
}
