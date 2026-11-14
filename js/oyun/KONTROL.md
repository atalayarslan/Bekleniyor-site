# Yeni oyun kontrol listesi

Odaya eklenen her oyun aynı çerçeveyi (`js/oyun/kabuk.js`, `oyun-kabuk.css`) kullanır. Oyunun kendisi sadece
ortadaki oyun alanını ve kurallarını yazar. Yayından önce bu listenin hepsi tamam olmalı.

- [ ] **Koltuk:** `K.koltuk({...})` ile. Boş koltuk tıklanınca "Otur" ve "Bot ekle"; dolu koltukta yetkiye göre
      "Yerine otur", "Yerine bot koy", "Botu çıkar", "Masadan kaldır". Süre halkası sıradaki koltukta.
- [ ] **Sıra göstergesi:** `K.sira({ benim, yazi })` ve `K.sureCizgisi(oran)`. Sıra bana gelince şerit vurgu
      renginde belirginleşir, kısa ses çalar, sayfa arka plandaysa sekme başlığı uyarır (kabuk kendisi yapar).
- [ ] **Olay bildirimi:** `K.bildir(metin, "bilgi" | "uyari" | "basari")`. Faul ve ceza "uyari".
- [ ] **Menü:** `K.menu([...])`, sabit sıra: Ses (`K.sesTusu`) · Ayarlar · Kurallar · oyuna özel · Oyunu bitir · Kalk.
      "Oyunu bitir" ve "Kalk" kırmızı; Ayarlar ve Oyunu bitir sadece masayı kuran / oda sahibi.
- [ ] **Pencereler:** `K.pencere`, `K.onayla` (zarar veren seçenek kırmızı), `K.kalkSor` ("Hayır" kırmızı, "Evet" soluk).
      Tarayıcının kendi `confirm()` / `alert()` kutusu kullanılmaz.
- [ ] **Ayarlar:** `oyun-ayarlar` içinde önce "Genel" (süre, botlar), sonra oyuna özel alanlar.
- [ ] **Oyun sonu:** `K.oyunSonu({ baslik, kazandim, oyuncular, ozet, tuslar })`; "Rövanş" düğmesi.
- [ ] **Galibiyet kaydı:** sonuç aynı biçimde kaydedilir (sıralama ve oda kartı buradan okur).
- [ ] **Yerleşim:** oyun katmanı `#oda`'ya `<oyun>-acik` sınıfıyla açılır; diğer oyunu kapatır; arka plan
      bulanıklaşır (`oyun-kabuk.css`'e sınıf eklenir). Telefonda (dar ekran) dikey yerleşim denenir.
- [ ] **Renk:** vurgu her yerde `var(--oda-vurgu)` ve üstündeki yazı `var(--oda-vurgu-yazi)`; ikonlar `K.ikon(...)`.
