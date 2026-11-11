// Odanın bilardo (8 top) masası (Cloudflare Durable Object; her oda için bir tane). Atışları burada hesaplar
// (fizik ve kurallar sitedeki motorla aynı dosyadan: js/bilardo/fizik.js) ve herkese gönderir; herkes aynı atışı
// kendi ekranında aynı motorla baştan oynatır, sonunda konumları buradan alır.
//
// Koltuklar 0–3. Takım = koltuk % 2 (0 ve 2 bir takım, 1 ve 3 öbür takım). 2 kişi (her takımda bir) teke tek,
// 4 kişi eşli oynar; sıra takımlar arasında döner, eşli oyunda takımın iki oyuncusu sırayla atar. Boş koltuğa bot konabilir.
//
// İstemci → sunucu: { t: "merhaba", kart?, misafir?, ad? } (ilk mesaj) · "otur" {koltuk} · "kalk" · "bot" {koltuk}
//   · "botCikar" {koltuk} · "ayar" {sure} · "basla" · "vur" {yx, yy, guc, ust, yan, beyaz?: {x, y}}
//   · "nisan" {yx, yy, cekme, ust, yan, beyaz?}   (sıradakinin nişanı; kaydedilmez, öbürlerine iletilir)
// Sunucu → istemci: { t: "guncel", olaylar, durum } · { t: "nisan", k, ... } · { t: "hata", metin }

import F from "../../js/bilardo/fizik.js";
import { googleKartiDogrula } from "./kimlik.js";

const YONETICI = "erayaksuhome@outlook.com";
const DB = "https://bekleniyor-e16eb-default-rtdb.europe-west1.firebasedatabase.app";
const KOLTUK_BEKLEME = 120 * 1000;   // bağlantısı kopanın koltuğu (oyun yokken) bu kadar onun için tutulur
const BOT_BEKLEME = 1500;            // atış bittikten sonra botun düşünme süresi (ms)
const BOT_ADLARI = ["Bot Ayşe", "Bot Mehmet", "Bot Zeynep", "Bot Can"];
const SURELER = [20, 30, 45, 60, 90];

const yeniMasa = () => ({ oda: null, ayar: { sure: 45 }, kurucu: null, koltuklar: [null, null, null, null], oyun: null, skor: {}, kiran: 0 });
const temizAd = (s, v) => String(s || v).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) || v;
const sayi = (x, en, cok) => (typeof x === "number" && Number.isFinite(x) ? Math.min(cok, Math.max(en, x)) : null);
const rastgele = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

