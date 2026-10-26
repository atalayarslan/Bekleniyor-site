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
  return el("div", { className: "liste-kapak" }, ilk ? kapakResmi(ilk) : (buyuk ? "🎵" : "♪"));
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
        ], () => hemenCal(s))))
        : el("p", { className: "not" }, "Liste boş. Arama sonuçlarında, sırada ya da geçmişte ☆ düğmesine basarak şarkı ekleyebilirsin.")
    );
    return;
  }

  const kayitlar = Object.entries(listeler).sort((a, b) => (b[1].olusturma || 0) - (a[1].olusturma || 0));
  kutu.replaceChildren(
    el("div", { className: "arac-satiri" },
      el("button", { className: "tus-kucuk", onclick: yeniListePenceresi }, "+ Yeni liste"),
      el("button", { className: "tus-kucuk", onclick: dosyadanListeYukle }, "⬆ Dosyadan yükle"),
      el("button", { className: "tus-kucuk", onclick: yerImiPenceresi }, "🔖 YouTube'dan birebir kopyala")),
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
    const kimlik = sarkiKimligi(s);
    if (!s.baslik || gorulen.has(kimlik)) continue;
    gorulen.add(kimlik);
    sarkiNesnesi[ref.child("sarkilar").push().key] = Object.assign(sarkiKaydi(s), { eklenme: Date.now() });
  }
  await ref.set({ ad: ad.slice(0, 60), olusturma: firebase.database.ServerValue.TIMESTAMP, sarkilar: sarkiNesnesi });
  bildir("“" + ad + "” listesi oluşturuldu (" + gorulen.size + " şarkı)");
  return ref.key;
}

async function listeyeSarkiEkle(listeId, sarki) {
  const liste = listeler[listeId];
  if (listeSarkilari(liste).some((s) => sarkiKimligi(s) === sarkiKimligi(sarki))) {
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
    const sarkilar = (Array.isArray(veri) ? veri : veri.sarkilar || []).filter((s) => s && s.baslik && (gecerliId(s.videoId) || s.arama));
    if (!sarkilar.length) throw new Error("Dosyada şarkı bulunamadı");
    await yeniListe(String(veri.ad || dosya.name.replace(/\.json$/i, "")).slice(0, 60), sarkilar);
  } catch (e) {
    bildir("Dosya okunamadı: " + e.message);
  }
}

