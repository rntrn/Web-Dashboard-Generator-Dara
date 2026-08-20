@echo off
REM =====================================================================
REM DARA FREE - Uninstall (Windows)
REM
REM     uninstall.bat            tanya konfirmasi (ketik nama database)
REM     uninstall.bat --yes      lewati prompt (backup TETAP wajib jalan)
REM
REM Menghapus database + folder hasil instalasi. SELALU membuat backup
REM penuh (kode + database + metadata + .env) lebih dulu ke folder
REM _backup-dara-free di SEBELAH folder proyek - kalau backup gagal,
REM uninstall dibatalkan seluruhnya, database tidak disentuh.
REM
REM Kode sumber dan riwayat git TIDAK dihapus oleh skrip ini.
REM Detail lengkap ada di scripts\uninstall.mjs.
REM =====================================================================

setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js tidak ditemukan.
  echo       Pasang dari https://nodejs.org lalu buka Command Prompt BARU.
  echo.
  pause
  exit /b 1
)

node scripts\uninstall.mjs %*
set KODE=%errorlevel%

if %KODE% neq 0 (
  echo.
  echo   Uninstall berhenti dengan kode %KODE%.
)
echo.
pause
exit /b %KODE%
