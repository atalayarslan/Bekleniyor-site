# Bekleniyor akış sunucusu
# Sitenin şarkıları YouTube oynatıcısı (ve reklamları) olmadan çalabilmesi için odanın sahibinin
# bilgisayarında çalışan küçük bir aracı. Şarkıyı yt-dlp ile bu bilgisayardaki önbelleğe indirir ve
# dosyadan tarayıcılara verir. İndirme sürerken de çalmaya başlanabilir; ileri sarma desteklenir.
# (YouTube'un akış adresleri onu isteyen bağlantıya ve istemciye kilitli olduğu için doğrudan
#  aktarmak yerine yt-dlp'nin kendi indiricisi kullanılır.)
#
# Adresler:
#   /saglik                                  -> {"ok": true}
#   /akis?v=<11 haneli kimlik>&tur=video|video720|ses -> şarkının kendisi (Range destekli)
#   /hazirla?v=<kimlik>&tur=video|ses        -> şarkıyı önceden indirir
#            &kismi=1  sadece başını (sıradaki şarkılar)   &bekle=1  çalmaya hazır olunca cevap verir
#   /olay  (POST, JSON)                      -> sitedeki dinleyicilerin tarayıcılarında olanlar günlüğe yazılır
# /akis, /hazirla ve /olay ayrıca &a=<erişim anahtarı> ister (aşağıda ANAHTAR).
# Başka hiçbir dosyaya ya da adrese erişmez. Sadece 127.0.0.1'de dinler; dışarıya Cloudflare
# tüneliyle açılır (baslat.bat).
#
# Günlük (BEKLENIYOR_GUNLUK verilirse, baslat.ps1 verir): her satır "tarih saat  [konu] olay  ayrıntılar".
# Konular: sunucu, indirme, akis (tarayıcıya gönderilen dosya), hazirla, site (tarayıcılardan gelen olaylar),
# durum (10 dakikada bir özet). Dinleyiciler adlarıyla (site olaylarında) ve "istemci" etiketiyle (IP'nin
# kısa özeti; IP'nin kendisi yazılmaz) görünür; aynı etiket aynı kişinin bağlantısıdır.
# Dosya 2 MB olunca yenisine geçilir, en fazla 10 eski dosya saklanır (toplam ~22 MB).

import hashlib
import hmac
import json
import logging
import logging.handlers
import os
import re
import secrets
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yt_dlp

PORT = int(os.environ.get("BEKLENIYOR_PORT") or 8790)  # deneme için başka port verilebilir
SURUM = "5"
GUNLUK = os.environ.get("BEKLENIYOR_GUNLUK")  # günlük dosyası; verilmezse sadece ekrana yazılır
# yt-dlp, YouTube'un şifreli parametrelerini çözmek için Node.js kullanır
NODE = os.environ.get("BEKLENIYOR_NODE") or os.path.expandvars(r"%LOCALAPPDATA%\Programs\nodejs\node.exe")
ONBELLEK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "onbellek") \
    if not os.environ.get("BEKLENIYOR_ONBELLEK") else os.environ["BEKLENIYOR_ONBELLEK"]
ONBELLEK_SINIRI = 800 * 1024 * 1024  # önbellek bunu geçince en eski şarkılar silinir
IZINLI = ("https://atalayarslan.github.io", "http://localhost:8000")
KIMLIK = re.compile(r"^[A-Za-z0-9_-]{11}$")
# Erişim anahtarı: baslat.ps1 her açılışta rastgele üretir ve siteye bildirir; site onu Firebase'de (sadece Google
# girişli kişilerin okuyabildiği yerde) saklar. /akis, /hazirla ve /olay istekleri ?a=<anahtar> taşımazsa reddedilir;
# böylece tünel adresini bir şekilde öğrenen yabancılar sunucuyu kullanamaz. Verilmezse rastgele üretilir.
ANAHTAR = os.environ.get("BEKLENIYOR_ANAHTAR") or secrets.token_urlsafe(24)
# video: görüntü+ses birlikte (YouTube bunu en fazla 360p verir; yedek olarak kullanılır)
# video720: sadece görüntü, 720p (sesi "ses" akışından gelir, site ikisini birlikte çalar)
# ses: sadece ses (telefonlar ve 720p görüntünün sesi)
BICIM = {"video": "18/best[height<=480][acodec!=none][vcodec!=none][ext=mp4]",
         "video720": "136/bestvideo[height<=720][ext=mp4][vcodec^=avc1]/bestvideo[height<=720][ext=mp4]",
         "ses": "140/bestaudio[ext=m4a]/bestaudio"}
