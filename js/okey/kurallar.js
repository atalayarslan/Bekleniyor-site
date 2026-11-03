// Bekleniyor Okey 101 — oyun motoru. Okey/KURALLAR.md'deki kuralları uygular.
// Ekrandan bağımsızdır (DOM kullanmaz): tarayıcıda window.OkeyKurallar, Node'da require("./kurallar.js").
// Masa sunucusu da ileride aynı dosyayı kullanacak; hamleler hep buradan doğrulanır.
//
// Taş:        { id, r: 0-3 (kırmızı, mavi, siyah, sarı), n: 1-13 }
// Sahte okey: { id, sahte: true } — okeyin renk ve sayısını taşır, joker değildir.
// Okey:       { r, n } — göstergenin aynı renkte bir büyüğü; bu kimlikteki gerçek taşlar jokerdir.

(function (kok) {
  "use strict";

  const RENK_ADLARI = ["Kırmızı", "Mavi", "Siyah", "Sarı"];

  const VARSAYILAN = {
    esli: false,
    katlamali: true,
    baraj: 101,            // seriyle açma barajı
    ciftBaraji: 5,         // çiftle açma barajı
    acmayan: 202,          // el sonunda açamamış oyuncu
    bitiren: 101,          // bitiren eksi yazar
    gostergeCifti: true,   // çift açan, göstergenin aynısıyla göstergeyi çift yapabilir
    ceza: 101,           // işlek alınmadı, okey atma, hatalı açma, yandan alıp açamama, sıra dışı
    tasCarpani: 10,        // açtıran / işlek alınan taş: sayısı × bu
    elinOkeyi: 101,        // elde kalan her okey
    kOkey: 2, kCift: 2, kElden: 2,
    ciftKat: 2,            // çift açmış rakibin kalanı
    bitirenKatlanir: true,
    esYazmaz: true,
    onIkiOnUcBir: true,    // 12-13-1 serisi geçerli
    okeyDegistirme: true,
    elSayisi: 11,
    sure: 30
  };

  // ---------- Taşlar ----------

  function desteOlustur() {
    const deste = [];
    let id = 0;
    for (let kopya = 0; kopya < 2; kopya++) {
      for (let r = 0; r < 4; r++) {
        for (let n = 1; n <= 13; n++) deste.push({ id: "t" + id++, r, n });
      }
      deste.push({ id: "t" + id++, sahte: true });
    }
    return deste;
  }

  function karistir(dizi, rastgele = Math.random) {
    const kopya = dizi.slice();
    for (let i = kopya.length - 1; i > 0; i--) {
      const j = Math.floor(rastgele() * (i + 1));
      [kopya[i], kopya[j]] = [kopya[j], kopya[i]];
    }
    return kopya;
  }

  function okeyiBul(gosterge) {
    return { r: gosterge.r, n: (gosterge.n % 13) + 1 };
  }

  function okeyMi(tas, okey) {
    return !!tas && !tas.sahte && tas.r === okey.r && tas.n === okey.n;
  }

  // Taşın oyundaki kimliği: sahte okey okeyin yerine geçer
  function kimlik(tas, okey) {
    return tas.sahte ? { r: okey.r, n: okey.n } : { r: tas.r, n: tas.n };
  }

  // Başlayan 22, diğerleri 21 taş alır. Gösterge sahte okey olamaz (yeniden çekilir).
  function dagit({ rastgele = Math.random, baslayan = 0 } = {}) {
    const deste = karistir(desteOlustur(), rastgele);
    const gosterge = deste.splice(deste.findIndex((t) => !t.sahte), 1)[0];
    const eller = [[], [], [], []];
    for (let i = 0; i < 4; i++) eller[(baslayan + i) % 4] = deste.splice(0, i === 0 ? 22 : 21);
    return { gosterge, okey: okeyiBul(gosterge), eller, deste, baslayan };
  }

  // ---------- Perler ----------

  // Seri: verilen sırayla (ya da tersten) aynı renkte ardışık sayılar. Okeyler bulundukları yerin değerini alır.
  function seriCoz(taslar, okey, ayar) {
    const dene = (dizi) => {
      const k = dizi.findIndex((t) => !okeyMi(t, okey));
      const ilk = kimlik(dizi[k], okey);
      const bas = ilk.n - k;
      if (bas < 1) return null;
      const degerler = [];
      let puan = 0;
      for (let i = 0; i < dizi.length; i++) {
        const beklenen = bas + i;
        if (beklenen > (ayar.onIkiOnUcBir ? 14 : 13)) return null;
        const n = beklenen === 14 ? 1 : beklenen;  // 12-13-1: sondaki 1
        if (!okeyMi(dizi[i], okey)) {
          const t = kimlik(dizi[i], okey);
          if (t.r !== ilk.r || t.n !== n) return null;
        }
        degerler.push({ r: ilk.r, n });
        puan += n;
      }
      return { tur: "seri", puan, degerler };
    };
    const duz = dene(taslar);
    if (duz) return duz;
    const ters = dene(taslar.slice().reverse());
    return ters && Object.assign(ters, { degerler: ters.degerler.reverse(), ters: true });
  }

  // Küt: aynı sayının farklı renkleri, 3 ya da 4 taş. Okeyler eksik renklere geçer.
  function kutCoz(taslar, okey) {
    if (taslar.length > 4) return null;
    const gercek = taslar.filter((t) => !okeyMi(t, okey)).map((t) => kimlik(t, okey));
    const n = gercek[0].n;
    const renkler = new Set(gercek.map((t) => t.r));
    if (!gercek.every((t) => t.n === n) || renkler.size !== gercek.length) return null;
    const eksik = [0, 1, 2, 3].filter((r) => !renkler.has(r));
    const degerler = taslar.map((t) => (okeyMi(t, okey) ? { r: eksik.shift(), n } : kimlik(t, okey)));
    return { tur: "kut", puan: n * taslar.length, degerler };
  }

  // Seri ya da küt; ikisi de olabiliyorsa (okeyli kısa perler) puanı yüksek olan
  function perCoz(taslar, okey, ayar = VARSAYILAN) {
    if (!taslar || taslar.length < 3 || taslar.some((t) => !t)) return null;
    if (taslar.every((t) => okeyMi(t, okey))) return null;
    const secenekler = [seriCoz(taslar, okey, ayar), kutCoz(taslar, okey)].filter(Boolean);
    if (!secenekler.length) return null;
    return secenekler.sort((a, b) => b.puan - a.puan)[0];
  }

  function ciftMi(a, b, okey) {
    if (!a || !b) return false;
    if (okeyMi(a, okey) || okeyMi(b, okey)) return true;
    const x = kimlik(a, okey), y = kimlik(b, okey);
    return x.r === y.r && x.n === y.n;
  }

  // Gösterge çifti: göstergenin aynısı olan taş (sahte okey değil), masadaki göstergeyle çift sayılır.
  function gostergeCiftiMi(tas, gosterge, ayar = VARSAYILAN) {
    return !!(ayar.gostergeCifti && gosterge && tas && !tas.sahte && tas.r === gosterge.r && tas.n === gosterge.n);
  }

  // Istakadaki gruplar (yan yana duran taşlar) açılış olarak değerlendirilir.
  // Hepsi ikili ise (ya da tek başına duran göstergenin aynısı) çift açılışı, değilse seri açılışı sayılır.
  // gosterge: masada duruyorsa verilir; tek taşlık grup onunla çift sayılır (bir kez).
  function acilisDegerlendir(gruplar, okey, ayar = VARSAYILAN, gosterge = null) {
    gruplar = gruplar.filter((g) => g.length);
    if (!gruplar.length) return { tur: null, gecerli: false, deger: 0, hatalar: [] };
    const tekler = gruplar.filter((g) => g.length === 1);
    if (gruplar.every((g) => g.length <= 2) && tekler.length <= 1 && gruplar.some((g) => g.length === 2 || gostergeCiftiMi(g[0], gosterge, ayar))) {
      const gecerli = (g) => (g.length === 2 ? ciftMi(g[0], g[1], okey) : gostergeCiftiMi(g[0], gosterge, ayar));
      const hatalar = gruplar.map((g, i) => (gecerli(g) ? -1 : i)).filter((i) => i >= 0);
      return { tur: "cift", gecerli: !hatalar.length, deger: gruplar.length - hatalar.length, hatalar };
    }
    const hatalar = [];
    const perler = [];
    let deger = 0;
    gruplar.forEach((g, i) => {
      const p = perCoz(g, okey, ayar);
      if (!p) hatalar.push(i);
      else { perler.push(Object.assign({ taslar: g }, p)); deger += p.puan; }
    });
    return { tur: "seri", gecerli: !hatalar.length, deger, hatalar, perler };
  }

  // Katlamalıda açma barajı: rakiplerin en yüksek açılışının bir fazlası (eşli oyunda eşin açılışı sayılmaz).
  // acilislar: [{ oyuncu, tur: "seri"|"cift", deger }]
  function acmaBaraji(acilislar, tur, oyuncu, ayar = VARSAYILAN) {
    const taban = tur === "cift" ? ayar.ciftBaraji : ayar.baraj;
    if (!ayar.katlamali) return taban;
    const esi = (oyuncu + 2) % 4;
    const rakip = acilislar.filter((a) => a.tur === tur && a.oyuncu !== oyuncu && !(ayar.esli && a.oyuncu === esi));
    return Math.max(taban, ...rakip.map((a) => a.deger + 1));
  }

  // Masadaki bir pere taş işlenebilir mi? İşlenebilirse yeni dizilişi döner (seriye iki uçtan, küte eksik renk).
  function isle(per, tas, okey, ayar = VARSAYILAN) {
    if (per.tur === "cift") return null;
    for (const dizi of [[...per.taslar, tas], [tas, ...per.taslar]]) {
      const p = perCoz(dizi, okey, ayar);
      if (p && p.tur === per.tur) return Object.assign({ taslar: dizi }, p);
    }
    return null;
  }

  // İşlek taş: masadaki herhangi bir pere işlenebilen taş. Okey her zaman işlektir.
  function islekMi(tas, perler, okey, ayar = VARSAYILAN) {
    if (okeyMi(tas, okey)) return true;
    return perler.some((p) => isle(p, tas, okey, ayar));
  }

  // Okey değiştirme: perdeki okeyin yerine geçtiği gerçek taş konur, okey alınır. Kütte 4 renk tamam olmalı.
  function okeyDegistir(per, tas, okey, ayar = VARSAYILAN) {
    if (!ayar.okeyDegistirme || per.tur === "cift" || okeyMi(tas, okey)) return null;
    if (per.tur === "kut" && per.taslar.length < 4) return null;
    const t = kimlik(tas, okey);
    const i = per.taslar.findIndex((x, k) => okeyMi(x, okey) && per.degerler[k].r === t.r && per.degerler[k].n === t.n);
    if (i < 0) return null;
    const taslar = per.taslar.slice();
    const alinan = taslar.splice(i, 1, tas)[0];
    return { per: Object.assign({ taslar }, perCoz(taslar, okey, ayar)), alinan };
  }

  // ---------- Puan ----------

  function tasDegeri(tas, okey, ayar = VARSAYILAN) {
    return okeyMi(tas, okey) ? ayar.elinOkeyi : kimlik(tas, okey).n;
  }

  function kalanPuani(el, okey, ayar = VARSAYILAN) {
    return el.filter(Boolean).reduce((t, tas) => t + tasDegeri(tas, okey, ayar), 0);
  }

  // El sonu. bitis: { okey, elden, cift } (bitirenin nasıl bitirdiği).
  // oyuncular: [{ acti, ciftActi, el: [taşlar] }]. Dönen: her oyuncunun bu eldeki puanı.
  // Okey-hesap.html'deki hesapla aynıdır: çarpanlar çarpılır, bitirenin puanı da katlanır (ayar).
  function elSonu({ bitiren, bitis = {}, oyuncular, okey, ayar = VARSAYILAN }) {
    let kat = 1;
    if (bitis.okey) kat *= ayar.kOkey;
    if (bitis.elden) kat *= ayar.kElden;
    if (bitis.cift) kat *= ayar.kCift;
    return oyuncular.map((o, i) => {
      if (i === bitiren) return -ayar.bitiren * (ayar.bitirenKatlanir ? kat : 1);
      if (ayar.esli && ayar.esYazmaz && (i + 2) % 4 === bitiren) return 0;
      if (!o.acti) return ayar.acmayan * kat;
      return kalanPuani(o.el, okey, ayar) * kat * (o.ciftActi ? ayar.ciftKat : 1);
    });
  }

  // Deste bitti, kimse bitiremedi: açanlar kalanını, açamayanlar açamayan cezasını yazar.
  function desteBitti({ oyuncular, okey, ayar = VARSAYILAN }) {
    return oyuncular.map((o) => (o.acti ? kalanPuani(o.el, okey, ayar) * (o.ciftActi ? ayar.ciftKat : 1) : ayar.acmayan));
  }

  // Cezalar. tur: "acTiranTas" | "islekAlindi" (taş × 10) ya da "islekAlinmadi" | "okeyAtma" | "hataliAcma"
  // | "yandanAcamama" | "siraDisi" | "geriToplama" (sabit ceza). Açtıran taş okeyse okeyin sayısı kullanılır.
  function ceza(tur, tas, okey, ayar = VARSAYILAN) {
    if (tur === "acTiranTas" || tur === "islekAlindi") {
      const n = okeyMi(tas, okey) ? okey.n : kimlik(tas, okey).n;
      return n * ayar.tasCarpani;
    }
    return ayar.ceza;
  }

  // ---------- Istaka yardımcıları ----------

  // Istakadaki dizilişten gruplar: aynı satırda yan yana duran taşlar bir gruptur (boşluk ayırır).
  // yuvalar: satır satır dizi (null = boş yuva), satirUzunlugu: bir satırdaki yuva sayısı.
  function gruplariBul(yuvalar, satirUzunlugu) {
    const gruplar = [];
    let grup = [];
    yuvalar.forEach((t, i) => {
      if (i % satirUzunlugu === 0 && grup.length) { gruplar.push(grup); grup = []; }
      if (t) grup.push(t);
      else if (grup.length) { gruplar.push(grup); grup = []; }
    });
    if (grup.length) gruplar.push(grup);
    return gruplar;
  }

  // Seri diz: eldeki taşlardan (okeyler dahil) toplam puanı en yüksek per dizilişini bulur; perler önde,
  // per olmayan taşlar renk ve sayı sırasıyla arkada, kullanılmayan okeyler en sonda.
  // Dönen dizi gruplar arasında null (boşluk) içerir.
  //
  // Nasıl: önce kurulabilecek bütün perler aday olarak çıkarılır (her renkte her başlangıç ve uzunlukta seri,
  // her sayıda 3'lü/4'lü küt). Elde olmayan taşların yerine okey geçer, yeter ki okey sayısı yetsin.
  // Sonra birbirine taş paylaşmayan adaylardan toplamı en yüksek olan seçim aranır (yüksek puanlı adaylardan
  // başlanır, kalan taşların değeri bile yetmiyorsa o dal bırakılır). Arama çok uzarsa o ana kadarki en iyisi alınır.
  function seriDiz(el, okey, ayar = VARSAYILAN) {
    const okeyler = el.filter((t) => okeyMi(t, okey));
    const normal = el.filter((t) => !okeyMi(t, okey));
    const anahtar = (r, n) => r * 14 + n;
    const havuz = new Map();             // kimlik -> o kimlikteki taşlar
    for (const t of normal) {
      const k = kimlik(t, okey);
      const a = anahtar(k.r, k.n);
      if (!havuz.has(a)) havuz.set(a, []);
      havuz.get(a).push(t);
    }
    const varMi = (r, n) => havuz.has(anahtar(r, n));
    const J = okeyler.length;

    // Adaylar: kimlikler (sırasıyla) ve puan
    const adaylar = [];
    const enUst = ayar.onIkiOnUcBir ? 14 : 13;
    for (let r = 0; r < 4; r++) {
      for (let bas = 1; bas <= 12; bas++) {
        const kimlikler = [];
        let eksik = 0, puan = 0;
        for (let v = bas; v <= enUst; v++) {
          if (v === 14 && bas === 1) break;          // 1 hem başta hem sonda olamaz
          const n = v === 14 ? 1 : v;
          kimlikler.push({ r, n });
          puan += n;
          if (!varMi(r, n)) eksik++;
          if (eksik > J) break;
          if (kimlikler.length >= 3 && eksik < kimlikler.length) adaylar.push({ tur: "seri", kimlikler: kimlikler.slice(), puan });
        }
      }
    }
    const altKumeler = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2, 3]];
    for (let n = 1; n <= 13; n++) {
      for (const renkler of altKumeler) {
        const eksik = renkler.filter((r) => !varMi(r, n)).length;
        if (eksik <= J && eksik < renkler.length) adaylar.push({ tur: "kut", kimlikler: renkler.map((r) => ({ r, n })), puan: n * renkler.length });
      }
    }
    adaylar.sort((a, b) => b.puan - a.puan);

    // Arama
    const sayilar = new Map([...havuz].map(([a, t]) => [a, t.length]));
    let kalanDeger = normal.reduce((t, x) => t + kimlik(x, okey).n, 0);
    let enIyi = { puan: 0, taslar: 0, secim: [] };
    let dugum = 0;
    const secim = [];
    const ara = (i, jKalan, puan, taslar) => {
      if (++dugum > 60000) return;
      if (puan > enIyi.puan || (puan === enIyi.puan && taslar > enIyi.taslar)) enIyi = { puan, taslar, secim: secim.slice() };
      if (puan + kalanDeger + jKalan * 13 <= enIyi.puan) return;
      for (let k = i; k < adaylar.length; k++) {
        const a = adaylar[k];
        const kullanilan = [];
        let joker = 0;
        for (const { r, n } of a.kimlikler) {
          const ak = anahtar(r, n);
          if (sayilar.get(ak) > 0) { sayilar.set(ak, sayilar.get(ak) - 1); kullanilan.push(ak); }
          else joker++;
        }
        if (joker <= jKalan && kullanilan.length) {
          const deger = kullanilan.reduce((t, ak) => t + (ak % 14), 0);
          kalanDeger -= deger;
          secim.push(a);
          ara(k, jKalan - joker, puan + a.puan, taslar + a.kimlikler.length);   // aynı aday ikinci kopyalarla yeniden seçilebilir
          secim.pop();
          kalanDeger += deger;
        }
        for (const ak of kullanilan) sayilar.set(ak, sayilar.get(ak) + 1);
      }
    };
    ara(0, J, 0, 0);

    // Seçilen perleri gerçek taşlarla kur (olmayan yerlere okey)
    const kalanTaslar = new Map([...havuz].map(([a, t]) => [a, t.slice()]));
    const bosOkeyler = okeyler.slice();
    const perler = enIyi.secim.map((a) => a.kimlikler.map(({ r, n }) => {
      const liste = kalanTaslar.get(anahtar(r, n));
      return liste && liste.length ? liste.shift() : bosOkeyler.shift();
    }));
    const kalan = [...kalanTaslar.values()].flat()
      .sort((a, b) => kimlik(a, okey).r - kimlik(b, okey).r || kimlik(a, okey).n - kimlik(b, okey).n);
    return birlestir([...perler, kalan, bosOkeyler]);
  }

  // Istakada yan yana duran bir grubun içindeki en iyi perler. Grubun tamamı per olmasa da (yanında ilgisiz
  // bir taş varsa) içindeki ardışık geçerli parçalar sayılır; toplamı en yüksek olan parçalar seçilir.
  function gruptakiPerler(grup, okey, ayar = VARSAYILAN) {
    const n = grup.length;
    const enIyi = Array(n + 1).fill(0);
    const bas = Array(n + 1).fill(-1);
    for (let i = 1; i <= n; i++) {
      enIyi[i] = enIyi[i - 1];
      for (let j = i - 3; j >= 0; j--) {
        const p = perCoz(grup.slice(j, i), okey, ayar);
        if (p && enIyi[j] + p.puan > enIyi[i]) { enIyi[i] = enIyi[j] + p.puan; bas[i] = j; }
      }
    }
    const perler = [];
    for (let i = n; i > 0;) {
      if (bas[i] < 0 || enIyi[i] === enIyi[i - 1]) { i--; continue; }
      perler.unshift(grup.slice(bas[i], i));
      i = bas[i];
    }
    return perler;
  }

  // Grubun içindeki yan yana çiftler (soldan sağa)
  function gruptakiCiftler(grup, okey) {
    const ciftler = [];
    for (let i = 0; i + 1 < grup.length; i++) {
      if (ciftMi(grup[i], grup[i + 1], okey)) { ciftler.push([grup[i], grup[i + 1]]); i++; }
    }
    return ciftler;
  }

  // Çift diz: aynı taşlar yan yana ikişer, sonra (masada gösterge varsa) göstergenin aynısı tek başına
  // (göstergeyle çift olur), sonra tekler, okeyler en sonda
  function ciftDiz(el, okey, gosterge = null, ayar = VARSAYILAN) {
    const okeyler = el.filter((t) => okeyMi(t, okey));
    const kalan = el.filter((t) => !okeyMi(t, okey))
      .sort((a, b) => kimlik(a, okey).r - kimlik(b, okey).r || kimlik(a, okey).n - kimlik(b, okey).n);
    const ciftler = [];
    let tekler = [];
    for (let i = 0; i < kalan.length; i++) {
      if (i + 1 < kalan.length && ciftMi(kalan[i], kalan[i + 1], okey)) { ciftler.push([kalan[i], kalan[i + 1]]); i++; }
      else tekler.push(kalan[i]);
    }
    const gc = tekler.find((t) => gostergeCiftiMi(t, gosterge, ayar));
    if (gc) tekler = tekler.filter((t) => t !== gc);
    const enYuksegiAl = () => {
      const en = tekler.reduce((en, t) => (!en || kimlik(t, okey).n > kimlik(en, okey).n ? t : en), null);
      tekler = tekler.filter((t) => t !== en);
      return en;
    };
    // Her okey teklerin en yükseğiyle çift olur (puanı en yüksek taşlar okeyle değerlenir)
    const okeyCiftleri = [];
    const bosOkeyler = [];
    for (const o of okeyler) {
      const en = enYuksegiAl();
      if (en) okeyCiftleri.push([en, o]);
      else bosOkeyler.push(o);
    }
    // Göstergenin aynısı göstergeyle çift sayılır; yanına (oyuncuların alışkanlığıyla) kalan teklerin en yükseği konur
    if (gc) {
      const en = enYuksegiAl();
      okeyCiftleri.push(en ? [gc, en] : [gc]);
    }
    return birlestir([...ciftler, ...okeyCiftleri, tekler, bosOkeyler]);
  }

  // Istakadaki çiftler: yan yana duran çiftler; ayrıca (gösterge masadaysa) göstergenin aynısı nerede durursa
  // dursun — yanında başka taş olsa da — göstergeyle çift sayılır (bir kez). Gösterge çifti [taş] olarak döner.
  function istakadakiCiftler(gruplar, okey, gosterge = null, ayar = VARSAYILAN) {
    const ciftler = gruplar.flatMap((g) => gruptakiCiftler(g, okey));
    const kullanilan = new Set(ciftler.flat());
    const gc = gruplar.flat().find((t) => !kullanilan.has(t) && gostergeCiftiMi(t, gosterge, ayar));
    if (gc) ciftler.push([gc]);
    return ciftler;
  }

  // Dizilişi (gruplar arasında null) ıstaka yuvalarına yerleştirir. Gruplar arasında hep bir boşluk kalır
  // (yoksa yan yana gelen iki per tek grup sayılır). Satır sonuna sığmayan grup alt satıra geçer.
  // Yer yetmezse önce alt satıra geçirme bırakılır, sonra sondaki gruplar (dizmede en sonda duran
  // per olmayan taşlar ve okeyler) birleştirilir; perlerin arasındaki boşluklara asla taş konmaz.
  function istakayaYerlestir(dizi, yuvaSayisi = 30, satir = 15) {
    let gruplar = [];
    let g = [];
    for (const t of dizi) {
      if (t) g.push(t);
      else if (g.length) { gruplar.push(g); g = []; }
    }
    if (g.length) gruplar.push(g);
    const dene = (satiraGecir) => {
      const sonuc = Array(yuvaSayisi).fill(null);
      let i = 0;
      for (let k = 0; k < gruplar.length; k++) {
        const grup = gruplar[k];
        const satirSonu = (Math.floor(i / satir) + 1) * satir;
        if (satiraGecir && i % satir && i + grup.length > satirSonu && grup.length <= satir && satirSonu < yuvaSayisi) i = satirSonu;
        if (i + grup.length > yuvaSayisi) return null;
        for (const t of grup) sonuc[i++] = t;
        if (k < gruplar.length - 1 && i % satir) i++;   // gruplar arası boşluk (satır sonu zaten ayırır)
      }
      return sonuc;
    };
    for (;;) {
      const sonuc = dene(true) || dene(false);
      if (sonuc) return sonuc;
      if (gruplar.length < 2) break;
      gruplar = [...gruplar.slice(0, -2), [...gruplar[gruplar.length - 2], ...gruplar[gruplar.length - 1]]];
    }
    const taslar = dizi.filter(Boolean);
    return Array.from({ length: yuvaSayisi }, (_, i) => taslar[i] || null);
  }

  function birlestir(gruplar) {
    const sonuc = [];
    gruplar.filter((g) => g.length).forEach((g, i) => {
      if (i) sonuc.push(null);
      sonuc.push(...g);
    });
    return sonuc;
  }

  const OkeyKurallar = {
    RENK_ADLARI, VARSAYILAN,
    desteOlustur, karistir, okeyiBul, okeyMi, kimlik, dagit,
    perCoz, ciftMi, gostergeCiftiMi, acilisDegerlendir, acmaBaraji, isle, islekMi, okeyDegistir,
    tasDegeri, kalanPuani, elSonu, desteBitti, ceza,
    gruplariBul, gruptakiPerler, gruptakiCiftler, istakadakiCiftler, seriDiz, ciftDiz, istakayaYerlestir
  };
  if (typeof module !== "undefined" && module.exports) module.exports = OkeyKurallar;
  else kok.OkeyKurallar = OkeyKurallar;
})(typeof window !== "undefined" ? window : globalThis);
