// Firebase ve YouTube ayarları. Nasıl doldurulacağı KURULUM.md dosyasında yazıyor.
// Bu değerlerin sitede herkese görünmesi normal; güvenliği Firebase kuralları
// ve YouTube anahtarındaki site kısıtlaması sağlıyor.
window.AYARLAR = {
  firebase: {
    apiKey: "AIzaSyBGxq_r4lGn2giO9-H5EnWc9DXXa2JjEnc",
    authDomain: "bekleniyor-e16eb.firebaseapp.com",
    databaseURL: "https://bekleniyor-e16eb-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "bekleniyor-e16eb",
    storageBucket: "bekleniyor-e16eb.firebasestorage.app",
    messagingSenderId: "864370173586",
    appId: "1:864370173586:web:00631e2faa23173026a84b"
  },
  // Boş kalırsa sadece YouTube linki yapıştırarak şarkı eklenebilir, isimle arama çalışmaz.
  youtubeApiKey: "AIzaSyCz1PZYmvVKdcaiWTVc9nt61xkBRuKxb2Y",
  // Cloudflare'e kurulan Spotify aracısının adresi (spotify-araci/worker.js). Boşsa sadece şarkı adı okunur.
  spotifyAraci: "",
  // Yönetim panelini görebilecek Google hesabı. Asıl kontrol database.rules.json içinde de yapılır.
  yoneticiEposta: "erayaksuhome@outlook.com"
};