export class BilardoMasasi {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.m = null;
    this.sahip = { uid: null, zaman: 0 };
    this.sonNisan = 0;
    ctx.blockConcurrencyWhile(async () => { this.m = (await ctx.storage.get("m")) || yeniMasa(); });
  }

  // ---------- bağlantı ----------
  async fetch(istek) {
    const url = new URL(istek.url);
    if (!this.m.oda && url.searchParams.get("oda")) this.m.oda = url.searchParams.get("oda");
    if (istek.headers.get("Upgrade") !== "websocket") return new Response("WebSocket bekleniyor", { status: 426 });
    const [istemci, sunucu] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(sunucu);
    sunucu.serializeAttachment({ kim: null });
    return new Response(null, { status: 101, webSocket: istemci });
  }

  async webSocketMessage(ws, veri) {
    if (typeof veri !== "string" || veri.length > 2048) return;
    let mesaj;
    try { mesaj = JSON.parse(veri); } catch (e) { return; }
    const ben = ws.deserializeAttachment() || {};
    if (mesaj.t === "merhaba") return this.merhaba(ws, mesaj);
    if (!ben.kim) return;
    if (mesaj.t === "nisan") return this.nisan(ben, ws, mesaj);
    this.olaylar = [];
    try {
      const sonuc = this.isle_(ben, ws, mesaj);
      if (typeof sonuc === "string") ws.send(JSON.stringify({ t: "hata", metin: sonuc }));
    } catch (e) {
      ws.send(JSON.stringify({ t: "hata", metin: "Sunucu hatası: " + e.message }));
    }
    this.kopuklariIsle();
    this.alarmKur();
    await this.kaydet();
    this.yayinla();
  }

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

  async merhaba(ws, mesaj) {
    let ben;
    // Sadece Google hesabıyla giriş yapmış kişiler bağlanabilir; misafir kimliği yalnız yerel deneme sunucusunda
    const kart = mesaj.kart ? await googleKartiDogrula(mesaj.kart) : null;
    if (kart) {
      ben = { kim: "u:" + kart.uid, uid: kart.uid, ad: temizAd(mesaj.ad || kart.ad.split(" ")[0], "Oyuncu"),
        foto: /^https:\/\/lh\d\.googleusercontent\.com\//.test(kart.foto) ? kart.foto : "",
        yonetici: kart.epostaDogrulandi && kart.eposta === YONETICI };
    } else if (this.env.MISAFIR_IZNI === "1" && mesaj.misafir && /^[a-z0-9]{12,32}$/.test(mesaj.misafir.id)) {
      ben = { kim: "m:" + mesaj.misafir.id, uid: null, ad: temizAd(mesaj.misafir.ad, "Misafir"), foto: "", yonetici: false };
    } else {
      ws.send(JSON.stringify({ t: "hata", metin: "Masaya bağlanmak için Google hesabınla giriş yap" }));
      return ws.close(4001, "giris gerekli");
    }
    ws.serializeAttachment(ben);
    const k = this.koltugum(ben.kim);
    if (k >= 0) Object.assign(this.m.koltuklar[k], { ad: ben.ad, foto: ben.foto, ayrildi: null });
    this.sahibiOgren(kart ? mesaj.kart : null);
    this.olaylar = [];
    this.kopuklariIsle();
    this.alarmKur();
    await this.kaydet();
    this.yayinla();
  }

  async sahibiOgren(kart) {
    if (!kart || !this.m.oda || Date.now() - this.sahip.zaman < 10 * 60 * 1000) return;
    try {
      const uid = await (await fetch(DB + "/odalar/" + encodeURIComponent(this.m.oda) + "/bilgi/sahip.json?auth=" + encodeURIComponent(kart))).json();
      this.sahip = { uid: typeof uid === "string" ? uid : null, zaman: Date.now() };
    } catch (e) { }
  }

  async kaydet() { await this.ctx.storage.put("m", this.m); }
  baglilar() { return this.ctx.getWebSockets().map((ws) => ({ ws, ben: ws.deserializeAttachment() || {} })).filter((x) => x.ben.kim); }
  koltugum(kim) { return this.m.koltuklar.findIndex((k) => k && k.kim === kim); }
  yetkili(ben) { return ben.yonetici || (ben.uid && ben.uid === this.sahip.uid); }
  botMu(k) { const x = this.m.koltuklar[k]; return !!(x && x.bot); }
  bosaldi(kol) {
    if (kol.bot) return true;
    return !this.baglilar().some((x) => x.ben.kim === kol.kim) && !!kol.ayrildi;
  }
  oyunSuruyor() { return !!(this.m.oyun && !this.m.oyun.bitti); }

  yayinla(haric) {
    const bagli = new Set(this.baglilar().filter((x) => x.ws !== haric).map((x) => x.ben.kim));
    for (const { ws, ben } of this.baglilar()) {
      if (ws === haric) continue;
      try { ws.send(JSON.stringify({ t: "guncel", olaylar: this.olaylar || [], durum: this.gorunum(ben, bagli) })); } catch (e) { }
    }
  }

  // Oyun yokken tutma süresi geçen kopuk koltuklar boşalır; insan kalmadıysa botlar da kalkar
  kopuklariIsle() {
    const m = this.m;
    const bagli = new Set(this.baglilar().map((x) => x.ben.kim));
    let degisti = false;
    m.koltuklar.forEach((x, i) => {
      if (!x || x.bot || bagli.has(x.kim)) return;
      if (!x.ayrildi) { x.ayrildi = Date.now(); degisti = true; }
      else if (!this.oyunSuruyor() && Date.now() - x.ayrildi >= KOLTUK_BEKLEME) { m.koltuklar[i] = null; degisti = true; }
    });
    // Masada (botlar dışında) kimse kalmadı: botlar da kalkar, yarım oyun kapanır
    if (!m.koltuklar.some((x) => x && !x.bot && (bagli.has(x.kim) || !x.ayrildi || Date.now() - x.ayrildi < KOLTUK_BEKLEME))) {
      if (m.koltuklar.some(Boolean) || this.oyunSuruyor()) degisti = true;
      m.koltuklar = [null, null, null, null];
      m.kurucu = null;
      if (this.oyunSuruyor()) m.oyun = null;
    }
    return degisti;
  }

  // Tek alarm: sıradakinin süresi, botun atışı ya da (oyun yokken) kopuk koltuğun boşalma zamanı
  alarmKur() {
    const m = this.m;
    const zamanlar = [];
    if (this.oyunSuruyor()) zamanlar.push(this.botMu(m.oyun.sira) ? m.oyun.botZamani : m.oyun.sureBitis);
    for (const x of m.koltuklar) if (x && !x.bot && x.ayrildi) zamanlar.push(x.ayrildi + KOLTUK_BEKLEME);
    if (zamanlar.length) this.ctx.storage.setAlarm(Math.max(Date.now() + 50, Math.min(...zamanlar)));
    else this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    this.olaylar = [];
    let degisti = this.kopuklariIsle();
    const O = this.m.oyun;
    if (O && !O.bitti) {
      const k = O.sira;
      if (this.botMu(k)) {
        if (Date.now() >= O.botZamani - 30) { this.botOyna(k); degisti = true; }
      } else if (Date.now() >= O.sureBitis - 30) {
        // Süre doldu: faul sayılır, sıra rakibe geçer ve rakip beyazı istediği yere koyar
        this.olaylar.push({ tur: "sure", k });
        this.siraGecer(k % 2, true, 0);
        degisti = true;
      }
    }
    this.alarmKur();
    if (!degisti) return;
    await this.kaydet();
    this.yayinla();
  }

  // ---------- nişan (canlı) ----------
  nisan(ben, ws, mesaj) {
    const O = this.m.oyun;
    const k = this.koltugum(ben.kim);
    if (!O || O.bitti || k !== O.sira || Date.now() - this.sonNisan < 20) return;
    this.sonNisan = Date.now();
    const yx = sayi(mesaj.yx, -1, 1), yy = sayi(mesaj.yy, -1, 1);
    if (yx === null || yy === null) return;
    const b = mesaj.beyaz && sayi(mesaj.beyaz.x, -50, F.W + 50) !== null && sayi(mesaj.beyaz.y, -50, F.H + 50) !== null
      ? { x: mesaj.beyaz.x, y: mesaj.beyaz.y } : null;
    const ileti = JSON.stringify({ t: "nisan", k, yx, yy, cekme: sayi(mesaj.cekme, 0, 1) || 0, ust: sayi(mesaj.ust, -1, 1) || 0, yan: sayi(mesaj.yan, -1, 1) || 0, beyaz: b });
    for (const x of this.baglilar()) if (x.ws !== ws) { try { x.ws.send(ileti); } catch (e) { } }
  }

  // ---------- mesajlar ----------
  isle_(ben, ws, mesaj) {
    const m = this.m;
    const k = this.koltugum(ben.kim);
    const suruyor = this.oyunSuruyor();
    switch (mesaj.t) {
      case "otur": {
        const h = Number(mesaj.koltuk);
        if (!(h >= 0 && h < 4)) return "Geçersiz koltuk";
        if (k === h) return;
        if (k >= 0) {
          if (suruyor) return "Oyun sürerken koltuk değiştirilemez";
          if (m.koltuklar[h]) return "Bu koltuk dolu";
          m.koltuklar[h] = m.koltuklar[k];
          m.koltuklar[k] = null;
          return;
        }
        const kol = m.koltuklar[h];
        if (kol && !this.bosaldi(kol)) return "Bu koltuk dolu";
        if (!m.koltuklar.some((x) => x && !x.bot)) m.kurucu = ben.kim;
        m.koltuklar[h] = { kim: ben.kim, ad: ben.ad, foto: ben.foto, ayrildi: null };
        if (suruyor && m.oyun.sira === h) this.sureyiKur();
        return;
      }
      case "kalk":
        if (k < 0) return;
        // Oyun sürüyorsa koltuk boş kalır ama oyun bozulmaz: başkası ya da bot oturabilir, oturmazsa süre dolar
        m.koltuklar[k] = suruyor ? Object.assign({}, m.koltuklar[k], { kim: "bos:" + k, ayrildi: 1 }) : null;
        if (!suruyor && !m.koltuklar.some((x) => x && !x.bot)) { m.koltuklar = [null, null, null, null]; m.kurucu = null; }
        return;
      case "bot": {
        if (k < 0 && !this.yetkili(ben)) return "Bot eklemek için önce masaya otur";
        const h = Number(mesaj.koltuk);
        if (!(h >= 0 && h < 4)) return "Geçersiz koltuk";
        const kol = m.koltuklar[h];
        if (kol && (kol.bot || !this.bosaldi(kol))) return "Bu koltuk dolu";
        m.koltuklar[h] = { kim: "bot:" + h, ad: BOT_ADLARI[h], foto: "", ayrildi: null, bot: true };
        if (suruyor && m.oyun.sira === h) this.sureyiKur();
        return;
      }
      case "botCikar": {
        if (k < 0 && !this.yetkili(ben)) return "Botu çıkarmak için önce masaya otur";
        const h = Number(mesaj.koltuk);
        if (!this.botMu(h)) return "Bu koltukta bot yok";
        if (suruyor) return "Oyun sürerken bot çıkarılamaz";
        m.koltuklar[h] = null;
        return;
      }
      case "ayar": {
        if (!(m.kurucu === ben.kim || this.yetkili(ben))) return "Ayarları masayı kuran değiştirir";
        const s = Number(mesaj.sure);
        if (SURELER.includes(s)) m.ayar.sure = s;
        return;
      }
      case "basla":
        if (k < 0) return "Oyunu başlatmak için masaya otur";
        if (suruyor) return "Oyun sürüyor";
        return this.basla();
      case "vur": {
        if (!suruyor) return "Oyun yok";
        if (k !== m.oyun.sira) return "Sıra sende değil";
        if (Date.now() < m.oyun.atisBitis) return "Toplar henüz durmadı";
        return this.vur(k, mesaj);
      }
    }
  }

  // Oturanlar: 2 kişi (her takımda bir) ya da 4 kişi
  takimlar() {
    const t = [[], []];
    this.m.koltuklar.forEach((x, i) => { if (x) t[i % 2].push(i); });
    return t;
  }

  basla() {
    const m = this.m;
    const t = this.takimlar();
    // İki takımda da en az bir kişi: 1'e 1, 1'e 2 ya da 2'ye 2 (tek kişilik takımda o kişi her sırada atar)
    const sayi = t[0].length + t[1].length;
    if (!t[0].length || !t[1].length) {
      return sayi < 2 ? "Oyun için en az 2 kişi gerekli (bot da olur)"
        : "İki takımda da en az bir kişi olmalı: biri sol, biri sağ tarafa otursun";
    }
    // Kıran takım her oyunda değişir
    const kiran = m.kiran % 2;
    m.kiran++;
    m.oyun = {
      id: Date.now().toString(36) + Math.floor(rastgele() * 1e6).toString(36), no: (m.oyun ? m.oyun.no : 0) + 1,
      toplar: F.diz(rastgele), gruplar: [null, null], sira: t[kiran][0], son: [t[0][0], t[1][0]],
      kirilis: true, elde: true, bitti: false, kazanan: null, neden: null, atisNo: 0, atisBitis: 0,
      oyuncular: m.koltuklar.map((x) => (x ? { kim: x.kim, ad: x.ad } : null)), eslik: t[0].length === 2
    };
    m.oyun.son[kiran] = t[kiran][0];
    this.olaylar.push({ tur: "basladi" });
    this.sureyiKur();
  }

  sureyiKur(gecikme = 0) {
    const O = this.m.oyun;
    O.sureBitis = Date.now() + gecikme + this.m.ayar.sure * 1000;
    O.botZamani = Date.now() + gecikme + BOT_BEKLEME;
  }

  // Sıra öbür takıma geçer (takımında iki kişi varsa geçen sefer atmayan atar). faul: rakip beyazı istediği yere koyar.
  siraGecer(takim, faul, gecikme) {
    const O = this.m.oyun;
    const rakip = 1 - takim;
    const t = this.takimlar()[rakip];
    const sonraki = t.length > 1 ? t.find((s) => s !== O.son[rakip]) : t[0];
    O.sira = sonraki === undefined ? O.son[rakip] : sonraki;
    O.son[rakip] = O.sira;
    O.elde = !!faul;
    O.kirilis = false;
    this.sureyiKur(gecikme);
  }

  vur(k, mesaj) {
    const O = this.m.oyun;
    let yx = sayi(mesaj.yx, -1, 1), yy = sayi(mesaj.yy, -1, 1);
    const guc = sayi(mesaj.guc, 0, 1), ust = sayi(mesaj.ust, -1, 1), yan = sayi(mesaj.yan, -1, 1);
    if (yx === null || yy === null || guc === null || ust === null || yan === null) return "Geçersiz atış";
    const l = Math.sqrt(yx * yx + yy * yy);
    if (l < 0.01) return "Geçersiz atış";
    yx /= l; yy /= l;
    const once = O.toplar.slice();
    if (mesaj.beyaz) {
      if (!O.elde) return "Beyazı sadece elde top varken yerleştirebilirsin";
      const x = sayi(mesaj.beyaz.x, 0, F.W), y = sayi(mesaj.beyaz.y, 0, F.H);
      if (x === null || y === null || !F.yerBos(once, x, y, 0)) return "Beyaz oraya konamaz";
      if (O.kirilis && x > F.KAFA_X) return "Kırışta beyaz çizginin gerisinde olmalı";
      once[0] = { x, y };
    } else if (!once[0]) return "Önce beyazı masaya koy";
    this.atisYap(k, once, { yx, yy, guc, ust, yan });
  }

  atisYap(k, once, atis) {
    const O = this.m.oyun;
    const takim = k % 2;
    const s = F.sonuna(once, atis);
    const kr = F.kural({ gruplar: O.gruplar, kirilis: O.kirilis, toplar: once }, s, takim);
    O.atisNo++;
    this.olaylar.push({ tur: "vurus", k, no: O.atisNo, once, atis });
    O.toplar = s.toplar;
    if (kr.siyahGeri) O.toplar[8] = F.siyahiKoy(O.toplar);
    const yeniGrup = !O.gruplar[takim] && kr.gruplar[takim];
    O.gruplar = kr.gruplar;
    const sure = Math.ceil(s.sure * 1000) + 300;   // herkesin ekranında toplar dursun diye
    O.atisBitis = Date.now() + sure;
    this.olaylar.push({ tur: "sonuc", k, faul: kr.faul, devam: kr.devam, giren: s.giren.map((g) => g.top), yeniGrup: yeniGrup ? O.gruplar[takim] : null, siyahGeri: kr.siyahGeri });
    if (kr.kazanan !== null) {
      O.bitti = true;
      O.kazanan = kr.kazanan;
      O.neden = kr.neden;
      O.bitis = Date.now();
      this.skorYaz(kr.kazanan);
      return;
    }
    if (kr.devam) {
      O.elde = false;
      O.kirilis = false;
      this.sureyiKur(sure);
    } else this.siraGecer(takim, !!kr.faul, sure);
  }

  skorYaz(kazanan) {
    const m = this.m;
    m.oyun.oyuncular.forEach((x, i) => {
      if (!x || x.kim.startsWith("bot:")) return;
      const s = m.skor[x.kim] || (m.skor[x.kim] = { ad: x.ad, galibiyet: 0, oyun: 0 });
      s.ad = x.ad;
      s.oyun++;
      if (i % 2 === kazanan) s.galibiyet++;
    });
    // En çok 100 kişi tutulur (en eski oynayanlar düşer)
    const anahtarlar = Object.keys(m.skor);
    if (anahtarlar.length > 100) for (const a of anahtarlar.slice(0, anahtarlar.length - 100)) delete m.skor[a];
  }

  botOyna(k) {
    const O = this.m.oyun;
    if (Date.now() < O.atisBitis) { O.botZamani = O.atisBitis + 200; return; }
    const atis = F.botAtisi({ toplar: O.toplar, gruplar: O.gruplar, kirilis: O.kirilis, elde: O.elde || !O.toplar[0], takim: k % 2 }, rastgele);
    const once = O.toplar.slice();
    if (atis.beyaz) once[0] = atis.beyaz;
    if (!once[0]) { this.siraGecer(k % 2, true, 0); return; }
    this.atisYap(k, once, { yx: atis.yx, yy: atis.yy, guc: atis.guc, ust: atis.ust, yan: atis.yan });
  }

  gorunum(ben, bagli) {
    const m = this.m;
    const k = this.koltugum(ben.kim);
    return {
      ben: { koltuk: k, ad: ben.ad, yetkili: this.yetkili(ben), kurucu: m.kurucu === ben.kim },
      ayar: m.ayar,
      koltuklar: m.koltuklar.map((x) => (x ? {
        ad: x.ad, foto: x.foto, bos: false, bot: !!x.bot, bagli: !!x.bot || bagli.has(x.kim), devralinabilir: this.bosaldi(x),
        galibiyet: (m.skor[x.kim] && m.skor[x.kim].galibiyet) || 0
      } : { bos: true })),
      izleyici: this.baglilar().filter((x) => this.koltugum(x.ben.kim) < 0).length,
      oyun: m.oyun && {
        id: m.oyun.id, no: m.oyun.no, toplar: m.oyun.toplar, gruplar: m.oyun.gruplar, sira: m.oyun.sira, kirilis: m.oyun.kirilis,
        elde: m.oyun.elde, bitti: m.oyun.bitti, kazanan: m.oyun.kazanan, neden: m.oyun.neden, sureBitis: m.oyun.sureBitis,
        atisBitis: m.oyun.atisBitis, atisNo: m.oyun.atisNo, eslik: m.oyun.eslik
      },
      sunucuZamani: Date.now()
    };
  }
}