TUR_MIME = {"video": "video/mp4", "video720": "video/mp4", "ses": "audio/mp4"}
AYNI_ANDA_INDIRME = 3
AYNI_ANDA_AKIS = 16

indirmeler = {}  # (kimlik, tur) -> İndirme
kilit = threading.Lock()
indirme_sayaci = threading.BoundedSemaphore(AYNI_ANDA_INDIRME)
akis_sayaci = threading.BoundedSemaphore(AYNI_ANDA_AKIS)


gunluk = logging.getLogger("bekleniyor")
gunluk.setLevel(logging.INFO)
gunluk.propagate = False


def gunlugu_kur():
    bicim = logging.Formatter("%(asctime)s  %(message)s", "%Y-%m-%d %H:%M:%S")
    ekran = logging.StreamHandler(sys.stdout)
    ekran.setFormatter(bicim)
    gunluk.addHandler(ekran)
    if GUNLUK:
        os.makedirs(os.path.dirname(os.path.abspath(GUNLUK)), exist_ok=True)
        dosya = logging.handlers.RotatingFileHandler(GUNLUK, maxBytes=2_000_000, backupCount=10, encoding="utf-8")
        dosya.setFormatter(bicim)
        gunluk.addHandler(dosya)


def tek_satir(deger, sinir=500):
    metin = re.sub(r"\x1b\[[0-9;]*m", "", str(deger))  # yt-dlp hatalarındaki renk kodları
    metin = metin.split(" Use --cookies")[0]           # bot engeli hatasının sonundaki uzun yardım metni
    return re.sub(r"\s+", " ", metin).strip()[:sinir]


def log(konu, olay, **ayrinti):
    """Günlüğe tek satır yazar: [konu] olay  anahtar=değer ..."""
    parcalar = ["[%s] %s" % (konu, olay)]
    for anahtar, deger in ayrinti.items():
        if deger is None or deger == "":
            continue
        if isinstance(deger, float):
            deger = "%.2f" % deger
        deger = tek_satir(deger)
        parcalar.append("%s=%s" % (anahtar, json.dumps(deger, ensure_ascii=False) if " " in deger else deger))
    gunluk.info("  ".join(parcalar))


def mb(bayt):
    return "%.2fMB" % ((bayt or 0) / 1e6)


# Sık görülen indirme hatalarının kısa adı; günlükte "neden=" olarak yazılır, aramayı kolaylaştırır
HATA_TURLERI = (
    ("confirm you", "youtube-bot-engeli (bu internet adresi geçici olarak engelli)"),
    ("HTTP Error 403", "youtube-403 (akış adresi reddedildi)"),
    ("HTTP Error 429", "youtube-429 (çok fazla istek)"),
    ("Requested format is not available", "bicim-yok"),
    ("Video unavailable", "video-yok"),
    ("Private video", "video-gizli"),
    ("age", "yas-siniri"),
    ("timed out", "ag-zaman-asimi"),
    ("Connection", "ag-baglanti"),
)


def hata_ozeti(hata):
    metin = str(hata)
    for parca, ad in HATA_TURLERI:
        if parca in metin:
            return ad
    return "diger"


# Sıradaki şarkılar önceden sadece bu kadar indirilir (atlanabilecekleri için tamamı inmez; yaklaşık ilk dakika)
KISMI_SINIR = {"video": 2_500_000, "video720": 3_500_000, "ses": 1_000_000}


