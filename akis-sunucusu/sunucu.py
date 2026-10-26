# Bekleniyor akış sunucusu
# Sitenin şarkıları YouTube oynatıcısı (ve reklamları) olmadan çalabilmesi için odanın sahibinin
# bilgisayarında çalışan küçük bir aracı. Şarkıyı yt-dlp ile bu bilgisayardaki önbelleğe indirir ve
# dosyadan tarayıcılara verir. İndirme sürerken de çalmaya başlanabilir; ileri sarma desteklenir.
# (YouTube'un akış adresleri onu isteyen bağlantıya ve istemciye kilitli olduğu için doğrudan
#  aktarmak yerine yt-dlp'nin kendi indiricisi kullanılır.)
#
# Adresler:
#   /saglik                                  -> {"ok": true}
#   /akis?v=<11 haneli kimlik>&tur=video|ses -> şarkının kendisi (Range destekli)
#   /hazirla?v=<kimlik>&tur=video|ses        -> sıradaki şarkıyı önceden indirir
# Başka hiçbir dosyaya ya da adrese erişmez. Sadece 127.0.0.1'de dinler; dışarıya Cloudflare
# tüneliyle açılır (baslat.bat).

import json
import os
import re
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yt_dlp

PORT = 8790
SURUM = "2"
# yt-dlp, YouTube'un şifreli parametrelerini çözmek için Node.js kullanır
NODE = os.environ.get("BEKLENIYOR_NODE") or os.path.expandvars(r"%LOCALAPPDATA%\Programs\nodejs\node.exe")
ONBELLEK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "onbellek") \
    if not os.environ.get("BEKLENIYOR_ONBELLEK") else os.environ["BEKLENIYOR_ONBELLEK"]
ONBELLEK_SINIRI = 800 * 1024 * 1024  # önbellek bunu geçince en eski şarkılar silinir
IZINLI = ("https://atalayarslan.github.io", "http://localhost:8000")
KIMLIK = re.compile(r"^[A-Za-z0-9_-]{11}$")
BICIM = {"video": "18/best[height<=480][acodec!=none][vcodec!=none][ext=mp4]",
         "ses": "140/bestaudio[ext=m4a]/bestaudio"}
TUR_MIME = {"video": "video/mp4", "ses": "audio/mp4"}
AYNI_ANDA_INDIRME = 3
AYNI_ANDA_AKIS = 16

indirmeler = {}  # (kimlik, tur) -> İndirme
kilit = threading.Lock()
indirme_sayaci = threading.BoundedSemaphore(AYNI_ANDA_INDIRME)
akis_sayaci = threading.BoundedSemaphore(AYNI_ANDA_AKIS)


def log(*parca):
    print(time.strftime("%H:%M:%S"), *parca, flush=True)


class Indirme:
    """Bir şarkının (video ya da ses) önbelleğe inişi. Okuyucular dosya büyüdükçe okuyabilir."""

    def __init__(self, kimlik, tur):
        self.kimlik, self.tur = kimlik, tur
        self.yol = os.path.join(ONBELLEK, "%s.%s.%s" % (kimlik, tur, "mp4" if tur == "video" else "m4a"))
        self.toplam = None   # bayt
        self.bitti = False
        self.hata = None
        self.degisti = threading.Condition()
        if os.path.exists(self.yol) and os.path.exists(self.yol + ".tamam"):
            self.toplam = os.path.getsize(self.yol)
            self.bitti = True
            os.utime(self.yol)
        else:
            threading.Thread(target=self.indir, daemon=True).start()

    def indirilen(self):
        try:
            return os.path.getsize(self.yol)
        except OSError:
            return 0

    def kanca(self, d):
        if d.get("status") == "downloading" and self.toplam is None:
            toplam = d.get("total_bytes") or d.get("total_bytes_estimate")
            if toplam:
                with self.degisti:
                    self.toplam = int(toplam)
                    self.degisti.notify_all()

    def indir(self):
        with indirme_sayaci:
            bas = time.time()
            try:
                if os.path.exists(self.yol):
                    os.remove(self.yol)
                ayar = {"quiet": True, "no_warnings": True, "noprogress": True,
                        "format": BICIM[self.tur], "outtmpl": {"default": self.yol},
                        # .part dosyası olmadan doğrudan son adına yazılır; okuyucular büyüyen dosyayı okur
                        "nopart": True, "continuedl": False, "overwrites": True,
                        "js_runtimes": {"node": {"path": NODE}},
                        "progress_hooks": [self.kanca]}
                with yt_dlp.YoutubeDL(ayar) as y:
                    y.download(["https://www.youtube.com/watch?v=" + self.kimlik])
                with open(self.yol + ".tamam", "w") as f:
                    f.write("1")
                with self.degisti:
                    self.toplam = os.path.getsize(self.yol)
                    self.bitti = True
                    self.degisti.notify_all()
                log("indi", self.kimlik, self.tur, "%.1f sn" % (time.time() - bas), "%.1f MB" % (self.toplam / 1e6))
                onbellegi_temizle()
            except Exception as h:
                log("indirilemedi", self.kimlik, self.tur, str(h)[:200])
                with self.degisti:
                    self.hata = str(h)[:200]
                    self.degisti.notify_all()

    def bekle(self, kosul, sure):
        son = time.time() + sure
        with self.degisti:
            while not kosul() and not self.hata and time.time() < son:
                self.degisti.wait(0.15)
        return kosul()


def indirme_al(kimlik, tur, yeniden=False):
    with kilit:
        i = indirmeler.get((kimlik, tur))
        if i is None or (yeniden and i.hata) or (i.bitti and not os.path.exists(i.yol)):
            i = indirmeler[(kimlik, tur)] = Indirme(kimlik, tur)
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
            indirme_al(kimlik, tur, yeniden=True)
            return self.yanitla(200, {"ok": True})
        if not akis_sayaci.acquire(blocking=False):
            return self.yanitla(503, {"hata": "meşgul"})
        try:
            self.aktar(indirme_al(kimlik, tur, yeniden=True))
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
            with open(ind.yol, "rb") as f:
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


if __name__ == "__main__":
    os.makedirs(ONBELLEK, exist_ok=True)
    sunucu = ThreadingHTTPServer(("127.0.0.1", PORT), Isleyici)
    sunucu.daemon_threads = True
    log("Bekleniyor akış sunucusu çalışıyor: http://127.0.0.1:%d (kapatmak için bu pencereyi kapat)" % PORT)
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass
