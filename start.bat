@echo off
REM =====================================================================
REM DARA FREE - Jalankan aplikasi (Windows)
REM
REM     start.bat          mode pengembangan: server + client, dua jendela
REM     start.bat prod     mode produksi: satu proses, satu port
REM =====================================================================

setlocal
cd /d "%~dp0"

if not exist "server\.env" (
  echo   [X] server\.env belum ada. Jalankan install.bat dulu.
  pause
  exit /b 1
)

if /i "%~1"=="prod" goto PRODUKSI

echo.
echo   Mode pengembangan
echo   - backend  : http://localhost:3001
echo   - antarmuka: http://localhost:5173   ^<- buka alamat ini
echo.
echo   Dua jendela baru akan terbuka. Tutup jendela tersebut untuk berhenti.
echo.

start "DARA server" cmd /k "cd /d %~dp0server && npm run dev"
timeout /t 3 /nobreak >nul
start "DARA client" cmd /k "cd /d %~dp0client && npm run dev"

echo   Sudah dijalankan.
timeout /t 3 /nobreak >nul
exit /b 0

:PRODUKSI
echo.
echo   Mode produksi - membangun antarmuka lebih dulu...
call npm --prefix client run build || exit /b 1
echo.
echo   Pastikan SERVE_STATIC=true di server\.env
echo   Menjalankan server...
call npm --prefix server start
exit /b %errorlevel%
