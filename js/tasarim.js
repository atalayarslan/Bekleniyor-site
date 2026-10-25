// Oda tasarımı: hazır temalar, tasarımı sayfaya uygulama ve düzen modu paneli.

const TEMALAR = {
  klasik: {
    ad: "Klasik", simge: "💗",
    tasarim: { arka1: "#000000", arka2: "#000000", vurgu: "#ff4d88", daire1: "#ff4d88", daire2: "#e74c3c", daireGoster: true, yaziTipi: "sistem", emoji: "❤️", emojiSayisi: 7, fotoHareket: true }
  },
  gece: {
    ad: "Gece", simge: "🌙",
    tasarim: { arka1: "#0b1026", arka2: "#2b1055", vurgu: "#8ab4ff", daire1: "#3a4a8c", daire2: "#141b3d", daireGoster: true, yaziTipi: "yuvarlak", emoji: "⭐", emojiSayisi: 14, fotoHareket: false }
  },
  parti: {
    ad: "Parti", simge: "🎉",
    tasarim: { arka1: "#3a0ca3", arka2: "#f72585", vurgu: "#ffd60a", daire1: "#ffd60a", daire2: "#7209b7", daireGoster: true, yaziTipi: "yuvarlak", emoji: "🎈", emojiSayisi: 12, fotoHareket: true }
  },
  romantik: {
    ad: "Romantik", simge: "💕",
    tasarim: { arka1: "#2d0a1f", arka2: "#8c1c4a", vurgu: "#ff8fab", daire1: "#ff8fab", daire2: "#c9184a", daireGoster: true, yaziTipi: "el", emoji: "💕", emojiSayisi: 10, fotoHareket: false }
  },
  kis: {
    ad: "Kış", simge: "❄️",
    tasarim: { arka1: "#0f2a44", arka2: "#5b8db8", vurgu: "#e0f2ff", daire1: "#cfe8ff", daire2: "#4a7fb0", daireGoster: true, yaziTipi: "yuvarlak", emoji: "❄️", emojiSayisi: 20, fotoHareket: false }
  },
  retro: {
    ad: "Retro", simge: "👾",
    tasarim: { arka1: "#1a1a2e", arka2: "#16213e", vurgu: "#f9a826", daire1: "#e94560", daire2: "#0f3460", daireGoster: true, yaziTipi: "retro", emoji: "👾", emojiSayisi: 8, fotoHareket: true }
  },
  orman: {
    ad: "Orman", simge: "🌿",
    tasarim: { arka1: "#0b2416", arka2: "#2d6a4f", vurgu: "#b7e4c7", daire1: "#52b788", daire2: "#1b4332", daireGoster: true, yaziTipi: "el", emoji: "🍃", emojiSayisi: 12, fotoHareket: false }
  },
  sade: {
    ad: "Sade", simge: "◻️",
    tasarim: { arka1: "#121212", arka2: "#1f1f1f", vurgu: "#1db954", daire1: "#2a2a2a", daire2: "#1db954", daireGoster: false, yaziTipi: "yuvarlak", emoji: "🎵", emojiSayisi: 0, fotoHareket: false }
  }
};

const YAZI_TIPLERI = {
  sistem: { ad: "Düz", css: "Arial, sans-serif" },
  yuvarlak: { ad: "Yuvarlak", css: "'Nunito', sans-serif" },
  el: { ad: "El yazısı", css: "'Caveat', cursive" },
  sik: { ad: "Şık", css: "'Pacifico', cursive" },
  retro: { ad: "Retro", css: "'Press Start 2P', monospace" }
};

const EMOJILER = ["❤️", "💕", "⭐", "✨", "❄️", "🎈", "🎉", "🍃", "🌸", "🔥", "👾", "🍕", "⚽", "🎵", "😂", "💀", "🐱", "👑", "🌙", "☁️", "🦋", "🍀", "💎", "⏳"];

