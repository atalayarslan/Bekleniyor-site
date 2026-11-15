# Bekleniyor

Arkadaşlarla aynı anda müzik dinlenen odalar. Her oda kendine göre süslenir (renkler, fotoğraflar, video arka plan),
odadaki herkes aynı şarkıyı aynı saniyede duyar. Odalarda okey (101) ve 8 top bilardo masası vardır.

- Site: https://atalayarslan.github.io/Bekleniyor-site/
- Sadece Google hesabıyla giriş yapanlar kullanabilir.

Bu dosya sitenin tek belgesidir: neyin nerede olduğu, hangi servisin ne iş yaptığı ve nasıl güncellendiği.

---

## 1. Parçalar

| Parça | Nerede | Ne iş yapar |
|---|---|---|
| Site | GitHub Pages (bu repo, `main` dalı) | Bütün sayfa: lobi, odalar, müzik, oyunların ekranı |
| Firebase | Proje `bekleniyor-e16eb` | Google girişi ve Realtime Database (odalar, sıra, listeler, istatistik) |
| Oyun sunucusu | Cloudflare Worker `bekleniyor-okey` (`okey-sunucu/`) | Okey ve bilardo masaları, video deposu, oyun galibiyetleri |
| Spotify aracısı | Cloudflare Worker `bekleniyor-spotify` (`spotify-araci/`) | Spotify listelerini, YouTube Mix'lerini ve sanatçı bilgisini okur |
| Akış sunucusu | Oda sahibinin bilgisayarı (`akis-sunucusu/`) | Şarkıları YouTube oynatıcısı (ve reklamı) olmadan çalar; açık değilse site YouTube'a döner |
| YouTube Data API | Google Cloud | İsimle şarkı arama (günde ~100 arama) |

## 2. Dosyalar

### Site

