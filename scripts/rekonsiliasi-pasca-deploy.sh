#!/usr/bin/env bash
# Rekonsiliasi layanan pasca-deploy: WA Gateway, Google Drive, Search Console.
#
# Kenapa ada skrip ini, bukan langsung memanggil rekonsiliasi-layanan.cjs:
#   1. Harus dijalankan DI VPS (database produksi), bukan di mesin lokal.
#   2. Snapshot pertama harus dibuat otomatis bila belum ada, supaya deploy
#      pertama tidak berakhir "TANPA-SNAPSHOT".
#   3. Keluar dengan kode != 0 bila ada temuan KRITIS, agar gate bisa melaporkan.
#
# Yang diperiksa BUKAN "apakah layanan sedang online" — itu urusan health check.
# Yang diperiksa: apakah KONFIGURASI-nya masih utuh dibanding snapshot terakhir.
# Dengan begitu perubahan kode yang tidak seharusnya menyentuh kredensial akan
# langsung ketahuan.
set -uo pipefail

DIR_APP="${DIR_APP:-/www/wwwroot/jurnal.cc.cd}"
cd "$DIR_APP" || { echo "Direktori aplikasi tidak ditemukan: $DIR_APP"; exit 1; }

SKRIP="$DIR_APP/scripts/rekonsiliasi-layanan.cjs"
[[ -f "$SKRIP" ]] || { echo "Skrip rekonsiliasi tidak ditemukan: $SKRIP"; exit 1; }

SNAPSHOT_DIR="$DIR_APP/backups/rekonsiliasi"
mkdir -p "$SNAPSHOT_DIR"

# Snapshot pertama: kalau belum ada, buat lalu selesai (tidak ada pembanding).
if [[ ! -f "$SNAPSHOT_DIR/terakhir.json" ]]; then
  echo "Belum ada snapshot — membuat snapshot awal…"
  node "$SKRIP" simpan || { echo "Gagal membuat snapshot awal"; exit 1; }
  echo "Snapshot awal dibuat. Pemeriksaan perbedaan dimulai pada deploy berikutnya."
  exit 0
fi

KELUARAN=$(node "$SKRIP" periksa 2>&1)
KODE=$?
echo "$KELUARAN"

if [[ $KODE -ne 0 ]]; then
  echo "Pemeriksaan gagal dijalankan (exit $KODE)."
  exit 1
fi

# KRITIS = konfigurasi hilang/berubah ke keadaan mati. Itu harus terlihat.
if echo "$KELUARAN" | grep -q 'KRITIS'; then
  echo ""
  echo "TINDAKAN DIPERLUKAN:"
  node "$SKRIP" pulihkan 2>&1 | sed 's/^/  /'
  exit 2
fi

# Simpan snapshot baru setelah deploy sukses & sehat, agar perubahan yang SAH
# (mis. scan QR baru) menjadi baseline berikutnya dan tidak dilaporkan terus.
node "$SKRIP" simpan >/dev/null 2>&1 || true
exit 0