const FOTO_ANAHTARLARI = ["f0", "f1", "f2", "f3", "f4", "f5"];
const ANA_ODA_FOTOLARI = { f0: "1.png", f1: "2.png", f2: "3.png", f3: "4.png" };

function temaTasarimi(temaId, baslik) {
  const tema = TEMALAR[temaId] || TEMALAR.gece;
  return Object.assign({ tema: TEMALAR[temaId] ? temaId : "gece", baslik: baslik || "Bekleniyor" }, tema.tasarim);
}

// Eksik alanları odanın varsayılan temasıyla doldurur.
function tasarimiTamamla(t, id) {
  return Object.assign(temaTasarimi(id === ANA_ODA ? "klasik" : "gece"), t || {});
}

// Ana oda için hiç fotoğraf kaydedilmemişse repodaki 4 fotoğraf kullanılır.
function gecerliFotolar(id, kayitli) {
  if (kayitli) return kayitli;
  return id === ANA_ODA ? Object.assign({}, ANA_ODA_FOTOLARI) : {};
}

// ---------- Tasarımı sayfaya uygulama ----------

let cizilenEmoji = "";
let cizilenFotolar = "";

function tasarimiUygula(t, fotolar) {
  const kok = $("oda");
  kok.style.setProperty("--arka1", t.arka1);
  kok.style.setProperty("--arka2", t.arka2);
  kok.style.setProperty("--daire1", t.daire1);
  kok.style.setProperty("--daire2", t.daire2);
  kok.style.setProperty("--yazi-tipi", (YAZI_TIPLERI[t.yaziTipi] || YAZI_TIPLERI.sistem).css);
  kok.classList.toggle("daire-yok", !t.daireGoster);
  $("daireYazi").textContent = t.baslik || "";

  const arka = fotolar && fotolar.arka;
  $("arkaPlan").style.backgroundImage = arka && arka.startsWith("data:image/") ? 'url("' + arka + '")' : "";
  $("arkaPlan").classList.toggle("resimli", !!arka);
  arkaVideosunuCiz(videoMu(arka) ? arka : null, (t.hizlar && t.hizlar.arka) || 1);

  emojileriCiz(t.emoji || "", Math.max(0, Math.min(30, t.emojiSayisi | 0)));
  const hizlar = t.hizlar || {};
  fotolariCiz(FOTO_ANAHTARLARI.filter((k) => fotolar && fotolar[k])
    .map((k) => ({ kaynak: fotolar[k], hiz: hizlar[k] || 1 })), !!t.fotoHareket);
}

function emojileriCiz(emoji, sayi) {
  const anahtar = emoji + "|" + sayi;
  if (anahtar === cizilenEmoji) return;
  cizilenEmoji = anahtar;
  const katman = $("emojiKatmani");
  katman.replaceChildren();
  for (let i = 0; i < sayi; i++) {
    katman.append(el("div", {
      className: "ucusan",
      style: {
        left: (Math.random() * 92) + "%",
        top: (8 + Math.random() * 78) + "%",
        animationDuration: (Math.random() * 4 + 4) + "s",
        animationDelay: (-Math.random() * 6) + "s",
        fontSize: (1.6 + Math.random() * 1.6) + "rem"
      }
    }, emoji));
  }
}

const SABIT_KONUMLAR = [
  { left: "1rem", top: "calc(var(--ust) + 0.5rem)" },
  { right: "1rem", top: "calc(var(--ust) + 0.5rem)" },
  { right: "1rem", bottom: "calc(var(--alt) + 0.75rem)" },
  { left: "1rem", bottom: "calc(var(--alt) + 0.75rem)" },
  { left: "1rem", top: "calc(50% - var(--fy) / 2)" },
  { right: "1rem", top: "calc(50% - var(--fy) / 2)" }
];

