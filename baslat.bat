@echo off
chcp 65001 >nul
title Bütçe Kontroll - Sunucu
cd /d "%~dp0"

set PORT=8123

echo.
echo   ₺ Bütçe Kontroll başlatılıyor...
echo   Adres  : http://localhost:%PORT%
echo   Veriler: %~dp0data\
echo.

where node >nul 2>nul
if %errorlevel%==0 (
  start "" /b node server.js
  timeout /t 2 /nobreak >nul
  start "" "http://localhost:%PORT%"
  echo   Sunucu çalışıyor (kayıt / giriş / veri senkronu aktif).
  echo   Durdurmak için bu pencereyi kapat.
  pause
  goto :eof
)

echo   [!] Node.js bulunamadı.
echo   Python ile basit sunucu başlatılıyor (hesap API'si OLMAYACAK,
echo   uygulama "Yerel mod"da çalışır - kayıtlar tarayıcıda tutulur).
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%"
  python -m http.server %PORT%
  goto :eof
)

echo   Hiçbir sunucu bulunamadı. index.html doğrudan açılıyor (yerel mod).
start "" "%~dp0index.html"
pause