| Dosya | İçinde ne var |
|---|---|
| `index.html` | Sayfanın iskeleti; bütün CSS ve JS dosyaları `?v=NN` sürüm numarasıyla yüklenir |
| `config.js` | Firebase ayarları, YouTube anahtarı, sunucu adresleri, yönetici e-postası |
| `stil.css` | Lobi, oda, müzik paneli, pencereler |
| `js/temel.js` | Ortak yardımcılar, Firebase ve oturum, şarkı kaydı, kapaklar, sanatçı bulma |
| `js/baslat.js` | Açılış: önce giriş kapısı, sonra lobi ya da oda |
| `js/lobi.js` | Lobi: oda kartları, oda açma/silme, canlı sayaç, oyun rozetleri |
| `js/oda.js` | Oda: müzik (sıra, çalma, eşitleme), arama, Spotify/YouTube içe aktarma, şarkı eşleştirme, medya tuşları |
| `js/tasarim.js` | Odanın görünümü ve düzen modu (renk, fotoğraf, GIF/video, arka plan videosu) |
| `js/listeler.js` | Kişisel şarkı listeleri |
| `js/istatistik.js` | Sitede/dinleme süreleri ve lobideki sıralama (oyun galibiyetleri dahil) |
| `js/yonetim.js` | Yönetim paneli (sadece yönetici) |
| `js/oyun/kabuk.js`, `oyun-kabuk.css` | Bütün oyunların ortak parçaları (aşağıda 5. bölüm) |
| `js/oyun/oyunlar.js` | Oda üst çubuğundaki tek "Oyunlar" düğmesi |
| `js/okey/` | Okey: `kurallar.js` (kurallar, sunucuyla ortak), `masa.js` (masa çizimi), `okey.js` (bağlantı), `cetele.js`, `temalar.js` |
| `okey-masa.css`, `okey-cetele.css` | Okey masası ve çetele görünümü |
| `js/bilardo/` | Bilardo: `fizik.js` (fizik, kurallar, bot; sunucuyla ortak), `gorunum.js` (ıstaka skinleri ve top setleri), `bilardo.js` (masa, temalar ve bağlantı) |
| `bilardo.css` | Bilardo yerleşimi |
| `okey-cetele.html` | Eski çetele linklerini odaya yönlendirir |
| `database.rules.json` | Firebase güvenlik kuralları (değişince Firebase'e yayınlanmalı, bkz. 6. bölüm) |

### Sunucular

| Dosya | İçinde ne var |
|---|---|
| `okey-sunucu/src/index.js` | Yönlendirme: `/masa/<oda>`, `/bilardo/<oda>`, `/cetele/<oda>`, `/medya`, `/galibiyetler`, `/saglik` |
| `okey-sunucu/src/masa.js` | Okey masası (Durable Object `OkeyMasasi`): el, sıra, botlar, çetele, oyunu bitir, kaldır |
| `okey-sunucu/src/bilardo.js` | Bilardo masası (Durable Object `BilardoMasasi`): atışları sunucu hesaplar |
| `okey-sunucu/src/medya.js` | Oda arka plan videoları (KV `MEDYA`): asıl kalitede saklama ve oynatma |
| `okey-sunucu/src/galibiyet.js` | Bütün odaların okey/bilardo galibiyetleri (KV `MEDYA`, anahtar `galibiyetler`) |
| `okey-sunucu/src/kimlik.js` | Firebase kimlik kartı (Google girişi) doğrulama |
| `okey-sunucu/test/` | Sunucu testleri (aşağıda 6. bölüm) |
| `spotify-araci/worker.js` | Spotify aracısı |
| `akis-sunucusu/` | Ev akış sunucusu; `Bekleniyor akışı başlat.bat` ile açılır |
| `.github/` | Güvenlik taraması (Semgrep, Trivy) ve Dependabot |

## 3. Veritabanı (Firebase Realtime Database)

| Düğüm | İçinde ne var |
|---|---|
| `odalar/<oda>` | `bilgi` (ad, sahip), `tasarim`, `muzik` (çalan, sıra, önceki), `katilanlar` (odadakiler) |
| `odaFotolari/<oda>` | Fotoğraflar (`f0`–`f5`) ve arka plan (`arka`: resim, küçük video ya da oyun sunucusundaki video adresi) |
| `odaOyunlari/<oda>/<oyun>` | Masanın kısa özeti (oturan, izleyici, oyun sürüyor mu); lobideki oyun rozeti |
| `odaGecmisi/<oda>` | Odada çalınan şarkılar |
| `kullanicilar/<uid>` | Oda hakları (`slot1`, `slot2`), şarkı listeleri, okey teması, bilardo masa teması |
| `istatistik/<uid>` | Sitede ve dinlemede geçen süre (sıralama) |
| `eslesmeler` | Spotify şarkısı → YouTube videosu eşleşmeleri (bir kez yazılır) |
| `aramaOnbellek` | YouTube aramaları (7 gün; kota harcamamak için) |
| `aktifOturum`, `ayarlar`, `yasakli`, `yoneticiler` | Tek oda kuralı, akış sunucusu adresi, yasaklılar, yöneticiler |

Her okuma ve yazma Google girişi ister; ayrıntılar `database.rules.json` içinde.

## 4. Müzik

- Şarkı ekleme: isimle arama, YouTube linki/listesi, Spotify şarkı/liste/albüm linki ya da Spotify'dan
  Ctrl+A, Ctrl+C ile kopyalanan çoklu şarkı linkleri (Ara kutusuna ya da yeni listeye yapıştırılır).
- Spotify şarkıları çalınacağı an YouTube'da aranır. Eşleştirme şarkı adını, sanatçıyı ve Spotify'daki süreyi
  karşılaştırır; canlı, konser, remix, cover gibi sürümler geride kalır ("live" yazarak aranırsa öne çıkar).
- Akış sunucusu açıksa şarkılar reklamsız çalar; kapalıysa YouTube oynatıcısı kullanılır.
- Telefonda ekran kapalıyken: "sonraki"ye basınca ya da şarkı bitince sıradaki şarkı aynı anda bu cihazda akıştan
  başlatılır, oda sonra güncellenir (tarayıcı gizli sayfada yeni sesi ancak dokunuşun/biten sesin hemen ardından
  başlatıyor). Sıradaki şarkının sesi önceden tamamen hazırlanır. Sayfa gizliyken YouTube'a düşülmez (gizli sayfada
  YouTube çalamaz); ekran açılınca akış yeniden denenir, YouTube'a düşülmüşse şarkı kaldığı saniyeden akışa döner.