// Arka plan GIF/video ise sahnenin arkasında döngüde oynar
let cizilenArka = "";
function arkaVideosunuCiz(kaynak, hiz) {
  const anahtar = kaynak ? kaynak.length + kaynak.slice(-24) + "@" + hiz : "";
  if (anahtar === cizilenArka) return;
  cizilenArka = anahtar;
  const eski = $("arkaPlan").querySelector(".arka-video");
  if (eski) eski.remove();
  if (!kaynak) return;
  const video = medyaOgesi(kaynak, hiz);
  video.className = "arka-video";
  $("arkaPlan").prepend(video);
}

function videoMu(kaynak) {
  return typeof kaynak === "string" && kaynak.startsWith("data:video/");
}

// Video (GIF'ten dönüştürülmüş olabilir) sessiz, döngüde ve seçilen hızda oynar.
function medyaOgesi(kaynak, hiz) {
  if (!videoMu(kaynak)) return el("img", { src: kaynak, alt: "" });
  const video = el("video", { src: kaynak, muted: true, autoplay: true, loop: true, playsInline: true });
  video.defaultPlaybackRate = hiz;
  video.playbackRate = hiz;
  video.addEventListener("loadedmetadata", () => { video.playbackRate = hiz; video.play().catch(() => { }); });
  return video;
}

function fotolariCiz(medyalar, hareketli) {
  const anahtar = hareketli + "|" + medyalar.map((m) => m.kaynak.length + m.kaynak.slice(-24) + "@" + m.hiz).join(",");
  if (anahtar === cizilenFotolar) return;
  cizilenFotolar = anahtar;
  const katman = $("fotoKatmani");
  const kaynaklar = medyalar;
  katman.replaceChildren(...medyalar.map((m, i) => {
    const panel = el("div", { className: "foto-paneli" + (hareketli ? " dolasan" : "") }, medyaOgesi(m.kaynak, m.hiz));
    if (hareketli) panel.style.animationDelay = (-(i * 20) / kaynaklar.length) + "s";
    else Object.assign(panel.style, SABIT_KONUMLAR[i]);
    return panel;
  }));
}

// ---------- Fotoğraf küçültme ----------

function resmiKucult(kaynak, enFazlaKenar, enFazlaUzunluk) {
  return new Promise((coz, reddet) => {
    const resim = new Image();
    const adres = kaynak instanceof Blob ? URL.createObjectURL(kaynak) : kaynak;
    resim.onload = () => {
      let olcek = Math.min(1, enFazlaKenar / Math.max(resim.width, resim.height));
      let kalite = 0.82;
      let sonuc = "";
      const tuval = document.createElement("canvas");
      for (let deneme = 0; deneme < 10; deneme++) {
        tuval.width = Math.max(1, Math.round(resim.width * olcek));
        tuval.height = Math.max(1, Math.round(resim.height * olcek));
        const ciz = tuval.getContext("2d");
        ciz.fillStyle = "#000";
        ciz.fillRect(0, 0, tuval.width, tuval.height);
        ciz.drawImage(resim, 0, 0, tuval.width, tuval.height);
        sonuc = tuval.toDataURL("image/jpeg", kalite);
        if (sonuc.length <= enFazlaUzunluk) break;
        if (kalite > 0.55) kalite -= 0.1;
        else olcek *= 0.8;
      }
      if (kaynak instanceof Blob) URL.revokeObjectURL(adres);
      coz(sonuc);
    };
    resim.onerror = () => reddet(new Error("Resim okunamadı"));
    resim.src = adres;
  });
}

// ---------- GIF ve kısa video ----------

// GIF ve videolar tarayıcıda en fazla 15 saniyelik, küçük bir WebM videoya dönüştürülür.
// Böylece veritabanına sığar ve hızları ayarlanabilir.
const MEDYA_SURESI = 15;
const MEDYA_SINIRI = 1400000;

function dosyayiOku(dosya) {
  return new Promise((coz, reddet) => {
    const okuyucu = new FileReader();
    okuyucu.onload = () => coz(okuyucu.result);
    okuyucu.onerror = () => reddet(new Error("Dosya okunamadı"));
    okuyucu.readAsDataURL(dosya);
  });
}

function kayitTuru() {
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
    .find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
}

