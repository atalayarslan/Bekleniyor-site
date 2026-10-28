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
# Başka hiçbir dosyaya ya da adrese erişmez. Sadece 127.0.0.1'de dinler; dışarıya Cloudflare
# tüneliyle açılır (baslat.bat).

import json
import os
import re
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yt_dlp

PORT = int(os.environ.get("BEKLENIYOR_PORT") or 8790)  # deneme için başka port verilebilir
SURUM = "4"
# yt-dlp, YouTube'un şifreli parametrelerini çözmek için Node.js kullanır
NODE = os.environ.get("BEKLENIYOR_NODE") or os.path.expandvars(r"%LOCALAPPDATA%\Programs\nodejs\node.exe")
ONBELLEK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "onbellek") \
    if not os.environ.get("BEKLENIYOR_ONBELLEK") else os.environ["BEKLENIYOR_ONBELLEK"]
ONBELLEK_SINIRI = 800 * 1024 * 1024  # önbellek bunu geçince en eski şarkılar silinir
IZINLI = ("https://atalayarslan.github.io", "http://localhost:8000")
KIMLIK = re.compile(r"^[A-Za-z0-9_-]{11}$")
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


def log(*parca):
    print(time.strftime("%H:%M:%S"), *parca, flush=True)


# Sıradaki şarkılar önceden sadece bu kadar indirilir (atlanabilecekleri için tamamı inmez; yaklaşık ilk dakika)
KISMI_SINIR = {"video": 2_500_000, "video720": 3_500_000, "ses": 1_000_000}


class KismiBitti(Exception):
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
            if not tam:
                if self.toplam and self.indirilen() >= min(KISMI_SINIR[self.tur], self.toplam):
                    return  # başı zaten inmiş
                self.sinir = KISMI_SINIR[self.tur]
            self.hata = None
            self.calisiyor = True
        threading.Thread(target=self.indir, daemon=True).start()

    def kanca(self, d):
        if d.get("status") != "downloading":
            return
        with self.degisti:
            if self.toplam is None:
                toplam = d.get("total_bytes") or d.get("total_bytes_estimate")
                if toplam:
                    self.toplam = int(toplam)
                    log("başladı", self.kimlik, self.tur, "%.1f sn" % (time.time() - self.bas))
            self.degisti.notify_all()
            if self.sinir and (d.get("downloaded_bytes") or 0) >= self.sinir:
                raise KismiBitti()

    def indir(self):
        with indirme_sayaci:
            self.bas = time.time()
            try:
                ayar = {"quiet": True, "no_warnings": True, "noprogress": True,
                        "format": BICIM[self.tur], "outtmpl": {"default": self.yol},
                        # İnen kısım <yol>.part'ta kalır; sonraki indirme kaldığı yerden devam eder
                        "continuedl": True, "overwrites": False,
                        "js_runtimes": {"node": {"path": NODE}},
                        "progress_hooks": [self.kanca]}
                with yt_dlp.YoutubeDL(ayar) as y:
                    y.download(["https://www.youtube.com/watch?v=" + self.kimlik])
                with open(self.yol + ".tamam", "w") as f:
                    f.write("1")
                with self.degisti:
                    self.toplam = os.path.getsize(self.yol)
                    self.bitti = True
                    self.calisiyor = False
                    self.degisti.notify_all()
                log("indi", self.kimlik, self.tur, "%.1f sn" % (time.time() - self.bas), "%.1f MB" % (self.toplam / 1e6))
                onbellegi_temizle()
            except Exception as h:
                with self.degisti:
                    self.calisiyor = False
                    kismi = self.sinir and self.indirilen() >= self.sinir
                    if kismi:
                        log("başı indi", self.kimlik, self.tur, "%.1f MB" % (self.indirilen() / 1e6))
                    else:
                        log("indirilemedi", self.kimlik, self.tur, str(h)[:200])
                        self.hata = str(h)[:200]
                    self.degisti.notify_all()
                # Kısmi iniş sürerken biri şarkının tamamını istediyse (sınır kaldırıldıysa) devam et
                if kismi and self.sinir is None:
                    self.baslat(True)

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
            for d in (eski, eski + ".tamam"):
                if os.path.exists(d):
                    os.remove(d)
            with kilit:
                for anahtar, i in list(indirmeler.items()):
                    if i.yol == eski:
                        del indirmeler[anahtar]
    except Exception as h:
        log("temizlenemedi", h)