- Klavyedeki medya tuşları (⏯ ⏭ ⏮) odanın şarkılarını yönetir (bilgisayarda).

## 5. Oyunlar

Okey ve bilardo aynı ortak kabuğu (`js/oyun/kabuk.js`, `oyun-kabuk.css`) kullanır. Oyundan oyuna değişen tek şey
ortadaki oyun alanıdır.

- Masa sunucuda tutulur (Cloudflare Durable Object). Kurallar sunucuda uygulanır; tarayıcı sadece çizer.
- Telefon yatay tutulduğunda ayrı bir düzen devreye girer; telefonda menüde "Tam ekran" düğmesi vardır.
- Oyun bitince galibiyetler sunucuda kaydedilir (sadece Google hesapları; botlar sayılmaz).
- Görünüm (sadece çizim, oyunu etkilemez): okeyde taş/masa teması; bilardoda masa teması, ıstaka skini (sıradan,
  nadir, destansı, efsanevi; bazıları canlı) ve top seti. Bilardoda ıstakayı masadaki herkes görür (sunucu iletir);
  masa ve toplar kişinin kendi ekranındadır. Seçim `kullanicilar/<uid>/bilardoTema` içinde `m=…;i=…;t=…` olarak saklanır.

### Yeni oyun eklerken kontrol listesi

Yayından önce hepsi tamam olmalı:

- [ ] **Koltuk:** `K.koltuk({...})`. Boş koltuk tıklanınca "Otur" ve "Bot ekle"; dolu koltukta yetkiye göre
      "Yerine otur", "Yerine bot koy", "Botu çıkar", "Masadan kaldır". Süre halkası sıradaki koltukta.
- [ ] **Sıra göstergesi:** `K.sira({ benim, yazi })` ve `K.sureCizgisi(oran)`. Sıra bana gelince şerit renklenir,
      ses çalar, sayfa arka plandaysa sekme başlığı uyarır (kabuk kendisi yapar).
- [ ] **Olay bildirimi:** `K.bildir(metin, "bilgi" | "uyari" | "basari")`. Faul ve ceza "uyari".
- [ ] **Menü:** `K.menu([...])`, sabit sıra: Ses (`K.sesTusu`) · Ayarlar · Kurallar · oyuna özel · Oyunu bitir · Kalk.
      "Oyunu bitir" ve "Kalk" kırmızı; Ayarlar ve Oyunu bitir sadece masayı kuran ya da oda sahibi.
- [ ] **Pencereler:** `K.pencere`, `K.onayla` (zarar veren seçenek kırmızı), `K.kalkSor` ("Hayır" kırmızı, "Evet" soluk).
      Tarayıcının kendi `confirm()` / `alert()` kutusu kullanılmaz.
- [ ] **Ayarlar:** `oyun-ayarlar` içinde önce "Genel" (süre, botlar), sonra oyuna özel alanlar.
- [ ] **Oyun sonu:** `K.oyunSonu({ baslik, kazandim, oyuncular, ozet, tuslar })`, "Rövanş" düğmesiyle.
- [ ] **Galibiyet:** sunucu oyun bitince `galibiyetYaz(env, "<oyun>", oyuncular)` çağırır.
- [ ] **Lobi rozeti:** tarayıcı her durum güncellemesinde `OyunKabugu.durumYayinla("<oyun>", {...})` çağırır;
      `database.rules.json`'da `odaOyunlari` altına oyunun adı eklenir.
- [ ] **Oyunlar düğmesi:** oyunun açma düğmesi `js/oyun/oyunlar.js` içindeki `OYUN_TUSLARI` listesine eklenir.
- [ ] **Yerleşim:** oyun katmanı `#oda`'ya `<oyun>-acik` sınıfıyla açılır, diğer oyunu kapatır; bilgisayarda,
      dik telefonda ve yatay telefonda (ör. 812×375) denenir.
- [ ] **Renk ve ikon:** vurgu her yerde `var(--oda-vurgu)`, üstündeki yazı `var(--oda-vurgu-yazi)`; ikonlar `K.ikon(...)`.