// ciz(baglam) her karede tuvale çizer; sure saniye boyunca kaydedilir.
function tuvaliKaydet(genislik, yukseklik, sure, bitHizi, ciz) {
  return new Promise((coz, reddet) => {
    const tur = kayitTuru();
    if (!tur) return reddet(new Error("Tarayıcın video dönüştürmeyi desteklemiyor"));
    const tuval = el("canvas", { width: genislik, height: yukseklik });
    const baglam = tuval.getContext("2d");
    const kaydedici = new MediaRecorder(tuval.captureStream(30), { mimeType: tur, videoBitsPerSecond: bitHizi });
    const parcalar = [];
    kaydedici.ondataavailable = (e) => { if (e.data.size) parcalar.push(e.data); };
    kaydedici.onstop = () => dosyayiOku(new Blob(parcalar, { type: tur.split(";")[0] })).then(coz, reddet);
    const baslangic = performance.now();
    kaydedici.start(250);
    const kare = () => {
      ciz(baglam);
      if (performance.now() - baslangic < sure * 1000) requestAnimationFrame(kare);
      else kaydedici.stop();
    };
    kare();
  });
}

function boyutHesapla(g, y, enFazlaKenar) {
  const olcek = Math.min(1, enFazlaKenar / Math.max(g, y));
  // Video kodlayıcılar çift sayılı boyut ister
  return [Math.max(2, Math.round(g * olcek / 2) * 2), Math.max(2, Math.round(y * olcek / 2) * 2)];
}

async function videoyuDonustur(dosya, enFazlaKenar, bitHizi) {
  const adres = URL.createObjectURL(dosya);
  const video = el("video", { src: adres, muted: true, playsInline: true });
  try {
    await new Promise((coz, reddet) => {
      video.onloadeddata = coz;
      video.onerror = () => reddet(new Error("Video açılamadı"));
    });
    const sure = Math.min(video.duration || MEDYA_SURESI, MEDYA_SURESI);
    const [g, y] = boyutHesapla(video.videoWidth, video.videoHeight, enFazlaKenar);
    video.currentTime = 0;
    await video.play();
    return await tuvaliKaydet(g, y, sure, bitHizi, (b) => b.drawImage(video, 0, 0, g, y));
  } finally {
    video.pause();
    URL.revokeObjectURL(adres);
  }
}

// GIF'in toplam süresi (tarayıcı destekliyorsa karelerden hesaplanır)
async function gifSuresi(dosya) {
  if (!("ImageDecoder" in window)) return 6;
  try {
    const cozucu = new ImageDecoder({ data: await dosya.arrayBuffer(), type: "image/gif" });
    await cozucu.tracks.ready;
    const kareSayisi = cozucu.tracks.selectedTrack.frameCount;
    let toplam = 0;
    for (let i = 0; i < kareSayisi && toplam < MEDYA_SURESI * 1e6; i++) {
      const { image } = await cozucu.decode({ frameIndex: i });
      toplam += image.duration || 100000;
      image.close();
    }
    cozucu.close();
    return Math.min(Math.max(toplam / 1e6, 0.5), MEDYA_SURESI);
  } catch (e) {
    return 6;
  }
}

// GIF'in karelerini ve her karenin başlangıç zamanını (ms) çıkarır.
// Chrome görünmeyen GIF'leri oynatmadığı için kareler doğrudan dosyadan çözülür.
async function gifKareleri(dosya) {
  const cozucu = new ImageDecoder({ data: await dosya.arrayBuffer(), type: "image/gif" });
  await cozucu.tracks.ready;
  const kareSayisi = cozucu.tracks.selectedTrack.frameCount;
  const kareler = [];
  let toplam = 0;
  for (let i = 0; i < kareSayisi && toplam < MEDYA_SURESI * 1000; i++) {
    const { image } = await cozucu.decode({ frameIndex: i });
    kareler.push({ bitmap: await createImageBitmap(image), bas: toplam, g: image.displayWidth, y: image.displayHeight });
    toplam += Math.max(20, (image.duration || 100000) / 1000);
    image.close();
  }
  cozucu.close();
  return { kareler, toplam: Math.max(toplam, 200) };
}

