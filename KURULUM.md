# Ortak müzik odası kurulumu

Bu adımlar bir kez yapılır. Hepsi ücretsizdir; kredi kartı istenmez.

## 1. Firebase (herkesin aynı şarkıyı duyması için)

1. https://console.firebase.google.com adresine Google hesabınla gir.
2. **Proje oluştur** → bir isim ver (ör. `bekleniyor`) → Google Analytics'i kapatabilirsin → **Proje oluştur**.
3. Sol menü: **Derle (Build) → Realtime Database → Veritabanı oluştur**.
   - Konum: **Belçika (europe-west1)**
   - **Kilitli modda başlat** seç → Etkinleştir.
4. Açılan sayfada **Kurallar (Rules)** sekmesine geç. İçindekileri sil, bu repodaki
   `database.rules.json` dosyasının tamamını yapıştır → **Yayınla**.
5. Sol üstteki dişli → **Proje ayarları → Genel**. Aşağıda "Uygulamalarınız" kısmında
   **`</>` (Web)** simgesine tıkla → bir isim ver → **Uygulamayı kaydet**
   (Firebase Hosting kutusunu işaretleme).
6. Ekranda `const firebaseConfig = { ... }` görünecek. Oradaki değerleri `config.js`
   dosyasındaki `firebase: { ... }` kısmına tek tek kopyala.
   `databaseURL` satırı orada yoksa: Realtime Database sayfasının en üstündeki
   `https://...firebasedatabase.app` adresini kopyala.

## 2. YouTube API anahtarı (isimle şarkı arama için)

Bu adımı atlarsan site yine çalışır; sadece YouTube linki yapıştırarak şarkı eklenir.

1. https://console.cloud.google.com adresine gir. Üstteki proje seçicide Firebase'de
   açtığın projeyi seç (Firebase projeleri burada da görünür).
2. **API'ler ve Hizmetler → Kitaplık** → "YouTube Data API v3" ara → **Etkinleştir**.
3. **API'ler ve Hizmetler → Kimlik bilgileri → Kimlik bilgisi oluştur → API anahtarı**.
4. Oluşan anahtarı **düzenle** ve kısıtla (önemli, yoksa başkası senin kotanı harcayabilir):
   - Uygulama kısıtlamaları: **Web siteleri** → şunları ekle:
     - `https://atalayarslan.github.io/*`
     - `http://localhost:8000/*`
   - API kısıtlamaları: **Anahtarı kısıtla** → sadece **YouTube Data API v3**.
5. Anahtarı `config.js` içindeki `youtubeApiKey: ""` tırnaklarının arasına yapıştır.

Günlük ücretsiz kota yaklaşık 100 aramaya yeter. Link yapıştırmak kotayı harcamaz.

## 3. Siteyi yayınlama (GitHub Pages)

1. Değişiklikleri commit'leyip GitHub'a push'la.
2. GitHub'da repo → **Settings → Pages** → Branch: `main`, klasör: `/ (root)` → **Save**.
3. Bir iki dakika sonra site şu adreste açılır:
   `https://atalayarslan.github.io/Bekleniyor-site/bekleniyor.html`

## Bilgisayarda denemek

Dosyaya çift tıklayarak açınca YouTube oynatıcısı çalışmaz; küçük bir sunucu gerekir:

```
python -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000/bekleniyor.html` adresini aç.

## Bilmen gerekenler

- Odaya linki bilen herkes şarkı ekleyip silebilir; arkadaş sitesi için bilerek böyle bırakıldı.
- YouTube bazı videolarda reklam gösterebilir. Reklam, sağdaki ☰ panelindeki videoda görünür.
- Sahibi "başka sitelerde oynatılamaz" diye ayarladığı videolar otomatik atlanır.