class Isleyici(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "BekleniyorAkis/" + SURUM

    def log_message(self, *a):
        pass

    def cors(self):
        kaynak = self.headers.get("Origin", "")
        self.send_header("Access-Control-Allow-Origin", kaynak if kaynak in IZINLI else IZINLI[0])
        self.send_header("Access-Control-Allow-Headers", "Range")
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
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def izinli_mi(self):
        # Tarayıcıdan gelen istekler sitenin adresini bildirir; başka sitelerin bu sunucuyu kullanmasını engeller
        for baslik in ("Origin", "Referer"):
            deger = self.headers.get(baslik)
            if deger:
                return any(deger == i or deger.startswith(i + "/") for i in IZINLI)
        return True

    def do_GET(self):
        adres = urllib.parse.urlparse(self.path)
        sorgu = urllib.parse.parse_qs(adres.query)
        if adres.path == "/saglik":
            return self.yanitla(200, {"ok": True, "surum": SURUM})
        if adres.path not in ("/akis", "/hazirla"):
            return self.yanitla(404, {"hata": "yok"})
        if not self.izinli_mi():
            return self.yanitla(403, {"hata": "izin yok"})
        kimlik = (sorgu.get("v") or [""])[0]
        tur = (sorgu.get("tur") or ["video"])[0]
        if not KIMLIK.match(kimlik) or tur not in BICIM:
            return self.yanitla(400, {"hata": "geçersiz istek"})
        if adres.path == "/hazirla":
            # kismi=1: sadece başını indir (sıradaki şarkılar). bekle=1: çalmaya yetecek kadarı inene kadar
            # bekleyip öyle cevap ver (site şarkıyı odada ancak o zaman başlatır, kimse ilk saniyeleri kaçırmaz)
            ind = indirme_al(kimlik, tur, tam=not sorgu.get("kismi"))
            hazir = True
            if sorgu.get("bekle"):
                hazir = ind.bekle(lambda: ind.bitti or (ind.toplam is not None and
                                                         ind.indirilen() >= min(400_000, ind.toplam)), 25)
            return self.yanitla(200 if not ind.hata else 502, {"ok": not ind.hata, "hazir": hazir})
        if not akis_sayaci.acquire(blocking=False):
            return self.yanitla(503, {"hata": "meşgul"})
        try:
            self.aktar(indirme_al(kimlik, tur, tam=True))
        finally:
            akis_sayaci.release()

    def aktar(self, ind):
        # Toplam boyut belli olana kadar bekle (şarkı bulunup inmeye başlayınca belli olur)
        if not ind.bekle(lambda: ind.toplam is not None, 40):
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
        try:
            if not ind.bekle(lambda: ind.indirilen() > 0, 30):
                return
            with paylasimli_ac(ind.dosya()) as f:
                while konum <= son:
                    # İndirme bu noktaya gelmediyse biraz bekle
                    if not ind.bitti and ind.indirilen() <= konum:
                        if not ind.bekle(lambda: ind.bitti or ind.indirilen() > konum, 30):
                            break
                    f.seek(konum)
                    parca = f.read(min(64 * 1024, son - konum + 1))
                    if not parca:
                        if ind.bitti or ind.hata:
                            break
                        time.sleep(0.1)
                        continue
                    self.wfile.write(parca)
                    konum += len(parca)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # tarayıcı ileri sardı ya da şarkıyı değiştirdi


class Sunucu(ThreadingHTTPServer):
    def handle_error(self, istek, adres):
        # Tarayıcı bağlantıyı kendisi kestiğinde (ileri sarma, şarkı değişimi) uzun hata dökümü basma
        if not isinstance(sys.exc_info()[1], (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
            super().handle_error(istek, adres)


if __name__ == "__main__":
    os.makedirs(ONBELLEK, exist_ok=True)
    sunucu = Sunucu(("127.0.0.1", PORT), Isleyici)
    sunucu.daemon_threads = True
    log("Bekleniyor akış sunucusu çalışıyor: http://127.0.0.1:%d (kapatmak için bu pencereyi kapat)" % PORT)
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass
