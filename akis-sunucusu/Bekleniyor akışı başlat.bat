@echo off
rem Çift tıkla: reklamsız akış sunucusunu ve tüneli açar (ayrıntılar baslat.ps1 içinde).
rem ExecutionPolicy sadece bu betik için atlanır; bilgisayarın ayarı değişmez.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0baslat.ps1"