// Yeni liste: ad ve isteğe bağlı bir YouTube ya da Spotify liste/albüm linki.
// Link verilirse içindeki bütün şarkılar listeye eklenir.
function yeniListePenceresi() {
  if (!kullanici) return bildir("Liste için önce Google ile giriş yap");
  const adKutusu = el("input", { className: "metin-kutusu", maxLength: 60, placeholder: "Liste adı (linkten de alınabilir)" });
  const linkKutusu = el("input", { className: "metin-kutusu", maxLength: 4000, placeholder: "YouTube ya da Spotify liste / albüm linki" });
  const durum = el("p", { className: "not" });
  let calisiyor = false;
  const olustur = async () => {
    if (calisiyor) return;
    const link = linkKutusu.value.trim();
    let ad = adKutusu.value.trim();
    if (!link) {
      if (!ad) return adKutusu.focus();
      pencereKapat();
      return yeniListe(ad, []);
    }
    calisiyor = true;
    durum.textContent = "Liste okunuyor…";
    try {
      let bilgi;
      const idler = youtubeIdListesiBul(link);
      const ytListe = youtubeListeIdBul(link);
      if (idler) bilgi = await youtubeVideolariCek(idler, kopyaListeAdi(link));
      else if (ytListe) bilgi = await youtubeListesiCek(ytListe);
      else if (/open\.spotify\.com\/(intl-[\w-]+\/)?(playlist|album|track)\//.test(link)) bilgi = await spotifyListesiCek(link);
      else throw new Error("Bu bir YouTube ya da Spotify liste linki değil.");
      pencereKapat();
      await yeniListe(ad || bilgi.ad, bilgi.sarkilar);
    } catch (e) {
      durum.textContent = e.message;
    } finally {
      calisiyor = false;
    }
  };
  [adKutusu, linkKutusu].forEach((k) => k.addEventListener("keydown", (e) => { if (e.key === "Enter") olustur(); }));
  pencereAc("Yeni liste", [
    el("label", { className: "alan" }, "Liste adı", adKutusu),
    el("label", { className: "alan" }, "Liste linki (isteğe bağlı)", linkKutusu),
    el("p", { className: "not" }, "Spotify listesindeki şarkılar ilk çalındıklarında YouTube'da bulunur. Spotify, aracı üzerinden listenin ilk 100 şarkısını verir."),
    el("button", { type: "button", className: "tus-kucuk", onclick: yerImiPenceresi }, "🔖 YouTube'daki listeyi birebir kopyala"),
    durum
  ], [
    { yazi: "Vazgeç", is: pencereKapat },
    { yazi: "Oluştur", ana: true, is: olustur }
  ]);
}

// ---------- YouTube'dan birebir kopya için yer imi düğmesi ----------

// Yer imi, YouTube'da açık olan Mix ya da oynatma listesindeki videoları ekrandaki sırasıyla toplar ve
// "watch_videos?video_ids=..." biçiminde bir link olarak panoya kopyalar. Site bu linki tanır.
const YER_IMI_KODU = "javascript:(()=>{const s=new Set();document.querySelectorAll('ytd-playlist-panel-video-renderer a#wc-endpoint,ytd-playlist-video-renderer a#video-title').forEach(a=>{try{const v=new URL(a.href).searchParams.get('v');if(v)s.add(v)}catch(e){}});const i=[...s];if(!i.length){alert('Bu sayfada liste bulunamadı. YouTube\\'da bir Mix ya da oynatma listesi açıkken dene.');return}const b=[...document.querySelectorAll('ytd-playlist-panel-renderer .title,ytd-playlist-header-renderer h1,yt-dynamic-sizing-formatted-string,h1')].map(e=>e.textContent.trim()).find(Boolean)||'YouTube listesi';const l='https://www.youtube.com/watch_videos?video_ids='+i.join(',')+'&ad='+encodeURIComponent(b.slice(0,60));const t=()=>alert(i.length+' şarkı kopyalandı! Bekleniyor sitesinde: Listelerim → + Yeni liste → Liste linki kutusuna yapıştır.');navigator.clipboard.writeText(l).then(t,()=>prompt('Bu linki kopyala:',l))})()";

function yerImiPenceresi() {
  const dugme = el("a", { href: YER_IMI_KODU, className: "yer-imi-dugmesi", title: "Bunu yer işaretleri çubuğuna sürükle" }, "📋 Bekleniyor'a kopyala");
  dugme.addEventListener("click", (e) => {
    e.preventDefault();
    bildir("Tıklama değil: düğmeyi yer işaretleri çubuğuna sürükle");
  });
  pencereAc("YouTube listesini birebir kopyala", [
    el("p", {}, "YouTube'da gördüğün listeyi (Mix dahil) aynı şarkılar ve aynı sırayla almak için bir kerelik kurulum:"),
    el("ol", { className: "adimlar" },
      el("li", {}, "Chrome'da yer işaretleri çubuğu görünmüyorsa ", el("b", {}, "Ctrl+Shift+B"), " ile aç."),
      el("li", {}, "Aşağıdaki yeşil düğmeyi fareyle tutup yer işaretleri çubuğuna ", el("b", {}, "sürükle"), "."),
      el("li", {}, "YouTube'da Mix'i ya da listeyi aç, sonra yer işaretleri çubuğundaki ", el("b", {}, "📋 Bekleniyor'a kopyala"), "'ya tıkla."),
      el("li", {}, "Sitede ", el("b", {}, "Listelerim → + Yeni liste"), " → ", el("b", {}, "Liste linki"), " kutusuna yapıştır (Ctrl+V) ve Oluştur'a bas.")),
    el("div", { className: "yer-imi-kutusu" }, dugme),
    el("p", { className: "not" }, "Mix'lerde YouTube ekranda yaklaşık 25-50 şarkı gösterir; düğme ekranda yüklü olan şarkıların hepsini alır.")
  ], [
    { yazi: "Tamam", ana: true, is: pencereKapat }
  ]);
}
