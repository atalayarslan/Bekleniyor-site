// Yönetim paneli: sadece yönetici hesabına görünür. Asıl yetki kontrolü database.rules.json'dadır;
// başkası bu paneli açmaya çalışsa bile veritabanı isteklerini reddeder.

let yonetimOdalar = {};
let yonetimKullanicilar = {};
let yonetimYasaklilar = {};
let yonetimDinleniyor = false;

function yonetimiAc() {
  if (!yonetici) return bildir("Bu bölüm sadece yöneticiye açık.");
  $("yonetimPaneli").hidden = false;
  if (yonetimDinleniyor) return yonetimiCiz();
  yonetimDinleniyor = true;
  db.ref("odalar").on("value", (s) => { yonetimOdalar = s.val() || {}; yonetimiCiz(); });
  db.ref("kullanicilar").on("value", (s) => { yonetimKullanicilar = s.val() || {}; yonetimiCiz(); },
    (e) => bildir("Kullanıcılar okunamadı: " + e.message));
  db.ref("yasakli").on("value", (s) => { yonetimYasaklilar = s.val() || {}; yonetimiCiz(); }, () => { });
}

function yonetimiKapat() {
  $("yonetimPaneli").hidden = true;
}

function yonetimiCiz() {
  if ($("yonetimPaneli").hidden) return;
  const odaIdleri = Object.keys(yonetimOdalar);
  const icerdekiler = odaIdleri.reduce((t, id) => t + Object.keys(yonetimOdalar[id].katilanlar || {}).length, 0);
  const calanlar = odaIdleri.filter((id) => yonetimOdalar[id].muzik && yonetimOdalar[id].muzik.simdiki).length;
  $("yonetimOzet").replaceChildren(
    el("div", { className: "ozet-kutusu" }, el("b", {}, odaIdleri.length), "oda"),
    el("div", { className: "ozet-kutusu" }, el("b", {}, icerdekiler), "kişi şu an içeride"),
    el("div", { className: "ozet-kutusu" }, el("b", {}, calanlar), "odada müzik çalıyor"),
    el("div", { className: "ozet-kutusu" }, el("b", {}, Object.keys(yonetimKullanicilar).length), "kayıtlı kullanıcı"),
    el("div", { className: "ozet-kutusu" }, el("b", {}, Object.keys(yonetimYasaklilar).length), "yasaklı")
  );
  yonetimOdalariniCiz();
  yonetimKullanicilariniCiz();
}

function yonetimOdalariniCiz() {
  const satirlar = Object.keys(yonetimOdalar).sort((a, b) =>
    ((yonetimOdalar[b].bilgi || {}).olusturma || 0) - ((yonetimOdalar[a].bilgi || {}).olusturma || 0)).map((id) => {
      const oda = yonetimOdalar[id];
      const bilgi = oda.bilgi || {};
      const sahip = yonetimKullanicilar[bilgi.sahip] || {};
      const muzik = oda.muzik || {};
      const siraSayisi = Object.keys(muzik.sira || {}).length;
      return el("tr", {},
        el("td", {}, el("a", { href: "?oda=" + id }, bilgi.ad || id),
          bilgi.herkeseAcik === false ? el("span", { className: "soluk" }, " · gizli") : null),
        el("td", { className: "gizle-dar" }, sahip.ad || bilgi.sahipAdi || "—",
          sahip.eposta ? el("div", { className: "soluk" }, sahip.eposta) : null),
        el("td", {}, Object.keys(oda.katilanlar || {}).length),
        el("td", { className: "gizle-dar" }, muzik.simdiki ? muzik.simdiki.baslik.slice(0, 40) : "—",
          siraSayisi ? el("div", { className: "soluk" }, "+" + siraSayisi + " sırada") : null),
        el("td", { className: "gizle-dar" }, tarihYaz(bilgi.olusturma)),
        el("td", { className: "islemler" },
          el("button", { className: "tus-kucuk", title: "Müziği durdur ve sırayı temizle", onclick: () => yonetimMuzigiDurdur(id) }, "⏹"),
          el("button", { className: "tus-kucuk", title: "Geçmişi temizle", onclick: () => yonetimGecmisiTemizle(id) }, "🕘✕"),
          id !== ANA_ODA ? el("button", { className: "tus-kucuk", title: "Odayı sil", onclick: () => yonetimOdaSil(id) }, "🗑️") : null)
      );
    });
  $("yonetimOdalar").replaceChildren(satirlar.length
    ? el("table", { className: "tablo" },
      el("thead", {}, el("tr", {}, ["Oda", "Sahibi", "Kişi", "Çalan", "Açılış", ""].map((b, i) =>
        el("th", { className: i === 1 || i === 3 || i === 4 ? "gizle-dar" : "" }, b)))),
      el("tbody", {}, satirlar))
    : el("p", { className: "not" }, "Henüz oda yok."));
}