class KismiBitti(Exception):
    pass


class IndirmeBaslamadi(Exception):
    pass


def paylasimli_ac(yol):
    """Dosyayı okumak için açar. Windows'ta okunurken yeniden adlandırılabilsin diye FILE_SHARE_DELETE ile."""
    if os.name != "nt":
        return open(yol, "rb")
    import ctypes
    import msvcrt
    from ctypes import wintypes
    CreateFileW = ctypes.windll.kernel32.CreateFileW
    CreateFileW.restype = wintypes.HANDLE
    CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                            wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    tutamac = CreateFileW(yol, 0x80000000, 0x1 | 0x2 | 0x4, None, 3, 0x80, None)  # okuma; paylaşım okuma|yazma|silme
    if tutamac in (None, wintypes.HANDLE(-1).value):
        raise OSError("açılamadı: " + yol)
    return os.fdopen(msvcrt.open_osfhandle(tutamac, os.O_RDONLY | os.O_BINARY), "rb")


class Indirme:
    """Bir şarkının (video ya da ses) önbelleğe inişi. İner inmez okunabilir; önce sadece başı (kısmi)
    inebilir, gerekince kaldığı yerden tamamlanır. İnerken <yol>.part, bitince <yol> adındadır."""

    def __init__(self, kimlik, tur):
        self.kimlik, self.tur = kimlik, tur
        self.yol = os.path.join(ONBELLEK, "%s.%s.%s" % (kimlik, tur, "m4a" if tur == "ses" else "mp4"))
        self.parca = self.yol + ".part"
        self.toplam = None   # bayt
        self.bitti = False
        self.hata = None
        self.calisiyor = False
        self.sinir = None    # kısmi indirmede durulacak bayt; None = tamamı
        self.kismi_durdu = False
        self.hata_zamani = 0
        self.son_bos_kayit = 0   # veri gönderilemeyen akış isteklerinin günlüğe son yazıldığı an
        self.atlanan_bos = 0
        self.ilk_bayt = False
        self.deneme_basi = self.bas = time.time()
        self.degisti = threading.Condition()
        if os.path.exists(self.yol) and os.path.exists(self.yol + ".tamam"):
            self.toplam = os.path.getsize(self.yol)
            self.bitti = True
            os.utime(self.yol)
        elif os.path.exists(self.yol):
            # Yarıda kalmış eski bir dosya; yt-dlp onu "zaten inmiş" sanmasın
            os.remove(self.yol)

    def dosya(self):
        return self.yol if self.bitti else self.parca

    def indirilen(self):
        for yol in (self.yol, self.parca) if self.bitti else (self.parca, self.yol):
            try:
                return os.path.getsize(yol)
            except OSError:
                pass
        return 0

    def baslat(self, tam):
        """tam=False: sadece başını indir; tam=True: tamamını (kısmi indirme sürüyorsa sınırı kaldırır)."""
        with self.degisti:
            if self.bitti:
                return
            if tam:
                self.sinir = None
            if self.calisiyor:
                return
            if self.hata and time.time() - self.hata_zamani < 15:
                # Az önce başarısız oldu; tarayıcılar saniyede bir yeniden istiyor, her birinde YouTube'a
                # gitmek (örneğin "bot musun" engeli varken) engeli uzatır
                return
            if not tam:
                if self.toplam and self.indirilen() >= min(KISMI_SINIR[self.tur], self.toplam):
                    return  # başı zaten inmiş
                self.sinir = KISMI_SINIR[self.tur]
            onceki_hata = self.hata
            self.hata = None
            self.calisiyor = True
        log("indirme", "başlatıldı", v=self.kimlik, tur=self.tur, istek="tam" if tam else "kısmi",
            elde=mb(self.indirilen()), toplam=self.toplam and mb(self.toplam), onceki_hata=onceki_hata)
        threading.Thread(target=self.indir, daemon=True).start()
        return True

    def kanca(self, d):
        if d.get("status") != "downloading":
            return
        with self.degisti:
            if not self.ilk_bayt:
                self.ilk_bayt = True
                toplam = d.get("total_bytes") or d.get("total_bytes_estimate")
                if self.toplam is None and toplam:
                    self.toplam = int(toplam)
                log("indirme", "veri gelmeye başladı", v=self.kimlik, tur=self.tur,
                    bekleme=time.time() - self.deneme_basi, toplam=mb(self.toplam),
                    bicim=(d.get("info_dict") or {}).get("format_id"))
            self.degisti.notify_all()
            if self.sinir and (d.get("downloaded_bytes") or 0) >= self.sinir:
                self.kismi_durdu = True
                raise KismiBitti()

    def indir(self):
        istendi = time.time()
        with indirme_sayaci:
            self.bas = time.time()
            if self.bas - istendi > 1:
                log("indirme", "sırada bekledi", v=self.kimlik, tur=self.tur, sure=self.bas - istendi)
            deneme = 0
            while True:
                self.kismi_durdu = False
                self.ilk_bayt = False
                self.deneme_basi = time.time()
                onceki = self.indirilen()
                try:
                    ayar = {"quiet": True, "no_warnings": True, "noprogress": True,
                            "format": BICIM[self.tur], "outtmpl": {"default": self.yol},
                            # İnen kısım <yol>.part'ta kalır; sonraki indirme kaldığı yerden devam eder
                            "continuedl": True, "overwrites": False,
                            "js_runtimes": {"node": {"path": NODE}},
                            "progress_hooks": [self.kanca]}
                    with yt_dlp.YoutubeDL(ayar) as y:
                        y.download(["https://www.youtube.com/watch?v=" + self.kimlik])
                    break
                except Exception as h:
                    with self.degisti:
                        if self.kismi_durdu and self.sinir is not None:
                            log("indirme", "başı indi", v=self.kimlik, tur=self.tur, inen=mb(self.indirilen()),
                                toplam=mb(self.toplam), sure=time.time() - self.bas)
                            self.calisiyor = False
                            self.degisti.notify_all()
                            return
                        if self.kismi_durdu:
                            # Başı inmişken biri şarkının tamamını istedi; kaldığı yerden sürer
                            log("indirme", "başı inerken tamamı istendi, sürüyor", v=self.kimlik, tur=self.tur)
                            continue
                        # İndirme yarıda koptuysa kaldığı yerden birkaç kez daha denenir; denenmezse şarkı o
                        # noktada kalır, dinleyenlerde ses yarıda kesilir. Hiç ilerlemeden olan hatalar (YouTube'un
                        # "bot musun" engeli gibi) tekrar denenmez; denemek engeli uzatır.
                        deneme += 1
                        ilerledi = self.indirilen() > onceki
                        if deneme >= 3 or not ilerledi:
                            log("indirme", "İNDİRİLEMEDİ", v=self.kimlik, tur=self.tur, deneme=deneme,
                                inen=mb(self.indirilen()), toplam=mb(self.toplam), sure=time.time() - self.bas,
                                neden=hata_ozeti(h), hata=h)
                            self.hata = tek_satir(h, 200)
                            self.hata_zamani = time.time()
                            self.calisiyor = False
                            self.degisti.notify_all()
                            return
                        log("indirme", "yarıda koptu, kaldığı yerden tekrar deneniyor", v=self.kimlik, tur=self.tur,
                            deneme=deneme, inen=mb(self.indirilen()), toplam=mb(self.toplam), hata=h)
                    time.sleep(2)
            with open(self.yol + ".tamam", "w") as f:
                f.write("1")
            with self.degisti:
                self.toplam = os.path.getsize(self.yol)
                self.bitti = True
                self.calisiyor = False
                self.degisti.notify_all()
            sure = time.time() - self.bas
            log("indirme", "indi", v=self.kimlik, tur=self.tur, boyut=mb(self.toplam), sure=sure,
                hiz="%.0fKB/sn" % (self.toplam / 1000 / max(sure, 0.01)))
            onbellegi_temizle()

    def bekle(self, kosul, sure):
        son = time.time() + sure
        with self.degisti:
            while not kosul() and not self.hata and time.time() < son:
                self.degisti.wait(0.15)
        return kosul()


