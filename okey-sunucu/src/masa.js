// Odanın okey masası (Cloudflare Durable Object; her oda için bir tane). Deste, eller ve bütün hamle doğrulaması
// burada; oyunculara WebSocket ile sadece görmeleri gerekeni gönderir (kendi taşları; yancıya oturduğu oyuncunun
// taşları). Kurallar sitedeki motorla aynı dosyadan gelir (js/okey/kurallar.js). Ayrıntılar: Okey/KURALLAR.md
//
// İstemci → sunucu: { t: "merhaba", kart?, misafir?: { id, ad }, ad?, foto? }   (ilk mesaj; kart = Firebase ID token)
//   "otur" {koltuk} · "kalk" · "yanci" {koltuk|null} · "ayar" {esli?, elSayisi?, sure?, atilanlarGorunur?} · "basla" · "sonraki"
//   "bot" {koltuk} · "botCikar" {koltuk}   (masada oturan boş koltuğa bot koyar; bot sunucuda oynar)
//   "cek" · "soldanAl" · "geriBirak" · "at" {id} · "ac" {gruplar: [[id]]} · "isle" {id, per}
// Sunucu → istemci: { t: "guncel", olaylar: [...], durum: {...} } (kişiye özel) · { t: "hata", metin }

import K from "../../js/okey/kurallar.js";
import { kartiDogrula } from "./kimlik.js";

const YONETICI = "erayaksuhome@outlook.com";
const DB = "https://bekleniyor-e16eb-default-rtdb.europe-west1.firebasedatabase.app";
const KOLTUK_BEKLEME = 120 * 1000;   // bağlantısı kopanın koltuğu bu kadar onun için tutulur
const BOT_BEKLEME = 1600;            // botun sırası gelince oynamadan önce bekleme (ms)
const BOT_ADLARI = ["Bot Ayşe", "Bot Mehmet", "Bot Zeynep", "Bot Can"];

const yeniMasa = () => ({
  oda: null, ayar: { esli: false, elSayisi: 11, sure: 30, atilanlarGorunur: true }, kurucu: null,
  koltuklar: [null, null, null, null], oyun: null, el: null, baslayan: 0
});
const temizAd = (s, v) => String(s || v).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) || v;