function yonetimKullanicilariniCiz() {
  const satirlar = Object.entries(yonetimKullanicilar)
    .sort((a, b) => (b[1].sonGiris || 0) - (a[1].sonGiris || 0))
    .map(([uid, k]) => {
      const odalari = [k.slot1, k.slot2].filter((id) => id && yonetimOdalar[id]);
      const yasak = yonetimYasaklilar[uid] === true;
      return el("tr", {},
        el("td", {}, el("div", { style: { display: "flex", alignItems: "center", gap: "0.5rem" } },
          avatarOgesi({ ad: k.ad, foto: k.foto }),
          el("div", {}, k.ad || "İsimsiz", yasak ? el("span", { className: "etiket-kirmizi" }, " · yasaklı") : null,
            el("div", { className: "soluk" }, k.eposta || "")))),
        el("td", { className: "gizle-dar" }, odalari.map((id) => (yonetimOdalar[id].bilgi || {}).ad || id).join(", ") || "—"),
        el("td", { className: "gizle-dar" }, Object.keys(k.listeler || {}).length + " liste"),
        el("td", { className: "gizle-dar" }, tarihYaz(k.sonGiris)),
        el("td", { className: "islemler" },
          kullanici && uid === kullanici.uid ? el("span", { className: "soluk" }, "sen") :
            el("button", {
              className: yasak ? "tus-kucuk" : "tus-tehlike", style: { marginTop: 0 },
              onclick: () => yonetimYasakla(uid, k, !yasak)
            }, yasak ? "Yasağı kaldır" : "Yasakla"))
      );
    });
  $("yonetimKullanicilar").replaceChildren(satirlar.length
    ? el("table", { className: "tablo" },
      el("thead", {}, el("tr", {}, ["Kullanıcı", "Odaları", "Listeler", "Son giriş", ""].map((b, i) =>
        el("th", { className: i > 0 && i < 4 ? "gizle-dar" : "" }, b)))),
      el("tbody", {}, satirlar))
    : el("p", { className: "not" }, "Henüz giriş yapan kullanıcı yok."));
}

async function yonetimMuzigiDurdur(id) {
  if (!await onayla("Müziği durdur", "Bu odada çalan şarkı durdurulacak ve sıra temizlenecek.", "Durdur", true)) return;
  await db.ref("odalar/" + id + "/muzik").update({ simdiki: null, sira: null });
  bildir("Müzik durduruldu");
}

async function yonetimGecmisiTemizle(id) {
  if (!await onayla("Geçmişi temizle", "Bu odanın şarkı geçmişi silinecek.", "Temizle", true)) return;
  await db.ref("odaGecmisi/" + id).remove();
  bildir("Geçmiş temizlendi");
}

async function yonetimOdaSil(id) {
  const oda = yonetimOdalar[id] || {};
  if (!await onayla("Odayı sil", "“" + ((oda.bilgi || {}).ad || id) + "” odası kalıcı olarak silinecek.", "Sil", true)) return;
  await odaSil(id, oda.bilgi);
}

async function yonetimYasakla(uid, k, yasakla) {
  const ad = k.ad || "Bu kullanıcı";
  const mesaj = yasakla
    ? ad + " yeni oda açamaz ve odalarını düzenleyemez. Odaları silinmez; istersen onları ayrıca silebilirsin."
    : ad + " yeniden oda açabilir.";
  if (!await onayla(yasakla ? "Kullanıcıyı yasakla" : "Yasağı kaldır", mesaj, yasakla ? "Yasakla" : "Kaldır", yasakla)) return;
  await db.ref("yasakli/" + uid).set(yasakla ? true : null);
  bildir(yasakla ? "Kullanıcı yasaklandı" : "Yasak kaldırıldı");
}

$("yonetimKapat").addEventListener("click", yonetimiKapat);
$("yonetimPaneli").addEventListener("mousedown", (e) => { if (e.target === $("yonetimPaneli")) yonetimiKapat(); });
$("yonetimSekmeleri").addEventListener("click", (e) => {
  const tus = e.target.closest("button");
  if (!tus) return;
  $("yonetimSekmeleri").querySelectorAll("button").forEach((b) => b.classList.toggle("secili", b === tus));
  $("yonetimPaneli").querySelectorAll(".sekme-icerik").forEach((k) => { k.hidden = k.dataset.sekme !== tus.dataset.sekme; });
});
