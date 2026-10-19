#!/usr/bin/env bash
# Menyiapkan dependensi uji frontend secara PERSISTEN.
#
# Kenapa ada skrip ini: `tests/frontend-grade-flows.test.cjs` membutuhkan
# react-test-renderer, yang sengaja TIDAK masuk package.json aplikasi (agar tidak
# menambah beban produksi). Sebelumnya dependensi itu dipasang manual di
# /tmp/jurnalku-frontend-grade-tests — dan /tmp HILANG setiap reboot, sehingga
# gate tiba-tiba MERAH dengan "Cannot find module .../node_modules/react"
# padahal tidak ada satu baris kode pun yang berubah.
#
# Sekarang dependensi dipasang di dalam proyek (.test-deps/), tidak ikut
# dikirim deploy (deploy hanya mengirim dist + server/*.cjs), dan bertahan
# antar reboot.
set -uo pipefail

AKAR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TUJUAN="${FRONTEND_TEST_DEPS_DIR:-$AKAR/.test-deps}"
PAKET="${FRONTEND_TEST_PACKAGES:-react@19.2.7 react-test-renderer@19.2.7}"

if [[ -d "$TUJUAN/node_modules/react" && -d "$TUJUAN/node_modules/react-test-renderer" ]]; then
  echo "Dependensi uji frontend sudah siap: $TUJUAN/node_modules"
  exit 0
fi

echo "Memasang dependensi uji frontend ke $TUJUAN …"
mkdir -p "$TUJUAN"
# shellcheck disable=SC2086
npm install --prefix "$TUJUAN" --no-audit --no-fund --package-lock=false --silent $PAKET
KODE=$?

if [[ $KODE -ne 0 ]]; then
  echo "GAGAL memasang dependensi uji frontend (exit $KODE)." >&2
  echo "Jalankan manual: npm install --prefix \"$TUJUAN\" --no-audit --no-fund --package-lock=false $PAKET" >&2
  exit 1
fi

echo "Selesai. Dependensi uji frontend tersedia di $TUJUAN/node_modules"