async function gifiDonustur(dosya, enFazlaKenar, bitHizi) {
  if ("ImageDecoder" in window) {
    const { kareler, toplam } = await gifKareleri(dosya);
    try {
      const [g, y] = boyutHesapla(kareler[0].g, kareler[0].y, enFazlaKenar);
      const baslangic = performance.now();
      return await tuvaliKaydet(g, y, toplam / 1000, bitHizi, (b) => {
        const t = (performance.now() - baslangic) % toplam;
        let kare = kareler[0];
        for (const k of kareler) { if (k.bas <= t) kare = k; else break; }
        b.fillStyle = "#000";
        b.fillRect(0, 0, g, y);
        b.drawImage(kare.bitmap, 0, 0, g, y);
      });
    } finally {
      kareler.forEach((k) => k.bitmap.close());
    }
  }
  // ImageDecoder olmayan tarayıcılar: GIF ekranda (neredeyse görünmez) bir resimde oynatılıp kaydedilir
  const sure = await gifSuresi(dosya);
  const adres = URL.createObjectURL(dosya);
  // Hareketli GIF'in kareleri ancak sayfadaki bir resimde ilerler
  const resim = el("img", { src: adres, style: { position: "fixed", left: "0", top: "0", width: "160px", opacity: "0.01", pointerEvents: "none", zIndex: "-1" } });
  document.body.append(resim);
  try {
    await resim.decode();
    const [g, y] = boyutHesapla(resim.naturalWidth, resim.naturalHeight, enFazlaKenar);
    return await tuvaliKaydet(g, y, sure, bitHizi, (b) => {
      b.fillStyle = "#000";
      b.fillRect(0, 0, g, y);
      b.drawImage(resim, 0, 0, g, y);
    });
  } finally {
    resim.remove();
    URL.revokeObjectURL(adres);
  }
}

// buyuk: arka plan için daha yüksek çözünürlük denenir
async function medyayiHazirla(dosya, buyuk) {
  const gif = dosya.type === "image/gif";
  const denemeler = buyuk
    ? [[720, 1000000], [540, 650000], [400, 350000]]
    : [[480, 700000], [360, 400000], [280, 220000]];
  for (const [kenar, bit] of denemeler) {
    const sonuc = gif ? await gifiDonustur(dosya, kenar, bit) : await videoyuDonustur(dosya, kenar, bit);
    if (sonuc.length <= MEDYA_SINIRI) return sonuc;
  }
  throw new Error("Bu dosya çok büyük kaldı; daha kısa ya da daha küçük bir video dene.");
}

// ---------- Düzen modu ----------

let duzenAcik = false;
let taslak = null;
let taslakFotolar = null;
let taslakOdaAdi = "";
let taslakHerkeseAcik = true;

function duzenModunuAc() {
  if (!duzenleyebilirMi()) return bildir("Bu odayı sadece sahibi düzenleyebilir.");
  duzenAcik = true;
  taslak = tasarimiTamamla(odaTasarim, odaId);
  taslakFotolar = Object.assign({}, gecerliFotolar(odaId, odaFotolar));
  taslakOdaAdi = (odaBilgi && odaBilgi.ad) || odaVarsayilanAdi();
  taslakHerkeseAcik = odaBilgi ? odaBilgi.herkeseAcik !== false : true;
  duzenFormunuDoldur();
  $("listePaneli").classList.remove("acik");
  $("duzenPaneli").classList.add("acik");
}

function duzenModunuKapat() {
  duzenAcik = false;
  $("duzenPaneli").classList.remove("acik");
  odaTasariminiUygula();
}

function taslagiUygula() {
  tasarimiUygula(taslak, taslakFotolar);
}