def indirme_al(kimlik, tur, tam):
    with kilit:
        i = indirmeler.get((kimlik, tur))
        if i is None or (i.bitti and not os.path.exists(i.yol)):
            i = indirmeler[(kimlik, tur)] = Indirme(kimlik, tur)
    i.baslat(tam)
    return i


def onbellegi_temizle():
    try:
        dosyalar = [os.path.join(ONBELLEK, d) for d in os.listdir(ONBELLEK) if not d.endswith(".tamam")]
        dosyalar.sort(key=os.path.getmtime)
        boyut = sum(os.path.getsize(d) for d in dosyalar)
        while boyut > ONBELLEK_SINIRI and len(dosyalar) > 4:
            eski = dosyalar.pop(0)
            boyut -= os.path.getsize(eski)
            log("onbellek", "eski şarkı silindi", dosya=os.path.basename(eski), boyut=mb(os.path.getsize(eski)))
            for d in (eski, eski + ".tamam"):
                if os.path.exists(d):
                    os.remove(d)
            with kilit:
                for anahtar, i in list(indirmeler.items()):
                    if i.yol == eski:
                        del indirmeler[anahtar]
    except Exception as h:
        log("onbellek", "temizlenemedi", hata=h)


def onbellek_boyutu():
    try:
        return sum(os.path.getsize(os.path.join(ONBELLEK, d)) for d in os.listdir(ONBELLEK))
    except OSError:
        return 0


