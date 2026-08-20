#!/usr/bin/env bash
# =====================================================================
# DARA FREE - Jalankan aplikasi (Linux / macOS)
#
#     ./start.sh          mode pengembangan: server + client bersamaan
#     ./start.sh prod     mode produksi: satu proses, satu port
# =====================================================================

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f server/.env ]; then
  echo "  [X] server/.env belum ada. Jalankan ./install.sh dulu."
  exit 1
fi

if [ "${1:-dev}" = "prod" ]; then
  echo "  Mode produksi - membangun antarmuka lebih dulu..."
  npm --prefix client run build
  echo "  Pastikan SERVE_STATIC=true di server/.env"
  exec npm --prefix server start
fi

echo
echo "  Mode pengembangan"
echo "  - backend  : http://localhost:3001"
echo "  - antarmuka: http://localhost:5173   <- buka alamat ini"
echo "  Tekan Ctrl+C untuk berhenti."
echo

# Jalankan keduanya; Ctrl+C mematikan kedua proses sekaligus.
npm --prefix server run dev &
PID_SERVER=$!
sleep 2
npm --prefix client run dev &
PID_CLIENT=$!

trap 'echo; echo "  Menghentikan..."; kill $PID_SERVER $PID_CLIENT 2>/dev/null || true' INT TERM
wait