function duzenFormunuDoldur() {
  $("tOdaAdi").value = taslakOdaAdi;
  $("tBaslik").value = taslak.baslik || "";
  $("tArka1").value = taslak.arka1;
  $("tArka2").value = taslak.arka2;
  $("tVurgu").value = taslak.vurgu;
  $("tDaire1").value = taslak.daire1;
  $("tDaire2").value = taslak.daire2;
  $("tDaireGoster").checked = !!taslak.daireGoster;
  $("tEmojiSayisi").value = taslak.emojiSayisi;
  $("tEmojiOzel").value = EMOJILER.includes(taslak.emoji) ? "" : taslak.emoji;
  $("tFotoHareket").checked = !!taslak.fotoHareket;
  $("tHerkeseAcik").checked = taslakHerkeseAcik;
  $("tHerkeseAcik").closest("details").hidden = odaId === ANA_ODA && !odaBilgi;
  $("odaSilTus").hidden = odaId === ANA_ODA;

  $("temaSeridi").replaceChildren(...Object.entries(TEMALAR).map(([id, tema]) => el("button", {
    className: "tema-karti" + (taslak.tema === id ? " secili" : ""),
    style: { "--k1": tema.tasarim.arka1, "--k2": tema.tasarim.arka2 },
    onclick: () => {
      taslak = Object.assign(temaTasarimi(id, taslak.baslik), { hizlar: taslak.hizlar });
      duzenFormunuDoldur();
      taslagiUygula();
    }
  }, el("span", {}, tema.simge), tema.ad)));
  // style nesnesi CSS değişkenlerini ayarlamadığı için elle verilir
  [...$("temaSeridi").children].forEach((kart, i) => {
    const tema = Object.values(TEMALAR)[i];
    kart.style.setProperty("--k1", tema.tasarim.arka1);
    kart.style.setProperty("--k2", tema.tasarim.arka2);
  });

  $("tYaziTipi").replaceChildren(...Object.entries(YAZI_TIPLERI).map(([id, yt]) => el("button", {
    className: taslak.yaziTipi === id ? "secili" : "",
    style: { fontFamily: yt.css },
    title: yt.ad,
    onclick: () => { taslak.yaziTipi = id; duzenFormunuDoldur(); taslagiUygula(); }
  }, "Aa")));

  $("tEmojiler").replaceChildren(
    el("button", {
      className: taslak.emojiSayisi === 0 ? "secili" : "", title: "Hiçbiri",
      onclick: () => { taslak.emojiSayisi = 0; duzenFormunuDoldur(); taslagiUygula(); }
    }, "🚫"),
    ...EMOJILER.map((e) => el("button", {
      className: taslak.emoji === e && taslak.emojiSayisi > 0 ? "secili" : "",
      onclick: () => {
        taslak.emoji = e;
        if (!taslak.emojiSayisi) taslak.emojiSayisi = 10;
        duzenFormunuDoldur();
        taslagiUygula();
      }
    }, e))
  );

  fotoYuvalariniCiz();
}

