@echo off
REM =====================================================================
REM DARA FREE - Installer (Windows)
REM
REM Klik dua kali berkas ini, atau jalankan dari Command Prompt:
REM     install.bat
REM
REM Berkas ini hanya pembungkus tipis. Seluruh logika ada di
REM installer\index.js supaya perilakunya sama persis di Windows,
REM Linux, dan macOS.
REM =====================================================================

setlocal
cd /d "%~dp0"

echo.
echo   DARA FREE - Installer
echo   =====================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js tidak ditemukan.
  echo       Pasang Node.js 18 atau lebih baru dari https://nodejs.org
  echo       lalu buka jendela Command Prompt BARU dan jalankan ulang.
  echo.
  pause
  exit /b 1
)

node installer\index.js %*
set KODE=%errorlevel%

echo.
if %KODE% neq 0 (
  echo   Instalasi berhenti dengan kode %KODE%.
) else (
  echo   Selesai. Jalankan start.bat untuk menghidupkan DARA.
)
echo.
pause
exit /b %KODE%