## 6. Güncelleme

### Siteyi güncellemek

1. Değişiklikten sonra `index.html`'deki bütün `?v=NN` sayılarını bir artır (tarayıcılar eski dosyaları
   10 dakika önbellekte tutar; sayı değişince yenisini alırlar).
2. Commit'le ve GitHub'a push'la. GitHub Pages birkaç dakikada yayınlar.
3. Tarayıcıda Ctrl+F5 (telefonda sekmeyi kapatıp yeniden aç).

### Firebase kurallarını yayınlamak

`database.rules.json` değişirse: Firebase konsolu → Realtime Database → **Rules** → içindekilerin hepsini sil,
dosyanın tamamını yapıştır → **Publish**. Kurallar siteden önce yayınlanmalı; yoksa yeni alanları yazan istekler
reddedilir.

### Cloudflare sunucularını güncellemek

`okey-sunucu/` içinden:

```
node node_modules\wrangler\bin\wrangler.js deploy
```

Spotify aracısı için `spotify-araci/` içinden `node ..\okey-sunucu\node_modules\wrangler\bin\wrangler.js deploy`.
Sunucu, siteden önce güncellenir.

### Testler

`okey-sunucu/` içinden `node test/<dosya>`:

- `kural.test.mjs`, `kopuk.test.mjs`, `yonetim.test.mjs` (okey), `bilardo.masa.test.mjs`, `galibiyet.test.mjs`
- `bilardo.fizik.sim.mjs`, `bot.sim.mjs` (benzetim)
- `masa.test.mjs` ve `bot.test.mjs` çalışan bir yerel sunucu ister

### Bilgisayarda denemek

Site için küçük bir sunucu gerekir (dosyaya çift tıklayınca YouTube oynatıcısı çalışmaz):

```
python -m http.server 8000
```

Oyun sunucusunu yerelde açmak için `okey-sunucu/` içinden
`node node_modules\wrangler\bin\wrangler.js dev --port 8787 --var MISAFIR_IZNI:1`. Site `localhost`'ta açılınca
yerel oyun sunucusuna (`127.0.0.1:8787`) bağlanır.

## 7. İlk kurulum (bir kez yapılır)

1. **Firebase:** Proje → Realtime Database (Belçika, `europe-west1`, kilitli modda) → Rules sekmesine
   `database.rules.json` → Proje ayarlarında Web uygulaması → değerleri `config.js` içindeki `firebase` kısmına yaz.
2. **Google girişi:** Authentication → Sign-in method → Google açık. Authorized domains listesinde
   `atalayarslan.github.io`. Firebase anahtarının site kısıtlamasında `https://bekleniyor-e16eb.firebaseapp.com/*`.
3. **YouTube anahtarı:** Google Cloud → "YouTube Data API v3" etkinleştir → API anahtarı oluştur → sadece
   `https://atalayarslan.github.io/*` ve `http://localhost:8000/*` sitelerine ve sadece bu API'ye kısıtla →
   `config.js` içindeki `youtubeApiKey`.
4. **GitHub Pages:** Settings → Pages → Branch `main`, klasör `/ (root)`.
5. **Cloudflare:** `okey-sunucu/wrangler.toml` içindeki Durable Object'ler ve `MEDYA` KV'si; ilk yayın
   `wrangler deploy` ile.
6. **Yönetici:** `config.js`'teki `yoneticiEposta` ve `database.rules.json`'daki e-posta aynı olmalı. Yönetici ilk
   girişte Ana Oda'yı (`?oda=ana`) kendi adına kurar.

## 8. Bilmen gerekenler

- Oda açmak Google girişi ister; her hesap en fazla 2 oda açar (yönetici sınırsız).
- Odaya linki bilen herkes şarkı ekleyip silebilir; arkadaş sitesi için bilerek böyle.
- Arka plan videosu en fazla 20 MB; MP4 ve WebM olduğu gibi saklanır, diğerleri yüksek kalitede çevrilir.
- Oyun galibiyetleri 15 Kasım 2026'dan itibaren sayılır.
- YouTube oynatıcısıyla çalarken bazı videolarda reklam çıkabilir; akış sunucusu açıkken çıkmaz.