// hareketliOlabilir: GIF ve video da kabul edilir (fotoğraf yuvaları); arka plan sadece resim alır.
function fotoYuvasi(anahtar, enFazlaKenar, enFazlaUzunluk, hareketliOlabilir) {
  const deger = taslakFotolar[anahtar];
  let hazirlaniyor = false;
  const yuva = el("div", {
    className: "foto-yuvasi" + (deger ? " dolu" : ""),
    title: deger ? "Değiştirmek için tıkla" : (hareketliOlabilir ? "Fotoğraf, GIF ya da video ekle" : "Resim ekle"),
    onclick: async () => {
      if (hazirlaniyor) return;
      const dosya = await dosyaSec(hareketliOlabilir ? "image/*,video/*" : "image/*");
      if (!dosya) return;
      const hareketli = hareketliOlabilir && (dosya.type === "image/gif" || dosya.type.startsWith("video/"));
      try {
        hazirlaniyor = true;
        yuva.classList.add("hazirlaniyor");
        yuva.textContent = hareketli ? "⏳" : "…";
        bildir(hareketli ? "Video hazırlanıyor (en fazla 15 sn sürer)…" : "Fotoğraf hazırlanıyor…");
        taslakFotolar[anahtar] = hareketli ? await medyayiHazirla(dosya, anahtar === "arka") : await resmiKucult(dosya, enFazlaKenar, enFazlaUzunluk);
        bildir((hareketli ? "Video" : "Fotoğraf") + " eklendi, kaydetmeyi unutma");
      } catch (e) {
        bildir(e.message);
      } finally {
        hazirlaniyor = false;
        fotoYuvalariniCiz();
        taslagiUygula();
      }
    }
  }, deger ? "" : "+");
  if (deger) {
    if (videoMu(deger)) {
      yuva.prepend(el("video", { className: "yuva-video", src: deger, muted: true, autoplay: true, loop: true, playsInline: true }));
    } else {
      yuva.style.backgroundImage = 'url("' + deger + '")';
    }
    yuva.append(el("button", {
      className: "sil", title: "Kaldır",
      onclick: (e) => {
        e.stopPropagation();
        delete taslakFotolar[anahtar];
        if (taslak.hizlar) delete taslak.hizlar[anahtar];
        fotoYuvalariniCiz();
        taslagiUygula();
      }
    }, "✕"));
  }
  if (!videoMu(deger)) return yuva;

  // Video yuvası: altında hız seçici
  const hiz = (taslak.hizlar && taslak.hizlar[anahtar]) || 1;
  const secici = el("select", {
    className: "hiz-secici", title: "Oynatma hızı",
    onchange: (e) => {
      taslak.hizlar = Object.assign({}, taslak.hizlar, { [anahtar]: Number(e.target.value) });
      taslagiUygula();
    }
  }, [0.5, 0.75, 1, 1.25, 1.5, 2].map((h) => el("option", { value: h, selected: h === hiz }, h + "×")));
  return el("div", { className: "foto-hucre" }, yuva, secici);
}

function fotoYuvalariniCiz() {
  $("tFotolar").replaceChildren(...FOTO_ANAHTARLARI.map((k) => fotoYuvasi(k, 720, 230000, true)));
  $("tArkaResim").replaceChildren(fotoYuvasi("arka", 1400, 380000, true));
}

