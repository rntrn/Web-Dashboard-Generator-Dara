#!/usr/bin/env bash
# =====================================================================
# DARA FREE - Installer (Linux / macOS)
#
# Jalankan:
#     chmod +x install.sh
#     ./install.sh
#
# Berkas ini hanya pembungkus tipis. Seluruh logika ada di
# installer/index.js supaya perilakunya sama persis di semua sistem.
# =====================================================================

set -euo pipefail
cd "$(dirname "$0")"

echo
echo "  DARA FREE - Installer"
echo "  ====================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  [X] Node.js tidak ditemukan."
  echo "      Pasang Node.js 18 atau lebih baru dari https://nodejs.org"
  echo "      lalu jalankan ulang skrip ini."
  exit 1
fi

VERSI_MAYOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$VERSI_MAYOR" -lt 18 ]; then
  echo "  [X] Node.js $(node -v) terlalu lama. DARA butuh Node 18 atau lebih baru."
  exit 1
fi

node installer/index.js "$@"

echo
echo "  Selesai. Jalankan ./start.sh untuk menghidupkan DARA."