export class OkeyMasasi {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.m = null;
    this.sahip = { uid: null, zaman: 0 };
    ctx.blockConcurrencyWhile(async () => { this.m = (await ctx.storage.get("m")) || yeniMasa(); });
  }

  // ---------- bağlantı ----------
  async fetch(istek) {
    const url = new URL(istek.url);
    if (!this.m.oda && url.searchParams.get("oda")) this.m.oda = url.searchParams.get("oda");
    if (url.pathname.startsWith("/cetele")) {
      const oyunlar = (await this.ctx.storage.get("oyunlar")) || [];
      return Response.json({ oda: this.m.oda, oyunlar });
    }
    if (istek.headers.get("Upgrade") !== "websocket") return new Response("WebSocket bekleniyor", { status: 426 });
    const [istemci, sunucu] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(sunucu);
    sunucu.serializeAttachment({ kim: null });
    return new Response(null, { status: 101, webSocket: istemci });
  }

  async webSocketMessage(ws, veri) {
    if (typeof veri !== "string" || veri.length > 4096) return;
    let mesaj;
    try { mesaj = JSON.parse(veri); } catch (e) { return; }
    const ben = ws.deserializeAttachment() || {};
    if (mesaj.t === "merhaba") return this.merhaba(ws, mesaj);
    if (!ben.kim) return;
    this.olaylar = [];
    try {
      const sonuc = await this.isle_(ben, ws, mesaj);
      if (typeof sonuc === "string") ws.send(JSON.stringify({ t: "hata", metin: sonuc }));
    } catch (e) {
      ws.send(JSON.stringify({ t: "hata", metin: "Sunucu hatası: " + e.message }));
    }
    await this.kaydet();
    this.yayinla();
  }

  // Bağlantı koptu: başka sekmesi de yoksa koltuğu bir süre onun için tutulur (geri gelirse devam eder)
  async webSocketClose(ws) { await this.koptu(ws); }
  async webSocketError(ws) { await this.koptu(ws); }
  async koptu(ws) {
    const ben = ws.deserializeAttachment() || {};
    const k = ben.kim ? this.koltugum(ben.kim) : -1;
    if (k >= 0 && !this.baglilar().some((x) => x.ws !== ws && x.ben.kim === ben.kim)) {
      this.m.koltuklar[k].ayrildi = Date.now();
      this.alarmKur();
      await this.kaydet();
    }
    this.olaylar = [];
    this.yayinla(ws);
  }

  // Bağlantısı olmayan oyuncuları işaretler: sunucu güncellenince/yeniden başlayınca kapanış haberi gelmeyebilir,
  // ayrıldı zamanı olmayan kopuk koltuk sonsuza dek "bağlantı yok" kalmasın. El sürmüyorsa tutma süresi geçen koltuk
  // boşalır (insan kalmadıysa botlar da kalkar). Bir şey değiştiyse true döner.
  kopuklariIsle() {
    const m = this.m;
    const bagli = new Set(this.baglilar().map((x) => x.ben.kim));
    const oyunSuruyor = m.el && !m.el.bitti;
    let degisti = false;
    m.koltuklar.forEach((x, i) => {
      if (!x || x.bot || bagli.has(x.kim)) return;
      if (!x.ayrildi) { x.ayrildi = Date.now(); degisti = true; }
      else if (!oyunSuruyor && Date.now() - x.ayrildi >= KOLTUK_BEKLEME) { m.koltuklar[i] = null; degisti = true; }
    });
    if (degisti && !oyunSuruyor) this.insanKalmadiysa();
    return degisti;
  }

  // Masada (botlar dışında) kimse kalmadı: botlar da kalkar, kurucu yok, yarım oyun kapanır
  // (yeni gelen türü/el sayısını seçebilsin)
  insanKalmadiysa() {
    const m = this.m;
    if (m.koltuklar.some((x) => x && !x.bot)) return;
    m.kurucu = null;
    m.koltuklar = [null, null, null, null];
    if (m.oyun && !m.oyun.bitis) m.oyun.bitis = Date.now();
  }

  // Tek alarm iki işe bakar: sıradakinin süresi ve el sürmüyorken kopuk koltuğun boşalma zamanı
  alarmKur() {
    const m = this.m;
    const zamanlar = [];
    if (m.el && !m.el.bitti) zamanlar.push(m.el.sureBitis);
    else for (const x of m.koltuklar) if (x && !x.bot && x.ayrildi) zamanlar.push(x.ayrildi + KOLTUK_BEKLEME);
    if (zamanlar.length) this.ctx.storage.setAlarm(Math.max(Date.now(), Math.min(...zamanlar)));
    else this.ctx.storage.deleteAlarm();
  }

  async merhaba(ws, mesaj) {
    let ben;
    const kart = mesaj.kart ? await kartiDogrula(mesaj.kart) : null;
    if (kart) {
      ben = { kim: "u:" + kart.uid, uid: kart.uid, ad: temizAd(mesaj.ad || kart.ad.split(" ")[0], "Oyuncu"),
        foto: /^https:\/\/lh\d\.googleusercontent\.com\//.test(kart.foto) ? kart.foto : "",
        yonetici: kart.epostaDogrulandi && kart.eposta === YONETICI };
    } else if (mesaj.misafir && /^[a-z0-9]{12,32}$/.test(mesaj.misafir.id)) {
      ben = { kim: "m:" + mesaj.misafir.id, uid: null, ad: temizAd(mesaj.misafir.ad, "Misafir"), foto: "", yonetici: false };
    } else {
      return ws.send(JSON.stringify({ t: "hata", metin: "Kimlik okunamadı" }));
    }
    ben.yanci = null;
    ws.serializeAttachment(ben);
    // Koltuğuna geri dönen oyuncu: adı/fotoğrafı güncellenir
    const k = this.koltugum(ben.kim);
    if (k >= 0) {
      Object.assign(this.m.koltuklar[k], { ad: ben.ad, foto: ben.foto, ayrildi: null });
      if (this.m.oyun && !this.m.oyun.bitis && this.m.oyun.oyuncular[k]) this.m.oyun.oyuncular[k].ad = ben.ad;
    }
    if (this.kopuklariIsle()) this.alarmKur();
    this.sahibiOgren();   // beklenmez: oda sahibi bilgisi arkada gelir, bağlantı hemen cevap alır
    this.olaylar = [];
    await this.kaydet();
    this.yayinla();
  }

  async sahibiOgren() {
    if (!this.m.oda || Date.now() - this.sahip.zaman < 10 * 60 * 1000) return;
    try {
      const uid = await (await fetch(DB + "/odalar/" + encodeURIComponent(this.m.oda) + "/bilgi/sahip.json")).json();
      this.sahip = { uid: typeof uid === "string" ? uid : null, zaman: Date.now() };
    } catch (e) { }
  }

  async kaydet() { await this.ctx.storage.put("m", this.m); }

  baglilar() { return this.ctx.getWebSockets().map((ws) => ({ ws, ben: ws.deserializeAttachment() || {} })).filter((x) => x.ben.kim); }

  // Herkese kendine özel durumu gönder (kapanan bağlantı hariç)
  yayinla(haric) {
    const bagli = new Set(this.baglilar().filter((x) => x.ws !== haric).map((x) => x.ben.kim));
    for (const { ws, ben } of this.baglilar()) {
      if (ws === haric) continue;
      try { ws.send(JSON.stringify({ t: "guncel", olaylar: this.olaylar || [], durum: this.gorunum(ben, bagli) })); } catch (e) { }
    }
  }

  koltugum(kim) { return this.m.koltuklar.findIndex((k) => k && k.kim === kim); }
  yetkili(ben) { return ben.yonetici || (ben.uid && ben.uid === this.sahip.uid); }
  botMu(k) { const x = this.m.koltuklar[k]; return !!(x && x.bot); }
  // Açmış oyuncu bu türde (seri/çift) koyabilir mi: kendi açtığı türse ya da masada o türle açmış başka biri varsa
  turSerbest(k, tur) {
    const acti = this.m.el.acti;
    return acti[k] === tur || acti.some((x, i) => i !== k && x === tur);
  }
  // Koltuktaki kişinin bağlantısı yok: yerine hemen bot konabilir ya da başkası oturabilir (bot da koltuğunu bırakır).
  // Giden geri gelirse koltuğu boşsa ya da bottaysa yeniden oturur. Tutma süresi sadece el aralarında koltuğu boşaltmak için.
  bosaldi(kol) {
    if (kol.bot) return true;
    const bagli = this.baglilar().some((x) => x.ben.kim === kol.kim);
    return !bagli && !!kol.ayrildi;
  }

  // ---------- mesajlar ----------
  async isle_(ben, ws, mesaj) {
    const m = this.m;
    const E = m.el;
    const k = this.koltugum(ben.kim);
    const oyunSuruyor = E && !E.bitti;
    switch (mesaj.t) {
      case "otur": {
        const h = Number(mesaj.koltuk);
        if (!(h >= 0 && h < 4)) return "Geçersiz koltuk";
        if (k === h) return;
        if (k >= 0) {
          // Koltuk değiştirme: sadece oyun yokken ya da bitmişken (çetelede puanlar koltuğa yazılır), boş koltuğa
          if (oyunSuruyor || (m.oyun && !m.oyun.bitis)) return "Oyun sürerken koltuk değiştirilemez";
          if (m.koltuklar[h]) return "Bu koltuk dolu";
          m.koltuklar[h] = m.koltuklar[k];
          m.koltuklar[k] = null;
          return;
        }
        // Koltuk boşsa, botsa ya da sahibi bağlı değil ve tutma süresi geçtiyse oturulur (oyun sürüyorsa eli devralınır)
        const kol = m.koltuklar[h];
        if (kol && !this.bosaldi(kol)) return "Bu koltuk dolu";
        if (!m.koltuklar.some((x) => x && !x.bot) && !oyunSuruyor) m.kurucu = ben.kim;
        m.koltuklar[h] = { kim: ben.kim, ad: ben.ad, foto: ben.foto, ayrildi: null };
        // Botun (ya da gidenin) yerine oturan: çetelede o koltuk artık onun adıyla görünür
        if (m.oyun && !m.oyun.bitis && m.oyun.oyuncular[h]) m.oyun.oyuncular[h].ad = ben.ad;
        ben.yanci = null;
        ws.serializeAttachment(ben);
        if (oyunSuruyor && E.sira === h) this.sureyiKur();   // botun kısa süresi yerine oyuncunun tur süresi
        return;
      }
      case "kalk":
        if (k < 0) return;
        // Oyun sürüyorsa eli masada kalır; koltuğa başkası oturup devam edebilir, kimse oturmazsa süre dolunca oynanır
        m.koltuklar[k] = oyunSuruyor ? Object.assign({}, m.koltuklar[k], { ayrildi: 1, kim: "bos:" + k }) : null;
        // El sürüyorsa kalkanın koltuğu dolu kaldığı için masa boşalmış sayılmaz
        if (!oyunSuruyor) { this.insanKalmadiysa(); this.alarmKur(); }
        return;
      case "bot": {
        if (k < 0 && !this.yetkili(ben)) return "Bot eklemek için önce masaya otur";
        const h = Number(mesaj.koltuk);
        if (!(h >= 0 && h < 4)) return "Geçersiz koltuk";
        const kol = m.koltuklar[h];
        if (kol && (kol.bot || !this.bosaldi(kol))) return "Bu koltuk dolu";
        m.koltuklar[h] = { kim: "bot:" + h, ad: BOT_ADLARI[h], foto: "", ayrildi: null, bot: true };
        if (oyunSuruyor) {
          if (m.oyun.oyuncular[h]) m.oyun.oyuncular[h].ad = BOT_ADLARI[h];
          if (E.sira === h) this.sureyiKur();
        }
        return;
      }
      case "botCikar": {
        if (k < 0 && !this.yetkili(ben)) return "Botu çıkarmak için önce masaya otur";
        const h = Number(mesaj.koltuk);
        if (!this.botMu(h)) return "Bu koltukta bot yok";
        if (oyunSuruyor) return "El sürerken bot çıkarılamaz; el bitince çıkarabilirsin";
        m.koltuklar[h] = null;
        return;
      }
      // Çeteleyi temizleme: sadece oda sahibi (ve yönetici). Tek oyun ({id}) ya da hepsi; süren oyun silinmez.
      case "ceteleSil": {
        if (!this.yetkili(ben)) return "Çeteleyi sadece oda sahibi silebilir";
        const suren = m.oyun && !m.oyun.bitis ? m.oyun.id : null;
        if (mesaj.id && mesaj.id === suren) return "Süren oyun silinemez; oyun bitince silebilirsin";
        const oyunlar = (await this.ctx.storage.get("oyunlar")) || [];
        const kalan = mesaj.id ? oyunlar.filter((o) => o.id !== mesaj.id) : oyunlar.filter((o) => o.id === suren);
        await this.ctx.storage.put("oyunlar", kalan);
        // Bitmiş oyun silindiyse masadaki kaydı da gider (çetelede yeniden görünmesin)
        if (m.oyun && m.oyun.bitis && (!mesaj.id || mesaj.id === m.oyun.id)) m.oyun = null;
        this.olaylar.push({ tur: "ceteleSilindi" });
        return;
      }
      // İşlek gösterme: sıra kimde olursa olsun masada oturan herkes yapabilir
      case "islekGoster":
        if (k < 0) return "Önce masaya otur";
        if (!oyunSuruyor) return "El sürmüyor";
        return this.islekGoster(k, Number(mesaj.per));
      case "yanci": {
        if (k >= 0) return "Oyuncular yancı olamaz";
        const h = mesaj.koltuk == null ? null : Number(mesaj.koltuk);
        ben.yanci = h >= 0 && h < 4 ? h : null;
        ws.serializeAttachment(ben);
        return;
      }
      case "ayar": {
        const kurucuMu = m.kurucu === ben.kim;
        if ("sure" in mesaj) {
          if (!this.yetkili(ben)) return "Tur süresini sadece oda sahibi değiştirebilir";
          m.ayar.sure = Math.max(10, Math.min(120, Math.round(Number(mesaj.sure) || 30)));
        }
        if ("esli" in mesaj || "elSayisi" in mesaj) {
          if (!kurucuMu && !this.yetkili(ben)) return "Oyun türünü masayı kuran seçer";
          if (m.oyun && !m.oyun.bitis) return "Oyun sürerken değiştirilemez";
          if ("esli" in mesaj) m.ayar.esli = !!mesaj.esli;
          if ("elSayisi" in mesaj) m.ayar.elSayisi = Math.max(0, Math.min(99, Math.round(Number(mesaj.elSayisi) || 0)));
        }
        // Yandaki yığınlarda daha önce atılan taşlar görülsün mü (kapalıysa yalnız en üstteki görünür)
        if ("atilanlarGorunur" in mesaj) {
          if (!kurucuMu && !this.yetkili(ben)) return "Bunu masayı kuran seçer";
          m.ayar.atilanlarGorunur = !!mesaj.atilanlarGorunur;
        }
        return;
      }
      case "basla":
      case "sonraki":
        if (k < 0) return "Önce bir koltuğa otur";
        if (oyunSuruyor) return "El sürüyor";
        if (m.koltuklar.some((x) => !x || x.ayrildi)) return "Masa dolmadan başlanamaz (4 kişi)";
        return this.yeniEl();
    }
    // Oyun hamleleri: sadece sırası gelen oyuncu
    if (!oyunSuruyor) return "El başlamadı";
    if (k < 0) return "Masada değilsin";
    if (E.sira !== k) return "Sıra sende değil";
    switch (mesaj.t) {
      case "cek": return this.cek(k);
      case "soldanAl": return this.soldanAl(k);
      case "geriBirak": return this.geriBirak(k);
      case "at": return this.at(k, String(mesaj.id));
      case "ac": return this.ac(k, mesaj.gruplar);
      case "isle": return this.isle(k, String(mesaj.id), Number(mesaj.per));
    }
    return "Bilinmeyen istek";
  }

  // ---------- el ----------
  ayar() { return Object.assign({}, K.VARSAYILAN, this.m.ayar); }

  yeniEl() {
    const m = this.m;
    if (!m.oyun || m.oyun.bitis) {
      m.oyun = { id: "o" + Date.now().toString(36), oda: m.oda, odaAdi: m.oda, baslangic: Date.now(), bitis: null,
        elSayisi: m.ayar.elSayisi, esli: m.ayar.esli, oyuncular: [], eller: [], cezalar: [] };
    }
    // Çetelede masadakilerin güncel adları (koltuğa başkası oturduysa onun adı)
    m.oyun.oyuncular = m.koltuklar.map((x) => ({ ad: x.ad }));
    const d = K.dagit({ baslayan: m.baslayan });
    m.el = {
      gosterge: d.gosterge, okey: d.okey, deste: d.deste, eller: d.eller,
      atilanlar: [[], [], [], []], perler: [], acilislar: [],
      acti: [null, null, null, null], acilisDegeri: [0, 0, 0, 0], cezalar: [0, 0, 0, 0],
      sira: m.baslayan, asama: "at", gostergeMasada: true, yandan: null, sonAtilan: null, kilitliler: [],
      buTurActi: false, bitti: false, sonuc: null, sureBitis: 0
    };
    this.olaylar.push({ tur: "dagit" });
    this.turBaslat();
  }

  turBaslat() {
    this.m.el.buTurActi = false;
    this.sureyiKur();
  }

  // Sıradakinin süresi: oyuncuya tur süresi, bota kısa bir bekleme (bot da bu alarmla oynar)
  sureyiKur() {
    const E = this.m.el;
    E.sureBitis = Date.now() + (this.botMu(E.sira) ? BOT_BEKLEME : this.m.ayar.sure * 1000);
    this.alarmKur();
  }

  // Süre doldu: sıradaki oyuncunun yerine oynanır (bağlantısı kopmuş ya da koltuğu boş da olsa oyun ilerler); botsa bot oynar.
  // El sürmüyorsa: tutma süresi geçen kopuk koltuklar boşalır.
  async alarm() {
    this.olaylar = [];
    let degisti = this.kopuklariIsle();
    const E = this.m.el;
    // Süre tam dolunca oynanır (ekrandaki halka bittiği an); alarm birkaç ms erken çalarsa yeniden kurulur
    if (E && !E.bitti && Date.now() >= E.sureBitis - 30) {
      const k = E.sira;
      const bot = this.botMu(k);
      if (!bot) this.olaylar.push({ tur: "sure", k });
      if (bot) this.botOyna(k); else this.otomatik(k);
      if (!E.bitti && E.sira === k) this.sureyiKur();   // hamle bir sebeple olmadıysa masa takılı kalmasın
      degisti = true;
    }
    this.alarmKur();
    if (!degisti) return;
    await this.kaydet();
    this.yayinla();
  }

  otomatik(k) {
    const E = this.m.el;
    if (E.yandan) this.geriBirak(k);
    if (E.asama === "cek") { this.cek(k); if (E.bitti) return; }
    this.enAzYarayaniAt(k);
  }

  // ---------- bot ----------
  // Bot: işine yarayacaksa soldan alır, yoksa desteden çeker; açabiliyorsa açar (seri, olmazsa çift), açtıysa yeni
  // perlerini koyar ve uyan taşları işler; sonra en az işe yarayan taşı atar.
  botOyna(k) {
    const E = this.m.el;
    if (E.asama === "cek") {
      if (this.botSoldanIster(k)) this.soldanAl(k);
      else { this.cek(k); if (E.bitti) return; }
    }
    this.botAcIsle(k);
    // Soldan aldığı taşı kullanamadıysa geri bırakır ve desteden çeker
    if (E.yandan) {
      this.geriBirak(k);
      this.cek(k);
      if (E.bitti) return;
      this.botAcIsle(k);
    }
    this.enAzYarayaniAt(k, this.botKorunan(k));
  }

  botPerleri(el) {
    const E = this.m.el;
    const ayar = this.ayar();
    const gruplar = K.gruplariBul(K.seriDiz(el, E.okey), 99).filter((g) => g.length >= 3 && K.perCoz(g, E.okey, ayar));
    // Bütün taşlar perdeyse atacak taş kalmaz: en küçük per elde kalır
    if (gruplar.reduce((t, g) => t + g.length, 0) >= el.length) gruplar.sort((a, b) => b.length - a.length).pop();
    return gruplar;
  }

  // Eldeki çiftler (aynı renk ve sayı); okeyler en büyük teklerle eşleşir. Bir taş elde kalacak şekilde.
  botCiftleri(el) {
    const E = this.m.el;
    const okeyler = el.filter((t) => K.okeyMi(t, E.okey));
    const kume = new Map();
    for (const t of el) {
      if (K.okeyMi(t, E.okey)) continue;
      const a = K.kimlik(t, E.okey);
      const x = a.r * 14 + a.n;
      if (!kume.has(x)) kume.set(x, []);
      kume.get(x).push(t);
    }
    const ciftler = [];
    const tekler = [];
    for (const g of kume.values()) (g.length >= 2 ? ciftler.push([g[0], g[1]]) : tekler.push(g[0]));
    tekler.sort((a, b) => K.kimlik(b, E.okey).n - K.kimlik(a, E.okey).n);
    for (const o of okeyler) if (tekler.length) ciftler.push([tekler.shift(), o]);
    if (ciftler.length * 2 >= el.length) ciftler.pop();
    return ciftler;
  }

  botAcIsle(k) {
    const E = this.m.el;
    const ayar = this.ayar();
    const kimlikler = (g) => g.map((t) => t.id);
    // Açmışsa sadece koyabildiği türleri koyar (çift açan per, seri açan çift: masada o türle açan varsa)
    const gruplar = !E.acti[k] || this.turSerbest(k, "seri") ? this.botPerleri(E.eller[k]) : [];
    if (gruplar.length) this.ac(k, gruplar.map(kimlikler));
    if (E.acti[k] && this.turSerbest(k, "cift")) {
      const ciftler = this.botCiftleri(E.eller[k]);
      if (ciftler.length) this.ac(k, ciftler.map(kimlikler));
    }
    if (!E.acti[k]) {
      // Seriyle açamadı: yeterince çifti varsa çift açar (soldan aldığı taşla açacaksa o taş çiftlerde olmalı)
      const ciftler = this.botCiftleri(E.eller[k]);
      if (ciftler.length >= K.acmaBaraji(E.acilislar, "cift", k, ayar)) this.ac(k, ciftler.map(kimlikler));
      return;
    }
    for (const t of E.eller[k].slice()) {
      if (E.eller[k].length <= 1) break;
      const i = E.perler.findIndex((p) => K.isle(p, t, E.okey, ayar));
      if (i >= 0) this.isle(k, t.id, i);
    }
  }

  // Soldaki taş yeni bir per tamamlıyorsa (açmadıysa açmaya yetiyorsa) ya da işlenebiliyorsa alınır
  botSoldanIster(k) {
    const E = this.m.el;
    const ayar = this.ayar();
    const yigin = E.atilanlar[(k + 3) % 4];
    const tas = yigin[yigin.length - 1];
    if (!tas || K.okeyMi(tas, E.okey) || (E.kilitliler || []).includes(tas.id)) return false;
    const el = [...E.eller[k], tas];
    const gruplar = this.botPerleri(el);
    const islenir = () => E.perler.some((p) => K.isle(p, tas, E.okey, ayar));
    if (!gruplar.some((g) => g.includes(tas))) return !!E.acti[k] && islenir();
    if (E.acti[k]) return this.turSerbest(k, "seri") || islenir();
    const deger = gruplar.reduce((t, g) => t + K.perCoz(g, E.okey, ayar).puan, 0);
    return deger >= K.acmaBaraji(E.acilislar, "seri", k, ayar);
  }

  // Atarken tutulacak taşlar: seri açtıysa/açacaksa perlerdeki, çift açtıysa ya da çifte gidiyorsa çiftlerdeki
  botKorunan(k) {
    const E = this.m.el;
    const el = E.eller[k];
    const ciftler = this.botCiftleri(el);
    const ciftle = E.acti[k] === "cift" || (!E.acti[k] && ciftler.length >= 4);
    const perTaslari = () => K.gruplariBul(K.seriDiz(el, E.okey), 99).filter((g) => g.length >= 3 && K.perCoz(g, E.okey, this.ayar())).flat();
    // Açmışsa koyabildiği türlerin taşlarını tutar
    const taslar = E.acti[k]
      ? [...(this.turSerbest(k, "cift") ? ciftler.flat() : []), ...(this.turSerbest(k, "seri") ? perTaslari() : [])]
      : ciftle ? ciftler.flat() : perTaslari();
    return new Set(taslar.map((t) => t.id));
  }

  // Atılacak taş: elde en az işe yarayan; korunan taş (varsayılan: ıstakada geçerli bir perin parçası), okey ve işlek taş tutulur
  enAzYarayaniAt(k, korunan) {
    const E = this.m.el;
    const el = E.eller[k];
    const ayar = this.ayar();
    const perde = korunan || new Set(K.gruplariBul(K.seriDiz(el, E.okey), 99).filter((g) => g.length >= 3 && K.perCoz(g, E.okey, ayar)).flat().map((t) => t.id));
    const puanla = (t) => {
      if (K.okeyMi(t, E.okey)) return 1e6;
      if (perde.has(t.id)) return 1e4;
      const a = K.kimlik(t, E.okey);
      let p = 0;
      for (const x of el) {
        if (x === t) continue;
        const b = K.kimlik(x, E.okey);
        if (b.r === a.r && b.n !== a.n && Math.abs(b.n - a.n) <= 2) p += 3 - Math.abs(b.n - a.n);
        if (b.n === a.n && b.r !== a.r) p += 1.5;
      }
      if (E.perler.length && K.islekMi(t, E.perler, E.okey, this.ayar())) p += 100;
      return p - a.n / 100;
    };
    const atilacak = el.slice().sort((a, b) => puanla(a) - puanla(b))[0];
    if (atilacak) this.at(k, atilacak.id);
  }

  siradaki() {
    const E = this.m.el;
    E.sira = (E.sira + 1) % 4;
    E.asama = "cek";
    E.yandan = null;
    this.turBaslat();
  }

  ceza(k, miktar, neden) {
    const m = this.m;
    m.el.cezalar[k] += miktar;
    m.oyun.cezalar.push({ el: m.oyun.eller.length + 1, oyuncu: k, miktar, neden, zaman: Date.now() });
    this.olaylar.push({ tur: "ceza", k, miktar, neden });
  }

  // ---------- işlek: "fark eden söyler" ----------
  // İşlek taş atılınca ceza kendiliğinden yazılmaz. Atılan taşı, kime atıldıysa onun sırası bitene kadar masadaki
  // herkes (eşli oyunda takım arkadaşı da) bir pere sürükleyip "işlek" diye gösterebilir: gerçekten işlekse atana
  // 101 ceza yazılır ve o taş artık kimse tarafından alınamaz. İşlek değilse bir şey olmaz (yanlış gösterene ceza yok).
  // Kimse fark etmezse açmış biri o taşı soldan alıp kullanabilir; ceza yok. E.sonAtilan her atılan taş için tutulur
  // (sadece işlek olanlar değil), böylece görünümden hangi taşın işlek olduğu anlaşılmaz.
  islekGoster(k, perNo) {
    const E = this.m.el;
    const s = E.sonAtilan;
    if (!s || s.gosterildi) return "Gösterilecek taş yok";
    if (k === s.atan) return "Kendi attığın taşı gösteremezsin";
    const yigin = E.atilanlar[s.atan];
    const tas = yigin[yigin.length - 1];
    if (!tas || tas.id !== s.tasId) return "Taş artık yerde değil";
    const ayar = this.ayar();
    const per = E.perler[perNo];
    // Atılan okeyin kendi cezası var; işlek sayılmaz
    if (!per || K.okeyMi(tas, E.okey) || !(K.isle(per, tas, E.okey, ayar) || K.okeyDegistir(per, tas, E.okey, ayar))) {
      this.olaylar.push({ tur: "islekDegil", k, atan: s.atan, tas });
      return;
    }
    s.gosterildi = true;
    (E.kilitliler = E.kilitliler || []).push(tas.id);
    this.olaylar.push({ tur: "islekGosterildi", k, atan: s.atan, tas, per: perNo });
    this.ceza(s.atan, ayar.ceza, "İşlek taş attı");
  }

  // Botlar işlek taşı hemen fark edip gösterir (eşli oyunda takım arkadaşınınkini göstermez)
  botlarIslekBakar() {
    const E = this.m.el;
    const s = E.sonAtilan;
    if (!s || s.gosterildi) return;
    const tas = E.atilanlar[s.atan][E.atilanlar[s.atan].length - 1];
    if (!tas || K.okeyMi(tas, E.okey)) return;
    const ayar = this.ayar();
    const perNo = E.perler.findIndex((p) => K.isle(p, tas, E.okey, ayar) || K.okeyDegistir(p, tas, E.okey, ayar));
    if (perNo < 0) return;
    for (let j = 1; j < 4; j++) {
      const b = (s.atan + j) % 4;
      if (this.botMu(b) && !(this.m.ayar.esli && (s.atan + 2) % 4 === b)) return this.islekGoster(b, perNo);
    }
  }

  // El biterken gösterilmeye fırsat kalmayan son atılan işlek taş: atana ceza (bitiren de olsa)
  sonIslegiCezalandir() {
    const E = this.m.el;
    const s = E.sonAtilan;
    if (!s || s.gosterildi) return;
    const yigin = E.atilanlar[s.atan];
    const tas = yigin[yigin.length - 1];
    E.sonAtilan = null;
    if (!tas || tas.id !== s.tasId || K.okeyMi(tas, E.okey) || !E.perler.length) return;
    if (K.islekMi(tas, E.perler, E.okey, this.ayar())) this.ceza(s.atan, this.ayar().ceza, "Son taşı işlek attı");
  }

  cek(k) {
    const E = this.m.el;
    if (E.asama !== "cek") return "Önce taşını at";
    if (!E.deste.length) return this.desteBitti();
    const tas = E.deste.shift();
    E.eller[k].push(tas);
    E.asama = "at";
    this.olaylar.push({ tur: "cek", k, tasId: tas.id });
  }

  soldanAl(k) {
    const E = this.m.el;
    if (E.asama !== "cek") return "Önce taşını at";
    const yigin = E.atilanlar[(k + 3) % 4];
    const tas = yigin[yigin.length - 1];
    if (!tas) return "Solda taş yok";
    if (K.okeyMi(tas, E.okey)) return "Atılan okey yandan alınamaz";
    if ((E.kilitliler || []).includes(tas.id)) return "Bu taş işlek diye gösterildi, alınamaz";
    yigin.pop();
    E.eller[k].push(tas);
    E.yandan = { tas };
    E.asama = "at";
    this.olaylar.push({ tur: "soldanAl", k, tas });
  }

  // Denemek için alınan taş cezasız geri bırakılır; sonra desteden çekilir
  geriBirak(k) {
    const E = this.m.el;
    if (!E.yandan) return "Geri bırakılacak taş yok";
    const i = E.eller[k].findIndex((t) => t.id === E.yandan.tas.id);
    if (i < 0) return;
    const [tas] = E.eller[k].splice(i, 1);
    E.atilanlar[(k + 3) % 4].push(tas);
    E.yandan = null;
    E.asama = "cek";
    this.olaylar.push({ tur: "geriBirak", k, tas });
  }

  // Soldan alınan taşın kimliği (ya da elde duran ikizi) bu taşlar arasında mı?
  yandanKimligiVar(taslar) {
    const E = this.m.el;
    if (!E.yandan) return false;
    const y = K.kimlik(E.yandan.tas, E.okey);
    return taslar.some((t) => !K.okeyMi(t, E.okey) && ((x) => x.r === y.r && x.n === y.n)(K.kimlik(t, E.okey)));
  }

  // Soldan alınan taş kullanıldı. Taşı atana ceza sadece alan onunla elini açtıysa yazılır (açtıran taş); daha önce
  // açmış oyuncu soldan alıp per koyar ya da işlerse atana ceza yok (işlek olsa da: kimse fark edip göstermedi).
  yandanKullanildi(k) {
    const E = this.m.el;
    const { tas } = E.yandan;
    E.yandan = null;
    if (E.acti[k] && !E.buTurActi) return;
    const sol = (k + 3) % 4;
    if (!(this.m.ayar.esli && (k + 2) % 4 === sol)) this.ceza(sol, K.ceza("acTiranTas", tas, E.okey, this.ayar()), "Açtıran taş attı");
  }

  at(k, id) {
    const E = this.m.el;
    if (E.asama !== "at") return "Önce taş çek";
    if (E.yandan) {
      if (id === E.yandan.tas.id) return this.geriBirak(k);
      return "Soldan aldığın taşı önce kullan ya da geri bırak";
    }
    const el = E.eller[k];
    const i = el.findIndex((t) => t.id === id);
    if (i < 0) return "Bu taş elinde değil";
    const sonTas = el.length === 1;
    if (sonTas && !E.acti[k]) return "Açmadan bitemezsin";
    const [tas] = el.splice(i, 1);
    E.atilanlar[k].push(tas);
    this.olaylar.push({ tur: "at", k, tas });
    // Önceki atılan taşın gösterilme süresi bu oyuncunun sırasıyla bitti; şimdi bu taş gösterilebilir
    E.sonAtilan = { atan: k, tasId: tas.id, gosterildi: false };
    if (sonTas) {
      // Son taşı işlek atan bitirir ama kimse göstermeye fırsat bulamadığı için cezası el sonunda yazılır
      this.sonIslegiCezalandir();
      return this.elBitti(k, { okey: K.okeyMi(tas, E.okey), cift: E.acti[k] === "cift", elden: E.buTurActi });
    }
    if (K.okeyMi(tas, E.okey)) this.ceza(k, K.ceza("okeyAtma", tas, E.okey, this.ayar()), "Okey attı");
    this.botlarIslekBakar();
    this.siradaki();
  }

  // Açış ya da (açtıysa) yeni per koyma. gruplar: ıstakada yan yana duran taşların kimlikleri.
  ac(k, gruplar) {
    const E = this.m.el;
    const ayar = this.ayar();
    if (E.asama !== "at") return "Açmak için önce taş çek";
    if (!Array.isArray(gruplar) || !gruplar.length || gruplar.length > 15) return "Geçersiz açılış";
    const el = E.eller[k];
    const kullanilan = new Set();
    const taslar = [];
    for (const g of gruplar) {
      if (!Array.isArray(g) || !g.length || g.length > 13) return "Geçersiz açılış";
      const grup = [];
      for (const id of g) {
        const t = el.find((x) => x.id === String(id));
        if (!t || kullanilan.has(t.id)) return "Taşlar elinde değil";
        kullanilan.add(t.id);
        grup.push(t);
      }
      taslar.push(grup);
    }
    const ciftMi = taslar.every((g) => g.length <= 2);
    const tur = ciftMi ? "cift" : "seri";
    // Açtığı türün dışındakini (seri açan çift, çift açan per) ancak masada o türle açmış başka biri varsa koyabilir
    if (E.acti[k] && !this.turSerbest(k, tur)) {
      return tur === "cift" ? "Masada çift açan yokken seri açan çift koyamaz" : "Masada perle açan yokken çift açan per koyamaz";
    }
    let deger = 0;
    if (tur === "cift") {
      const tekler = taslar.filter((g) => g.length === 1);
      if (tekler.length > 1 || (tekler.length && (!E.gostergeMasada || !K.gostergeCiftiMi(tekler[0][0], E.gosterge, ayar)))) return "Geçersiz çift";
      if (taslar.some((g) => g.length === 2 && !K.ciftMi(g[0], g[1], E.okey))) return "Geçersiz çift";
      deger = taslar.length;
    } else {
      for (const g of taslar) {
        const p = K.perCoz(g, E.okey, ayar);
        if (!p) return "Geçersiz per";
        deger += p.puan;
      }
    }
    const kalan = el.length - kullanilan.size;
    if (kalan < 1) return "Atmak için bir taş kalmalı";
    if (!E.acti[k]) {
      const baraj = K.acmaBaraji(E.acilislar, tur, k, ayar);
      const elden = tur === "seri" && kalan === 1;
      if (deger < baraj && !elden) return (tur === "cift" ? "En az " + baraj + " çift" : "En az " + baraj + " puan") + " gerekiyor";
      if (E.yandan && !this.yandanKimligiVar(taslar.flat())) return "Soldan aldığın taşla açmalısın";
    }
    E.eller[k] = el.filter((t) => !kullanilan.has(t.id));
    for (const g of taslar) {
      const perTaslari = g.length === 1 ? [g[0], E.gosterge] : g;
      if (g.length === 1) E.gostergeMasada = false;
      E.perler.push(Object.assign({ sahip: k, taslar: perTaslari }, tur === "cift" ? { tur: "cift" } : K.perCoz(g, E.okey, ayar)));
    }
    if (!E.acti[k]) {
      E.acti[k] = tur;
      E.acilisDegeri[k] = deger;
      E.acilislar.push({ oyuncu: k, tur, deger });
      E.buTurActi = true;
      this.olaylar.push({ tur: "acti", k, deger, cift: tur === "cift" });
      // 7 ya da daha çok çiftle açan: diğer herkese (eşlide sadece iki rakibe) ceza
      if (tur === "cift" && deger >= 7) {
        for (let j = 0; j < 4; j++) if (j !== k && !(this.m.ayar.esli && (k + 2) % 4 === j)) this.ceza(j, ayar.ceza, "7 çiftle açıldı");
      }
    } else {
      this.olaylar.push({ tur: "perKoydu", k });
    }
    if (E.yandan && this.yandanKimligiVar(taslar.flat())) this.yandanKullanildi(k);
  }

  isle(k, id, perNo) {
    const E = this.m.el;
    const ayar = this.ayar();
    if (E.asama !== "at") return "Önce taş çek, sonra işle";
    if (!E.acti[k]) return "İşlemek için önce elini açmalısın";
    const el = E.eller[k];
    if (el.length <= 1) return "Son taşını atman gerekiyor";
    const i = el.findIndex((t) => t.id === id);
    const per = E.perler[perNo];
    if (i < 0 || !per) return "Geçersiz işleme";
    const tas = el[i];
    const degisim = K.okeyDegistir(per, tas, E.okey, ayar);
    if (degisim) {
      // Yerden okey alınabilir; perin sahibine ceza yazılmaz
      E.perler[perNo] = Object.assign({ sahip: per.sahip }, degisim.per);
      el[i] = degisim.alinan;
    } else {
      const yeni = K.isle(per, tas, E.okey, ayar);
      if (!yeni) return "Bu taş o pere işlenmiyor";
      E.perler[perNo] = Object.assign({ sahip: per.sahip }, yeni);
      el.splice(i, 1);
    }
    this.olaylar.push({ tur: "isledi", k, tas, per: perNo });
    if (this.yandanKimligiVar([tas])) this.yandanKullanildi(k);
  }

  oyuncuDurumlari() {
    const E = this.m.el;
    return [0, 1, 2, 3].map((k) => ({ acti: !!E.acti[k], ciftActi: E.acti[k] === "cift", el: E.eller[k] }));
  }

  elBitti(bitiren, bitis) {
    const E = this.m.el;
    const puanlar = K.elSonu({ bitiren, bitis, oyuncular: this.oyuncuDurumlari(), okey: E.okey, ayar: this.ayar() });
    const ad = this.m.koltuklar[bitiren] ? this.m.koltuklar[bitiren].ad : "Oyuncu";
    this.elKapat(bitiren, bitis, puanlar, ad + " bitirdi" + [bitis.okey && " · okey atarak", bitis.cift && " · çiftten", bitis.elden && " · elden"].filter(Boolean).join(""));
  }

  desteBitti() {
    const E = this.m.el;
    this.sonIslegiCezalandir();
    this.elKapat(null, null, K.desteBitti({ oyuncular: this.oyuncuDurumlari(), okey: E.okey, ayar: this.ayar() }), "Deste bitti, kimse bitiremedi");
  }

  elKapat(bitiren, bitis, puanlar, baslik) {
    const m = this.m;
    const E = m.el;
    E.bitti = true;
    E.sonuc = { baslik, bitiren, puanlar };
    m.oyun.eller.push({
      no: m.oyun.eller.length + 1, bitiren, bitis, desteBitti: bitiren == null, puanlar, cezalar: E.cezalar.slice(),
      durumlar: [0, 1, 2, 3].map((k) => (k === bitiren ? "bitirdi" : !E.acti[k] ? "acmadi" : E.acti[k] === "cift" ? "cift" : "acti " + E.acilisDegeri[k])),
      zaman: Date.now()
    });
    if (m.oyun.elSayisi && m.oyun.eller.length >= m.oyun.elSayisi) m.oyun.bitis = Date.now();
    m.baslayan = (m.baslayan + 1) % 4;
    this.alarmKur();   // tur süresi biter; el sırasında kopanların koltuk süresi kalır
    this.olaylar.push({ tur: "elBitti", baslik });
    this.ceteleyeYaz();
  }

  async ceteleyeYaz() {
    const oyunlar = (await this.ctx.storage.get("oyunlar")) || [];
    const i = oyunlar.findIndex((o) => o.id === this.m.oyun.id);
    if (i >= 0) oyunlar[i] = this.m.oyun; else oyunlar.push(this.m.oyun);
    await this.ctx.storage.put("oyunlar", oyunlar.slice(-50));
  }

  // ---------- görünüm (kişiye özel) ----------
  gorunum(ben, bagli) {
    const m = this.m;
    const E = m.el;
    const k = this.koltugum(ben.kim);
    const izlenen = k >= 0 ? k : ben.yanci;
    const yancilar = [[], [], [], []];
    for (const x of this.baglilar()) if (this.koltugum(x.ben.kim) < 0 && x.ben.yanci != null) yancilar[x.ben.yanci].push({ ad: x.ben.ad });
    return {
      ben: { koltuk: k, yanci: k >= 0 ? null : ben.yanci, ad: ben.ad, yetkili: this.yetkili(ben), kurucu: m.kurucu === ben.kim },
      ayar: m.ayar,
      koltuklar: m.koltuklar.map((x, i) => (x ? {
        ad: x.ad, foto: x.foto, bagli: !!x.bot || bagli.has(x.kim), bos: false, yancilar: yancilar[i], bot: !!x.bot,
        devralinabilir: this.bosaldi(x)
      } : { bos: true, yancilar: yancilar[i] })),
      izleyici: this.baglilar().filter((x) => this.koltugum(x.ben.kim) < 0).length,
      oyun: m.oyun,
      el: E && {
        gosterge: E.gosterge, okey: E.okey, gostergeMasada: E.gostergeMasada, desteSayisi: E.deste.length,
        atilanlar: E.atilanlar, perler: E.perler, acilislar: E.acilislar, acti: E.acti, acilisDegeri: E.acilisDegeri,
        cezalar: E.cezalar, sira: E.sira, asama: E.asama, sureBitis: E.sureBitis, bitti: E.bitti, sonuc: E.sonuc,
        // İşlek gösterme: son atılan taş (işlek olup olmadığı söylenmez) ve gösterilip kilitlenen taşlar
        sonAtilan: E.sonAtilan && !E.sonAtilan.gosterildi ? { atan: E.sonAtilan.atan, tasId: E.sonAtilan.tasId } : null,
        kilitliler: E.kilitliler || [],
        tasSayilari: E.eller.map((x) => x.length),
        taslar: izlenen != null && izlenen >= 0 ? E.eller[izlenen] : null,
        yandanId: k >= 0 && E.sira === k && E.yandan ? E.yandan.tas.id : null
      },
      sunucuZamani: Date.now()
    };
  }
}
