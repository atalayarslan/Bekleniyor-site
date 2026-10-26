# Bekleniyor reklamsız akış: akış sunucusunu ve Cloudflare tünelini başlatır, tünelin adresini siteye
# bildirir (site yönetici hesabıyla açılınca adresi Firebase'e yazar). Pencere kapanınca ikisi de kapanır.
# Gerekenler (bir kez kuruldu): %USERPROFILE%\Bekleniyor-akis içinde venv (yt-dlp) ve cloudflared.exe

$ErrorActionPreference = "Stop"
$klasor = Join-Path $env:USERPROFILE "Bekleniyor-akis"
$env:BEKLENIYOR_ONBELLEK = Join-Path $klasor "onbellek"
$env:PYTHONIOENCODING = "utf-8"
$gunluk = Join-Path $klasor "tunel.log"
$Host.UI.RawUI.WindowTitle = "Bekleniyor reklamsız akış"

Write-Host "Bekleniyor reklamsız akış başlatılıyor..." -ForegroundColor Cyan
$sunucu = Start-Process -FilePath (Join-Path $klasor "venv\Scripts\python.exe") `
    -ArgumentList @("-I", "-W", "ignore", "`"$PSScriptRoot\sunucu.py`"") -PassThru -WindowStyle Hidden
if (Test-Path $gunluk) { Remove-Item $gunluk }
# Hızlı tünel: hesap ve alan adı gerekmez, her açılışta yeni bir *.trycloudflare.com adresi verir.
# Sadece 127.0.0.1:8790'daki akış sunucusunu dışarıya açar; bilgisayarda port açılmaz, ev IP'si gizli kalır.
$tunel = Start-Process -FilePath (Join-Path $klasor "cloudflared.exe") `
    -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8790", "--logfile", "`"$gunluk`"") `
    -PassThru -WindowStyle Hidden

try {
    $adres = $null
    for ($i = 0; $i -lt 60 -and -not $adres; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $gunluk) {
            $bulunan = Select-String -Path $gunluk -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
            if ($bulunan) { $adres = $bulunan.Matches[0].Value }
        }
    }
    if (-not $adres) { throw "Tünel açılamadı. İnternet bağlantısını kontrol et ve tekrar dene." }

    # Tünel hazır olana kadar birkaç saniye bekle, sonra siteyi adresle aç
    Start-Sleep -Seconds 4
    Start-Process ("https://atalayarslan.github.io/Bekleniyor-site/?akis=" + $adres)

    Write-Host ""
    Write-Host "Açık: $adres" -ForegroundColor Green
    Write-Host "Tarayıcıda site açıldı; yönetici hesabınla girişliysen adres kaydedilir ve odalarda"
    Write-Host "şarkılar reklamsız çalar. Bu pencere açık kaldığı sürece akış sürer."
    Write-Host ""
    Read-Host "Kapatmak için Enter'a bas (ya da pencereyi kapat)"
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host "Kapatmak için Enter'a bas"
}
finally {
    foreach ($p in @($sunucu, $tunel)) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
}
