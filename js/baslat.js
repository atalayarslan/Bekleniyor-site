// Sayfa açılışı: ?oda=... varsa odayı, yoksa lobiyi gösterir.

(function () {
  const sorun = firebaseBaslat();
  const istenenOda = new URLSearchParams(location.search).get("oda");

  oturumDegisince(() => { if (yonetici) anaOdayiHazirla(); });

  if (istenenOda && gecerliOdaId(istenenOda)) {
    odayiBaslat(istenenOda);
    if (sorun) {
      $("kurulumUyarisi").textContent = sorun;
      $("kurulumUyarisi").hidden = false;
    }
  } else {
    lobiyiBaslat();
    if (sorun) bildir(sorun);
  }
  oturumRozetleriniCiz();
})();
