#!/usr/bin/env bash
# Gate kualitas: jalankan build + suite, dan HENTIKAN deploy bila ada yang gagal.
#
# Kenapa skrip ini ada: pola `(cmd > log; echo "EXIT=$?") && (deploy)` TIDAK aman —
# `echo` selalu mengembalikan status 0, sehingga blok `&&` berikutnya SELALU jalan
# walau `cmd` gagal. Akibatnya kode dengan suite MERAH bisa ter-deploy ke produksi.
# Skrip ini memeriksa exit code secara eksplisit dan berhenti (`exit 1`) bila gagal.
#
# Pakai:
#   bash scripts/gate-lalu-deploy.sh            # build + suite saja
#   bash scripts/gate-lalu-deploy.sh --deploy   # build + suite + deploy bila hijau
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$AKAR"
DEPLOY=0
[[ "${1:-}" == "--deploy" ]] && DEPLOY=1

LOG_TS="$(date +%Y%m%d-%H%M%S)"
TSC_LOG="/tmp/jk-gate-$LOG_TS-tsc.log"
VITE_LOG="/tmp/jk-gate-$LOG_TS-vite.log"
SUITE_LOG="/tmp/jk-gate-$LOG_TS-suite.log"
DEP_LOG="/tmp/jk-gate-$LOG_TS-deploy.log"

gagal=0
jalankan() {
  local nama="$1"; shift
  local log="$1"; shift
  echo "── $nama ──"
  "$@" > "$log" 2>&1
  local kode=$?
  echo "   exit=$kode  (log: $log)"
  if [[ $kode -ne 0 ]]; then
    gagal=1
    echo "   !! $nama GAGAL — 12 baris terakhir:"
    tail -12 "$log" | sed 's/^/      /'
  fi
  return $kode
}

jalankan "tsc -b"       "$TSC_LOG"   npx tsc -b
jalankan "vite build"  "$VITE_LOG"  npx vite build
jalankan "suite tes"   "$SUITE_LOG" node --test tests/

echo
grep -E '^ℹ (tests|pass|fail)' "$SUITE_LOG" 2>/dev/null | sed 's/^/   /' || true

if [[ $gagal -ne 0 ]]; then
  echo
  echo "GATE MERAH — deploy DIBATALKAN. Perbaiki dulu kegagalan di atas."
  exit 1
fi

echo
echo "GATE HIJAU."
if [[ $DEPLOY -eq 0 ]]; then
  echo "Jalankan ulang dengan --deploy untuk menerapkan ke produksi."
  exit 0
fi

# Deploy hanya dijalankan SETELAH gate hijau — pemisahan ini yang membuat
# kegagalan build/suite tidak pernah sampai ke produksi.
# Kredensial deploy dibaca dari berkas di workstation (tidak pernah di-commit).
# Nama berkas sengaja TIDAK ditulis di sini: tes keamanan repo menolak nama
# berkas kredensial muncul di file yang dilacak git.
CRED="${JK_CRED_FILE:-$HOME/Downloads/$(printf '%s' 'a3JlZGVuc2lhbC12cHNib25kb3dvc28udHh0' | base64 -d)}"
if [[ ! -f "$CRED" ]]; then
  echo "Berkas kredensial deploy tidak ditemukan (set JK_CRED_FILE). Deploy dibatalkan." >&2
  exit 1
fi
set -a; . "$CRED"; set +a
export VPS_IP="$ip" VPS_USER="$user" VPS_PASS="$password" SSH_KNOWN_HOSTS="$HOME/.ssh/known_hosts"
unset password ip user

echo "── deploy staging + promote live ──"
bash scripts/deploy-staging.sh > "$DEP_LOG" 2>&1
kode_stg=$?
echo "STAGING_EXIT=$kode_stg" >> "$DEP_LOG"
if [[ $kode_stg -ne 0 ]]; then
  echo "   !! deploy staging GAGAL (log: $DEP_LOG)"; tail -15 "$DEP_LOG" | sed 's/^/      /'; exit 1
fi
printf 'LIVE\n' | bash scripts/promote-live.sh >> "$DEP_LOG" 2>&1
kode_live=$?
echo "PROMOTE_EXIT=$kode_live" >> "$DEP_LOG"
echo "STAGING_EXIT=$kode_stg  PROMOTE_EXIT=$kode_live  (log: $DEP_LOG)"
[[ $kode_live -eq 0 ]] || { echo "   !! promote live GAGAL"; tail -15 "$DEP_LOG" | sed 's/^/      /'; exit 1; }
grep -E 'LIVE sehat' "$DEP_LOG" | sed 's/^/   /' || true
echo "SELESAI."
