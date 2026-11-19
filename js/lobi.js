// Lobi: odaların listesi, oda oluşturma (hesap başına 2 oda) ve oda silme.

let tumOdalar = {};
let benimSlotlarim = {};
let odaOyunlari = {};

// Odadaki masalar: son 10 dakikada güncellenmiş ve en az bir kişinin oturduğu masalar. Oynanan masa küçük bir
// rozet olur; oyuncu bekleyen (boş koltuğu olan) masa kartın altında belirgin bir "Otur" daveti olur.
// Koltuk sayısına botlar da dahildir; bu yüzden "N kişi içeride" ile masadaki sayı farklı olabilir (açıklaması
// üzerine gelince yazar).
const OYUN_ADLARI = { okey: ["🀄", "Okey"], bilardo: ["🎱", "Bilardo"] };
function oyunMasalari(id) {
  // Masa özetini oyunu açık olan tarayıcılar yazar; herkes odadan çıkınca özeti güncelleyen kalmaz ve eski
  // "3 boş yer" 10 dakika görünürdü. İçinde kimse olmayan odanın masası gösterilmez.
  if (!katilanListesi((tumOdalar[id] || {}).katilanlar).length) return [];
  const masalar = odaOyunlari[id] || {};
  return Object.entries(OYUN_ADLARI).map(([oyun, [simge, ad]]) => {
    const m = masalar[oyun];
    if (!m || !(m.oturan > 0) || sunucuZamani() - (m.zaman || 0) > 10 * 60 * 1000) return null;
    return { oyun, simge, ad, oturan: Math.min(4, m.oturan), oyunVar: !!m.oyunVar };
  }).filter(Boolean);
}
function oyunRozetleri(id) {
  return oyunMasalari(id).filter((m) => m.oyunVar || m.oturan >= 4).map((m) =>
    el("span", { className: "kart-rozet oyun" + (m.oyunVar ? " oynaniyor" : ""), title: m.ad + (m.oyunVar ? " oynanıyor" : " masası dolu") + " (" + m.oturan + "/4 koltuk, botlar dahil)" },
      m.simge + " " + m.ad + " " + m.oturan + "/4"));
}
function oyunDavetleri(id) {
  return oyunMasalari(id).filter((m) => !m.oyunVar && m.oturan < 4).map((m) => {
    const bos = 4 - m.oturan;
    return el("a", {
      className: "kart-oyun-davet", href: "?oda=" + encodeURIComponent(id) + "&" + m.oyun + "=1",
      title: "Masada " + m.oturan + " koltuk dolu (botlar da sayılır). Basınca odaya girip masayı açar."
    }, el("span", { "aria-hidden": "true" }, m.simge), " " + (m.oyun === "okey" ? "Okeyde " : "Bilardoda ") + bos + " boş yer", el("b", {}, "Otur →"));
  });
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
  davetFormunuBagla();
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
    // Odanın emojisi köşede (favori/puan gibi okunuyordu) değil, adın önünde durur
    el("div", { className: "kart-baslik" },
      // Kartın asıl bağlantısı odanın adıdır; ::after ile bütün kartı kaplar (kart içindeki düğmeler ayrı kalır)
      el("h3", {}, el("a", {
        className: "kart-bag", href: "?oda=" + encodeURIComponent(id),
        onclick: (e) => { if (dinlenen) { e.preventDefault(); odayaGeriDon(); } }
      }, el("span", { className: "kart-emoji", "aria-hidden": "true" }, tasarim.emojiSayisi ? tasarim.emoji : "🎧"),
        bilgi.ad || (id === ANA_ODA ? "Ana Oda ⭐" : id))),
      bilgi.sahipAdi ? el("div", { className: "kart-sahip" }, bilgi.sahipAdi) : null));
  kartGorseliniYukle(id, gorsel);
  const sanatci = calan ? sanatciBul(calan) : "";
  const kart = el("article", {
    className: "oda-karti" + (dinlenen ? " dinlenen" : "") + (caliyor ? " caliyor" : "") + (icerdekiler.length ? "" : " bos-oda"),
    // Kartın boş yerine tıklamak başlıktaki bağlantıya basmak demek (içteki bağlantı/düğmeler kendi işini yapar)
    onclick: (e) => { if (!e.target.closest("a, button")) kart.querySelector(".kart-bag").click(); },
    onmouseenter: () => { const v = gorsel.querySelector("video"); if (v) v.play().catch(() => { }); },
    onmouseleave: () => { const v = gorsel.querySelector("video"); if (v) v.pause(); }
  },
    gorsel,
    el("div", { className: "kart-govde" },
      ...oyunDavetleri(id),
      // Boş oda: tek, soluk bir satır (kart durumsuz görünmesin)
      !calan && !icerdekiler.length ? el("div", { className: "kart-bos" }, "Şu an boş · ilk sen gir") : null,
      calan ? el("div", { className: "kart-calan" },
        kapakResmi(calan, { className: "kart-kapak" }),
        el("div", { className: "kart-sarki" }, el("b", {}, calan.baslik), el("small", {}, sanatci || (caliyor ? "Çalıyor" : "Duraklatıldı"))),
        caliyor ? el("span", { className: "kart-dalga", "aria-hidden": "true" }, el("i"), el("i"), el("i"), el("i")) : null)
        : null,
      // Kişilere basınca odaya girilmez, içeridekilerin listesi açılır
      icerdekiler.length ? el("button", {
        type: "button", className: "kart-kisiler", title: "Kimler var?", "aria-haspopup": "menu",
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

// Gizli oda (lobide listelenmesin denmiş), içinde biri varken girilebilir odaların ARDINDAN küçük bir satırda
// görünür: adı, sahibi ve kaç kişi olduğu. Bağlantı değildir; girmek için oda sahibinin davet linki gerekir.
// (Bu tarayıcıda daha önce girilmiş gizli oda kilitli sayılmaz, normal kart olarak gösterilir.)
function kilitliOdaCipi(id, oda) {
  const bilgi = oda.bilgi || {};
  const sayi = katilanListesi(oda.katilanlar).length;
  const aciklama = "Gizli oda. Girmek için " + (bilgi.sahipAdi || "oda sahibi") + " sana davet linkini göndermeli.";
  // Basınca açıklama satırın hemen altında yazar (kaybolan bildirim yerine)
  const goster = () => { const p = $("gizliAciklama"); p.textContent = "🔒 " + (bilgi.ad || id) + ": " + aciklama; p.hidden = false; davetKutusunuAc(false); };
  return el("button", { type: "button", className: "gizli-oda", title: aciklama, onclick: goster },
    "🔒 ", el("b", {}, bilgi.ad || id), el("small", {}, (bilgi.sahipAdi ? bilgi.sahipAdi + " · " : "") + sayi + " kişi"));
}

// Odada şu an çalan şarkı ve oyuncu bekleyen masa: sıralamada "girmeye değer" ölçüsü
function bekleyenMasaVar(id) {
  return oyunMasalari(id).some((m) => !m.oyunVar && m.oturan < 4) ? 1 : 0;
}

// ---------- Son girilen odalar (bu tarayıcıda) ----------
const ODA_KIMLIGI = /^[A-Za-z0-9_-]{1,80}$/;
function sonOdalar() {
  try {
    const liste = JSON.parse(hafizadanOku("sonOdalar") || "[]");
    return Array.isArray(liste) ? liste.filter((id) => typeof id === "string" && ODA_KIMLIGI.test(id)) : [];
  } catch (e) { return []; }
}
function sonOdayaEkle(id) {
  if (!ODA_KIMLIGI.test(String(id || ""))) return;
  hafizayaYaz("sonOdalar", JSON.stringify([id, ...sonOdalar().filter((x) => x !== id)].slice(0, 6)));
}
// Kendi odaların "Odalarım"da olduğu için burada tekrar edilmez; silinmiş odalar atlanır
function sonOdalariCiz(benimkiler) {
  const kutu = $("sonOdalar");
  // İçinde insan olan odalar zaten başlıkta ve en üstteki kartta: "Son girdiğin"de tekrar edilmez
  const odalar = sonOdalar().filter((id) => !benimkiler.has(id) && tumOdalar[id] && tumOdalar[id].bilgi &&
    !katilanListesi(tumOdalar[id].katilanlar).length).slice(0, 4);
  kutu.hidden = !odalar.length;
  kutu.replaceChildren(el("span", { className: "son-odalar-baslik" }, "Son girdiğin:"), ...odalar.map((id) => {
    const oda = tumOdalar[id];
    const sayi = katilanListesi(oda.katilanlar).length;
    return el("a", { className: "son-oda" + (sayi ? " dolu" : ""), href: "?oda=" + encodeURIComponent(id) },
      oda.bilgi.herkeseAcik === false ? "🔒 " : "", oda.bilgi.ad || id, sayi ? el("small", {}, sayi + " kişi") : null);
  }));
}

// ---------- Davet linkiyle odaya gitme ----------
function davetKimligi(metin) {
  const deger = String(metin || "").trim();
  if (!deger) return null;
  try {
    const id = new URL(deger, location.href).searchParams.get("oda");
    if (id && ODA_KIMLIGI.test(id)) return id;
  } catch (e) { }
  return ODA_KIMLIGI.test(deger) ? deger : null;
}
function davetKutusunuAc(odaklan) {
  $("davetFormu").hidden = false;
  $("davetAcTus").hidden = true;
  $("davetAcTus").setAttribute("aria-expanded", "true");
  if (odaklan) $("davetKutusu").focus();
}

// Hata kutunun hemen altında yazar (kaybolan bildirim yerine); ekran okuyucu da okur. Yazmaya başlayınca silinir.
function davetFormunuBagla() {
  const kutu = $("davetKutusu"), hata = $("davetHata");
  const hataGoster = (metin) => {
    hata.textContent = metin;
    hata.hidden = !metin;
    if (metin) kutu.setAttribute("aria-invalid", "true"); else kutu.removeAttribute("aria-invalid");
  };
  kutu.addEventListener("input", () => { if (!hata.hidden) hataGoster(""); });
  // Seyrek iş: kutu küçük bir düğmenin arkasında durur
  $("davetAcTus").addEventListener("click", () => davetKutusunuAc(true));
  $("davetFormu").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = davetKimligi(kutu.value);
    if (!kutu.value.trim()) { hataGoster("Önce arkadaşının gönderdiği linki buraya yapıştır."); kutu.focus(); return; }
    if (!id) { hataGoster("Bu bir oda linkine benzemiyor. Linkin sonunda “?oda=…” olmalı."); kutu.focus(); return; }
    if (!(tumOdalar[id] && tumOdalar[id].bilgi)) { hataGoster("Bu linkte bir oda bulunamadı; oda silinmiş olabilir. Arkadaşından linki tekrar iste."); kutu.focus(); return; }
    hataGoster("");
    location.href = "?oda=" + encodeURIComponent(id);
  });
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
    $("odaHakki").title = yonetici ? "" : "Her hesap en fazla " + ODA_HAKKI + " oda açabilir";
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

  // Odalar: girilebilir odalar önce: içinde insan olanlar (kalabalıktan aza), eşitse oyuncu bekleyen masası ve
  // çalan şarkısı olan, sonra ana oda, sonra diğerleri. Gizli odalar içinde biri varken en sonda küçük bir satırda.
  // "Odalarım"dakiler burada tekrar edilmez.
  const benimkiler = new Set(kullanici ? [...benimOdalarim(), ...Object.keys(tumOdalar).filter((id) =>
    yonetici && tumOdalar[id].bilgi && tumOdalar[id].bilgi.sahip === kullanici.uid)] : []);
  const kisi = (id) => katilanListesi((tumOdalar[id] || {}).katilanlar).length;
  const dinlenenOda = typeof katildi !== "undefined" && katildi ? odaId : null;
  const listede = Object.keys(tumOdalar).filter((id) => !benimkiler.has(id) && tumOdalar[id].bilgi &&
    (id === ANA_ODA || tumOdalar[id].bilgi.herkeseAcik !== false || kisi(id) > 0 || id === dinlenenOda));
  if (!benimkiler.has(ANA_ODA) && !listede.includes(ANA_ODA)) listede.push(ANA_ODA);
  const caliyor = (id) => { const m = ((tumOdalar[id] || {}).muzik || {}).simdiki; return m && !m.duraklatildi && kisi(id) > 0 ? 1 : 0; };
  listede.sort((a, b) => kisi(b) - kisi(a) || bekleyenMasaVar(b) - bekleyenMasaVar(a) || caliyor(b) - caliyor(a)
    || (b === ANA_ODA) - (a === ANA_ODA)
    || ((tumOdalar[b] || {}).bilgi || {}).olusturma - ((tumOdalar[a] || {}).bilgi || {}).olusturma || 0);
  const girilmis = new Set(sonOdalar());
  const kilitliMi = (id) => { const b = (tumOdalar[id] || {}).bilgi; return id !== ANA_ODA && b && b.herkeseAcik === false && id !== dinlenenOda && !girilmis.has(id); };
  $("acikOdalar").replaceChildren(...listede.filter((id) => !kilitliMi(id)).map((id) => odaKarti(id, tumOdalar[id] || {})));
  const kilitliler = listede.filter(kilitliMi);
  $("gizliOdalar").hidden = !kilitliler.length;
  if (!kilitliler.length) $("gizliAciklama").hidden = true;
  $("gizliOdalar").replaceChildren(el("span", { className: "son-odalar-baslik" }, "Gizli odalar:"),
    ...kilitliler.map((id) => kilitliOdaCipi(id, tumOdalar[id])));
  sonOdalariCiz(benimkiler);

  // Karşılama: girilebilir odalar (benimkiler dahil) kalabalıktan aza
  const girilebilir = [...listede.filter((id) => !kilitliMi(id)), ...benimkiler].filter((id, i, a) => a.indexOf(id) === i)
    .sort((a, b) => kisi(b) - kisi(a) || bekleyenMasaVar(b) - bekleyenMasaVar(a) || caliyor(b) - caliyor(a));
  karsilamayiCiz(girilebilir);
  kimlerNeredeCiz(girilebilir, listede.filter(kilitliMi));

  $("lobiYonetimTus").hidden = !yonetici;
}

// Karşılama. İlk kez gelen (hiç odaya girmemiş, odası yok) tanıtım başlığını görür. Geri dönen arkadaş ise
// tanıtım yerine şu anın canlı cümlesini görür: "Zeynep ve Murat şu an “Cuma Akşamı” odasında · okeyde 1 yer boş".
// Cümledeki oda adına basınca o odaya gidilir. Kimse yoksa tek bir davet cümlesi.
// "Şu an kimler nerede": içinde insan olan her oda bir satır: kişilerin avatarı ve adı, oda adı, varsa boş koltuk.
// Satıra basınca odaya gidilir. Gizli odalar (girilmemiş) tek satırda sadece kişi sayısıyla özetlenir.
function kimlerNeredeCiz(girilebilir, kilitliler) {
  const dolu = girilebilir.filter((id) => tumOdalar[id] && katilanListesi(tumOdalar[id].katilanlar).length);
  const gizliKisi = kilitliler.reduce((t, id) => t + katilanListesi((tumOdalar[id] || {}).katilanlar).length, 0);
  // Tek dolu oda varken (ve gizli oda yokken) başlık cümlesi zaten aynı şeyi söylüyor: bölüm tekrar etmesin
  $("kimlerNerede").hidden = (!dolu.length && !gizliKisi) || (dolu.length === 1 && !gizliKisi);
  const satirlar = dolu.map((id) => {
    const kisiler = katilanListesi(tumOdalar[id].katilanlar);
    const adlar = kisiler.map((k) => String(k.ad || "").split(" ")[0]);
    const masa = oyunMasalari(id).find((m) => !m.oyunVar && m.oturan < 4);
    const dinlenen = typeof katildi !== "undefined" && katildi && id === odaId;
    return el("a", {
      className: "kimler-satir", href: "?oda=" + encodeURIComponent(id),
      onclick: (e) => { if (dinlenen) { e.preventDefault(); odayaGeriDon(); } }
    }, avatarYigini(kisiler, 4),
      el("span", { className: "kimler-adlar" }, isimleriBirlestir(adlar)),
      el("span", { className: "kimler-oda" }, "“" + ((tumOdalar[id].bilgi || {}).ad || (id === ANA_ODA ? "Ana Oda" : id)) + "”" +
        (masa ? " · " + MASADA[masa.oyun] + " " + (4 - masa.oturan) + " yer boş" : "")),
      el("b", { className: "kimler-git" }, dinlenen ? "Buradasın" : "Git →"));
  });
  if (gizliKisi) satirlar.push(el("div", { className: "kimler-satir gizli" }, "🔒 " + gizliKisi + " kişi gizli odada (davetle girilir)"));
  $("kimlerListe").replaceChildren(...satirlar);
}

const MASADA = { okey: "okeyde", bilardo: "bilardoda" };
function bosMasa(ids) {
  for (const id of ids) {
    const m = oyunMasalari(id).find((x) => MASADA[x.oyun] && !x.oyunVar && x.oturan < 4);
    if (m) return { id, oyun: m.oyun, bos: 4 - m.oturan };
  }
  return null;
}
function isimleriBirlestir(adlar) {
  if (adlar.length <= 2) return adlar.join(" ve ");
  return adlar.slice(0, 2).join(", ") + " ve " + (adlar.length - 2) + " kişi daha";
}
function karsilamayiCiz(girilebilir) {
  // Sayılar sadece girilebilen odalardan (gizli odadakiler "kimler nerede"de ayrıca sayıyla yazar)
  const girilenOdalar = girilebilir.map((id) => tumOdalar[id]).filter(Boolean);
  const kisiSayisi = girilenOdalar.reduce((t, o) => t + katilanListesi(o.katilanlar).length, 0);
  const doluOda = girilenOdalar.filter((o) => katilanListesi(o.katilanlar).length).length;
  const canli = $("lobiCanli"), baslik = $("lobiBaslik"), alt = $("lobiAlt");
  const ilkGelis = !sonOdalar().length && !benimOdalarim().length;
  $("lobi").querySelector(".karsilama").classList.toggle("tanitim", ilkGelis);
  canli.classList.toggle("canli", kisiSayisi > 0);
  canli.textContent = kisiSayisi ? "Şu an " + kisiSayisi + " kişi, " + doluOda + " odada" : "Şu an kimse yok";

  if (ilkGelis) {
    baslik.textContent = "Arkadaşını beklerken birlikte müzik dinle";
    alt.textContent = "Odadaki herkes aynı şarkıyı aynı anda duyar; okey ve bilardo da masada. Bir odaya gir, istersen kendi odanı aç.";
    return;
  }
  // Benim dışımdaki insanların olduğu en kalabalık oda
  const benimAdim = kisaAd();
  const adlar = (id) => katilanListesi(tumOdalar[id].katilanlar).map((k) => String(k.ad || "").split(" ")[0]).filter((a) => a && a !== benimAdim);
  const odaAdi = (id) => (tumOdalar[id].bilgi || {}).ad || (id === ANA_ODA ? "Ana Oda ⭐" : id);
  const odaBag = (id) => el("a", { href: "?oda=" + encodeURIComponent(id), onclick: (e) => { if (typeof katildi !== "undefined" && katildi && id === odaId) { e.preventDefault(); odayaGeriDon(); } } }, "“" + odaAdi(id) + "”");
  const kalabalik = girilebilir.find((id) => tumOdalar[id] && adlar(id).length);
  const masa = bosMasa(girilebilir);
  if (!kalabalik && !masa) {
    canli.textContent = "";   // başlık zaten "kimse yok" diyor; rozet tekrar etmesin
    baslik.textContent = "Şu an kimse yok";
    alt.textContent = "Bir odaya gir, müziği sen başlat; gelen arkadaşların seni orada bulur.";
    return;
  }
  const parcalar = [];
  if (kalabalik) parcalar.push(isimleriBirlestir(adlar(kalabalik)) + " şu an ", odaBag(kalabalik), " odasında");
  if (masa) {
    const yer = MASADA[masa.oyun] + " " + masa.bos + " yer boş";
    if (masa.id === kalabalik) parcalar.push(" · " + yer);
    else if (kalabalik) parcalar.push(" · " + yer + ": ", odaBag(masa.id));
    else parcalar.push(odaBag(masa.id), " odasında " + yer);
  }
  baslik.replaceChildren(...parcalar);
  alt.textContent = kisiSayisi > 1 && doluOda > 1 ? "Başka odalarda da insanlar var; hepsi aşağıda." : "Odaya girince müzik herkesle aynı anda çalar.";
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
    el("label", { className: "anahtar" }, acikKutusu, "Lobideki “Odalar”da herkes görsün (kapalıysa sadece davet linkiyle girilir)")
  ], [
    { yazi: "Vazgeç", is: pencereKapat },
    {
      yazi: "Oluştur", ana: true, is: () => {
        const ad = adKutusu.value.trim();
        if (!ad) { adKutusu.focus(); bildir("Odaya bir ad ver (ör. Cuma Akşamı)"); return; }
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
    console.warn("Oda oluşturulamadı:", e);
    bildir(e.code === "PERMISSION_DENIED" ? "Oda oluşturulamadı: oda hakkın dolmuş olabilir. Odalarından birini silip tekrar dene."
      : "Oda oluşturulamadı. İnternet bağlantını kontrol edip tekrar dene.");
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
    console.warn("Oda silinemedi:", e);
    bildir(e.code === "PERMISSION_DENIED" ? "Oda silinemedi: bu odayı silme iznin yok."
      : "Oda silinemedi. İnternet bağlantını kontrol edip tekrar dene.");
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