# 10 dakikalık sayaçlar; "durum" satırında yazılıp sıfırlanır
sayaclar = {"akis": 0, "akis_yarim": 0, "hazirla": 0, "site_olayi": 0, "hata": 0, "gonderilen": 0}
sayac_kilidi = threading.Lock()


def say(ad, kac=1):
    with sayac_kilidi:
        sayaclar[ad] += kac


def durum_yaz():
    while True:
        time.sleep(600)
        with sayac_kilidi:
            ozet = dict(sayaclar)
            for k in sayaclar:
                sayaclar[k] = 0
        with kilit:
            calisan = [k[0] + "." + k[1] for k, i in indirmeler.items() if i.calisiyor]
            hatali = sum(1 for i in indirmeler.values() if i.hata)
        log("durum", "son 10 dakika", akis_istegi=ozet["akis"], yarim_kalan=ozet["akis_yarim"],
            hazirla=ozet["hazirla"], site_olayi=ozet["site_olayi"], hata=ozet["hata"],
            gonderilen=mb(ozet["gonderilen"]), suren_indirme=",".join(calisan) or "yok",
            hatali_sarki=hatali, acik_akis=AYNI_ANDA_AKIS - akis_sayaci._value, onbellek=mb(onbellek_boyutu()))


# Sitedeki olaylar için: tarayıcı başına dakikada en fazla bu kadar satır (bozuk bir sayfa günlüğü doldurmasın)
OLAY_SINIRI = 60
olay_sayilari = {}


def istemci_etiketi(ip):
    return hashlib.sha256((TUZ + ip).encode()).hexdigest()[:6]


TUZ = os.urandom(8).hex()  # etiketler her açılışta değişir; IP'nin kendisi hiçbir yere yazılmaz


