#!/usr/bin/env bash
# =====================================================================
# DARA FREE - Uninstall (Linux / macOS)
#
#     ./uninstall.sh            tanya konfirmasi (ketik nama database)
#     ./uninstall.sh --yes      lewati prompt (backup TETAP wajib jalan)
#
# Menghapus database + folder hasil instalasi. SELALU membuat backup
# penuh (kode + database + metadata + .env) lebih dulu ke folder
# _backup-dara-free di SEBELAH folder proyek - kalau backup gagal,
# uninstall dibatalkan seluruhnya, database tidak disentuh.
#
# Kode sumber dan riwayat git TIDAK dihapus oleh skrip ini.
# Detail lengkap ada di scripts/uninstall.mjs.
# =====================================================================

set -uo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "  [X] Node.js tidak ditemukan. Pasang dari https://nodejs.org"
  exit 1
fi

node scripts/uninstall.mjs "$@"