async function duzenKaydet() {
  const tus = $("duzenKaydet");
  tus.disabled = true;
  tus.textContent = "Kaydediliyor…";
  try {
    const kayit = {};
    for (const alan of ["arka1", "arka2", "vurgu", "daire1", "daire2", "yaziTipi", "emoji"]) kayit[alan] = String(taslak[alan]);
    kayit.tema = String(taslak.tema || "ozel").slice(0, 20);
    kayit.baslik = String(taslak.baslik || "").slice(0, 40);
    kayit.emoji = kayit.emoji.slice(0, 16);
    kayit.daireGoster = !!taslak.daireGoster;
    kayit.fotoHareket = !!taslak.fotoHareket;
    kayit.emojiSayisi = Math.max(0, Math.min(30, taslak.emojiSayisi | 0));

    const guncellemeler = { ["odalar/" + odaId + "/tasarim"]: kayit };
    if (odaBilgi) {
      guncellemeler["odalar/" + odaId + "/bilgi/ad"] = (taslakOdaAdi || odaBilgi.ad).slice(0, 40);
      guncellemeler["odalar/" + odaId + "/bilgi/herkeseAcik"] = taslakHerkeseAcik;
    }
    // Fotoğraflar boşluksuz sıralanır; video hızları da yeni yerleriyle birlikte taşınır.
    const doluAnahtarlar = FOTO_ANAHTARLARI.filter((k) => taslakFotolar[k]);
    const hizlar = {};
    doluAnahtarlar.forEach((k, i) => {
      const h = taslak.hizlar && taslak.hizlar[k];
      if (videoMu(taslakFotolar[k]) && h && h !== 1) hizlar[FOTO_ANAHTARLARI[i]] = Math.max(0.25, Math.min(4, Number(h)));
    });
    const arkaHiz = taslak.hizlar && taslak.hizlar.arka;
    if (videoMu(taslakFotolar.arka) && arkaHiz && arkaHiz !== 1) hizlar.arka = Math.max(0.25, Math.min(4, Number(arkaHiz)));
    if (Object.keys(hizlar).length) kayit.hizlar = hizlar;
    guncellemeler["odalar/" + odaId + "/tasarim"] = kayit;

    const onceki = gecerliFotolar(odaId, odaFotolar);
    const fotolarDegisti = [...FOTO_ANAHTARLARI, "arka"].some((k) => (taslakFotolar[k] || null) !== (onceki[k] || null)) || !odaFotolar;
    if (fotolarDegisti) {
      // Repodaki dosyalar (ana oda) önce küçültülüp veriye çevrilir.
      for (let i = 0; i < FOTO_ANAHTARLARI.length; i++) {
        let deger = taslakFotolar[doluAnahtarlar[i]] || null;
        if (deger && !deger.startsWith("data:")) deger = await resmiKucult(deger, 720, 230000);
        guncellemeler["odaFotolari/" + odaId + "/" + FOTO_ANAHTARLARI[i]] = deger;
      }
      guncellemeler["odaFotolari/" + odaId + "/arka"] = taslakFotolar.arka || null;
    }
    await db.ref().update(guncellemeler);
    bildir("Tasarım kaydedildi ✓ Odadaki herkes yeni hâlini görüyor");
    duzenModunuKapat();
  } catch (e) {
    bildir("Kaydedilemedi: " + (e.code === "PERMISSION_DENIED" ? "bu odayı düzenleme iznin yok" : e.message));
  } finally {
    tus.disabled = false;
    tus.textContent = "Kaydet";
  }
}

function duzenOlaylariniBagla() {
  const renkler = { tArka1: "arka1", tArka2: "arka2", tVurgu: "vurgu", tDaire1: "daire1", tDaire2: "daire2" };
  for (const [id, alan] of Object.entries(renkler)) {
    $(id).addEventListener("input", (e) => { taslak[alan] = e.target.value; taslak.tema = "ozel"; taslagiUygula(); });
  }
  $("tOdaAdi").addEventListener("input", (e) => { taslakOdaAdi = e.target.value.trim(); $("odaAdi").textContent = taslakOdaAdi; });
  $("tBaslik").addEventListener("input", (e) => { taslak.baslik = e.target.value; taslagiUygula(); });
  $("tDaireGoster").addEventListener("change", (e) => { taslak.daireGoster = e.target.checked; taslagiUygula(); });
  $("tFotoHareket").addEventListener("change", (e) => { taslak.fotoHareket = e.target.checked; taslagiUygula(); });
  $("tHerkeseAcik").addEventListener("change", (e) => { taslakHerkeseAcik = e.target.checked; });
  $("tEmojiSayisi").addEventListener("input", (e) => { taslak.emojiSayisi = Number(e.target.value); taslagiUygula(); });
  $("tEmojiOzel").addEventListener("input", (e) => {
    const deger = e.target.value.trim();
    if (!deger) return;
    taslak.emoji = deger;
    if (!taslak.emojiSayisi) taslak.emojiSayisi = 10;
    taslagiUygula();
  });
  $("duzenTus").addEventListener("click", duzenModunuAc);
  $("duzenKapat").addEventListener("click", duzenModunuKapat);
  $("duzenVazgec").addEventListener("click", duzenModunuKapat);
  $("duzenKaydet").addEventListener("click", duzenKaydet);
  $("odaSilTus").addEventListener("click", async () => {
    if (await onayla("Odayı sil", "Bu oda, tasarımı, fotoğrafları ve geçmişiyle birlikte kalıcı olarak silinecek.", "Sil", true)) {
      await odaSil(odaId, odaBilgi);
    }
  });
}