class Isleyici(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "BekleniyorAkis/" + SURUM
    durum = None

    def log_message(self, *a):
        pass  # her isteğin satırını kendimiz yazıyoruz (log)

    def send_response(self, kod, mesaj=None):
        self.durum = kod
        super().send_response(kod, mesaj)

    def istemci(self):
        # Tünelden gelen isteklerde dinleyicinin adresi bu başlıkta; günlüğe sadece kısa özeti yazılır
        return istemci_etiketi(self.headers.get("Cf-Connecting-Ip") or self.client_address[0])

    def cors(self):
        kaynak = self.headers.get("Origin", "")
        self.send_header("Access-Control-Allow-Origin", kaynak if kaynak in IZINLI else IZINLI[0])
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
        self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
        self.send_header("Vary", "Origin")

    def yanitla(self, durum, veri):
        govde = json.dumps(veri).encode()
        self.send_response(durum)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(govde)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(govde)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def izinli_mi(self):
        # Tarayıcıdan gelen istekler sitenin adresini bildirir; başka sitelerin bu sunucuyu kullanmasını engeller
        for baslik in ("Origin", "Referer"):
            deger = self.headers.get(baslik)
            if deger:
                return any(deger == i or deger.startswith(i + "/") for i in IZINLI)
        return True

    def anahtar_dogru(self):
        verilen = (urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("a") or [""])[0]
        return hmac.compare_digest(verilen.encode(), ANAHTAR.encode())

    def gizli_yol(self):
        # Günlüğe erişim anahtarı yazılmaz
        return re.sub(r"([?&]a=)[^&]*", r"\1***", self.path)[:120]

    def reddet(self, sebep="başka siteden gelen istek reddedildi"):
        say("hata")
        log("istek", sebep, yol=self.gizli_yol(),
            kaynak=self.headers.get("Origin") or self.headers.get("Referer"), istemci=self.istemci())
        # Okunmamış istek gövdesi (POST) aynı bağlantıdaki sonraki isteği bozmasın
        self.close_connection = True
        return self.yanitla(403, {"hata": "izin yok"})

    def do_GET(self):
        bas = time.time()
        adres = urllib.parse.urlparse(self.path)
        sorgu = urllib.parse.parse_qs(adres.query)
        if adres.path == "/saglik":
            # Her dinleyiciden dakikada bir gelir; günlüğe yazılmaz
            return self.yanitla(200, {"ok": True, "surum": SURUM})
        if adres.path not in ("/akis", "/hazirla"):
            log("istek", "bilinmeyen adres", yol=adres.path[:120], istemci=self.istemci())
            return self.yanitla(404, {"hata": "yok"})
        if not self.izinli_mi():
            return self.reddet()
        if not self.anahtar_dogru():
            return self.reddet("erişim anahtarı olmayan istek reddedildi")
        kimlik = (sorgu.get("v") or [""])[0]
        tur = (sorgu.get("tur") or ["video"])[0]
        if not KIMLIK.match(kimlik) or tur not in BICIM:
            log("istek", "geçersiz istek", yol=self.gizli_yol(), istemci=self.istemci())
            return self.yanitla(400, {"hata": "geçersiz istek"})
        if adres.path == "/hazirla":
            # kismi=1: sadece başını indir (sıradaki şarkılar). bekle=1: çalmaya yetecek kadarı inene kadar
            # bekleyip öyle cevap ver (site şarkıyı odada ancak o zaman başlatır, kimse ilk saniyeleri kaçırmaz)
            say("hazirla")
            ind = indirme_al(kimlik, tur, tam=not sorgu.get("kismi"))
            hazir = True
            if sorgu.get("bekle"):
                hazir = ind.bekle(lambda: ind.bitti or (ind.toplam is not None and (
                    ind.indirilen() >= min(400_000, ind.toplam) or not ind.calisiyor)), 25)
            if ind.hata:
                say("hata")
            log("hazirla", "HATA" if ind.hata else "hazır" if hazir else "SÜRE DOLDU, hazır değil",
                v=kimlik, tur=tur, istek="kısmi" if sorgu.get("kismi") else "tam",
                bekledi=time.time() - bas if sorgu.get("bekle") else None, elde=mb(ind.indirilen()),
                toplam=ind.toplam and mb(ind.toplam), hata=ind.hata, istemci=self.istemci())
            return self.yanitla(200 if not ind.hata else 502, {"ok": not ind.hata, "hazir": hazir})
        say("akis")
        if not akis_sayaci.acquire(blocking=False):
            say("hata")
            log("akis", "MEŞGUL: aynı anda çok fazla akış var", v=kimlik, tur=tur, istemci=self.istemci())
            return self.yanitla(503, {"hata": "meşgul"})
        try:
            self.aktar(indirme_al(kimlik, tur, tam=True), bas, (sorgu.get("yeniden") or [None])[0])
        finally:
            akis_sayaci.release()

    def aktar(self, ind, istek_basi, yeniden):
        ayrinti = dict(v=ind.kimlik, tur=ind.tur, aralik=self.headers.get("Range"), yeniden=yeniden,
                       istemci=self.istemci())
        # Toplam boyut belli olana kadar bekle (şarkı bulunup inmeye başlayınca belli olur)
        if not ind.bekle(lambda: ind.toplam is not None, 40):
            say("hata")
            log("akis", "HATA: şarkı indirilemedi", hata=ind.hata or "40 sn içinde inmeye başlamadı",
                sure=time.time() - istek_basi, **ayrinti)
            return self.yanitla(502, {"hata": ind.hata or "şarkı indirilemedi"})
        toplam = ind.toplam
        bas, son = 0, toplam - 1
        m = re.match(r"^bytes=(\d*)-(\d*)$", self.headers.get("Range") or "")
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                bas = int(m.group(1))
                if m.group(2):
                    son = min(int(m.group(2)), toplam - 1)
            else:
                bas = max(0, toplam - int(m.group(2)))
        if bas >= toplam:
            log("akis", "dosyanın dışından istendi (416)", toplam=mb(toplam), **ayrinti)
            self.send_response(416)
            self.cors()
            self.send_header("Content-Range", "bytes */%d" % toplam)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(206 if m else 200)
        self.cors()
        self.send_header("Content-Type", TUR_MIME[ind.tur])
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(son - bas + 1))
        if m:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (bas, son, toplam))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        konum = bas
        sonuc = "tamamlandı"
        try:
            if not ind.bekle(lambda: ind.indirilen() > 0, 30):
                raise IndirmeBaslamadi()
            with paylasimli_ac(ind.dosya()) as f:
                while konum <= son:
                    # İndirme bu noktaya gelmediyse biraz bekle; indirme durmuşsa (kesildiyse) yeniden başlat
                    if not ind.bitti and ind.indirilen() <= konum:
                        if not ind.calisiyor and ind.baslat(True):
                            log("akis", "durmuş indirme yeniden başlatıldı", konum=mb(konum), **ayrinti)
                        if not ind.bekle(lambda: ind.bitti or ind.indirilen() > konum, 30):
                            sonuc = "YARIM: indirme bu noktaya yetişmedi"
                            break
                    f.seek(konum)
                    parca = f.read(min(64 * 1024, son - konum + 1))
                    if not parca:
                        if ind.bitti or ind.hata:
                            sonuc = "YARIM: dosya beklenenden kısa"
                            break
                        time.sleep(0.1)
                        continue
                    self.wfile.write(parca)
                    konum += len(parca)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            sonuc = "tarayıcı bıraktı"  # ileri sardı, şarkıyı değiştirdi ya da yeterince aldı (olağan)
        except IndirmeBaslamadi:
            sonuc = "YARIM: indirme hiç başlamadı"
        except Exception as h:
            sonuc = "HATA: " + tek_satir(h, 200)
        finally:
            say("gonderilen", konum - bas)
            if konum <= son:
                # Söz verilen baytların hepsi gönderilemedi. Bağlantı açık kalırsa tarayıcı gelmeyecek
                # veriyi sonsuza dek bekler (ses kesilir, ileri sarmak da işe yaramaz); kapanınca yeniden ister.
                self.close_connection = True
                if sonuc.startswith(("YARIM", "HATA")):
                    say("akis_yarim")
                    ayrinti["hata"] = ind.hata
                    # İndirme hatalıyken tarayıcılar saniyede birkaç kez yeniden ister; hiç veri gitmeyen bu
                    # tekrarlar 15 sn'de bir satırda toplanır
                    if konum == bas and ind.hata:
                        if time.time() - ind.son_bos_kayit < 15:
                            ind.atlanan_bos += 1
                            sonuc = None
                        else:
                            ayrinti["benzer_tekrar"] = ind.atlanan_bos or None
                            ind.son_bos_kayit, ind.atlanan_bos = time.time(), 0
        if sonuc:
            log("akis", sonuc, durum=self.durum, gonderilen=mb(konum - bas), istenen=mb(son - bas + 1),
                toplam=mb(toplam), indirme="bitti" if ind.bitti else mb(ind.indirilen()),
                sure=time.time() - istek_basi, **ayrinti)

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/olay":
            return self.yanitla(404, {"hata": "yok"})
        if not self.izinli_mi():
            return self.reddet()
        if not self.anahtar_dogru():
            return self.reddet("erişim anahtarı olmayan istek reddedildi")
        uzunluk = int(self.headers.get("Content-Length") or 0)
        if uzunluk <= 0 or uzunluk > 4096:
            return self.yanitla(413, {"hata": "çok büyük"})
        govde = self.rfile.read(uzunluk)
        istemci = self.istemci()
        dakika = int(time.time() // 60)
        with sayac_kilidi:
            if len(olay_sayilari) > 1000:
                olay_sayilari.clear()
            sayi = olay_sayilari.get(istemci)
            if not sayi or sayi[0] != dakika:
                sayi = olay_sayilari[istemci] = [dakika, 0]
            sayi[1] += 1
            fazla = sayi[1] > OLAY_SINIRI
        if fazla:
            return self.yanitla(429, {"hata": "çok fazla olay"})
        try:
            veri = json.loads(govde.decode("utf-8"))
            if not isinstance(veri, dict):
                raise ValueError
        except ValueError:
            return self.yanitla(400, {"hata": "geçersiz"})
        alanlar = {"kim": veri.get("kim"), "oda": veri.get("oda"), "v": veri.get("v")}
        ek = veri.get("ayrinti") if isinstance(veri.get("ayrinti"), dict) else {}
        for anahtar, deger in list(ek.items())[:15]:
            anahtar = re.sub(r"[^A-Za-z0-9_]", "", str(anahtar))[:24]
            if anahtar and anahtar not in alanlar and anahtar not in ("konu", "olay"):
                alanlar[anahtar] = deger if isinstance(deger, (int, float)) else tek_satir(deger, 300)
        alanlar["istemci"] = istemci
        say("site_olayi")
        log("site", tek_satir(veri.get("olay") or "?", 80), **alanlar)
        self.yanitla(200, {"ok": True})


class Sunucu(ThreadingHTTPServer):
    def handle_error(self, istek, adres):
        # Tarayıcı bağlantıyı kendisi kestiğinde (ileri sarma, şarkı değişimi) hata sayılmaz
        if isinstance(sys.exc_info()[1], (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
            return
        say("hata")
        gunluk.exception("[sunucu] BEKLENMEYEN HATA (istek işlenirken)")


def is_parcacigi_hatasi(a):
    say("hata")
    gunluk.error("[sunucu] BEKLENMEYEN HATA (%s)", a.thread.name if a.thread else "?",
                 exc_info=(a.exc_type, a.exc_value, a.exc_traceback))


if __name__ == "__main__":
    os.makedirs(ONBELLEK, exist_ok=True)
    gunlugu_kur()
    threading.excepthook = is_parcacigi_hatasi
    sunucu = Sunucu(("127.0.0.1", PORT), Isleyici)
    sunucu.daemon_threads = True
    log("sunucu", "açıldı", surum=SURUM, adres="http://127.0.0.1:%d" % PORT, yt_dlp=yt_dlp.version.__version__,
        python=sys.version.split()[0], onbellek=mb(onbellek_boyutu()), gunluk=GUNLUK)
    threading.Thread(target=durum_yaz, daemon=True).start()
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass
    log("sunucu", "kapandı")