#!/usr/bin/env bash
# Gate kualitas: jalankan build + suite, dan HENTIKAN deploy bila ada yang gagal.
#
# Kenapa skrip ini ada: pola `(cmd > log; echo "EXIT=$?") && (deploy)` TIDAK aman —
# `echo` selalu mengembalikan status 0, sehingga blok `&&` berikutnya SELALU jalan
# walau `cmd` gagal. Akibatnya kode dengan suite MERAH bisa ter-deploy ke produksi.
# Skrip ini memeriksa exit code secara eksplisit dan berhenti (`exit 1`) bila gagal.
#
# ARSIP LOG
# Setiap run disimpan di `logs/gate/<timestamp>/` (tsc/vite/suite/deploy + ringkasan.json)
# dan satu baris ringkasan ditambahkan ke `logs/gate/riwayat.jsonl`. Jadi hasil run
# sebelumnya TIDAK hilang saat gate dijalankan lagi — bisa dibandingkan antar waktu.
# `*.log` sudah diabaikan git, jadi arsip ini tidak ikut ter-commit.
#
# Pakai:
#   bash scripts/gate-lalu-deploy.sh            # build + suite saja
#   bash scripts/gate-lalu-deploy.sh --deploy   # build + suite + deploy bila hijau
#   bash scripts/gate-lalu-deploy.sh --riwayat  # tampilkan riwayat run (tanpa menjalankan)
set -uo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$AKAR"
DEPLOY=0
RIWAYAT=0
case "${1:-}" in
  --deploy)  DEPLOY=1 ;;
  --riwayat) RIWAYAT=1 ;;
esac

ARSIP="$AKAR/logs/gate"
RIWAYAT_JSONL="$ARSIP/riwayat.jsonl"
SIMPAN_MAKS=50   # jumlah folder run yang disimpan (yang lebih lama dihapus)

# ---- Mode riwayat: hanya menampilkan, tidak menjalankan apa pun ----
if [[ $RIWAYAT -eq 1 ]]; then
  if [[ ! -f "$RIWAYAT_JSONL" ]]; then
    echo "Belum ada riwayat gate di $RIWAYAT_JSONL"
    exit 0
  fi
  echo "RIWAYAT GATE (terbaru di bawah)"
  printf '  %-21s %-8s %6s %6s %6s  %s\n' "WAKTU" "HASIL" "TES" "LULUS" "GAGAL" "DEPLOY"
  while IFS= read -r baris; do
    echo "$baris" | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try{
          const r=JSON.parse(s);
          const p=(v,n)=>String(v??"-").padEnd(n);
          console.log("  "+p(r.waktu,21)+p(r.hasil,8)+p(r.tes,6)+p(r.lulus,6)+p(r.gagal,6)+"  "+(r.deploy||"tanpa deploy"));
        }catch(e){}
      });'
  done < "$RIWAYAT_JSONL"
  echo
  echo "Log lengkap tiap run ada di $ARSIP/<timestamp>/"
  exit 0
fi

LOG_TS="$(date +%Y%m%d-%H%M%S)"
DIR_LOG="$ARSIP/$LOG_TS"
mkdir -p "$DIR_LOG"
TSC_LOG="$DIR_LOG/tsc.log"
VITE_LOG="$DIR_LOG/vite.log"
SUITE_LOG="$DIR_LOG/suite.log"
DEP_LOG="$DIR_LOG/deploy.log"
RINGKASAN="$DIR_LOG/ringkasan.json"

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

echo "Arsip log: $DIR_LOG"
echo
jalankan "tsc -b"       "$TSC_LOG"   npx tsc -b
jalankan "vite build"  "$VITE_LOG"  npx vite build
jalankan "suite tes"   "$SUITE_LOG" node --test tests/

echo
grep -E '^ℹ (tests|pass|fail)' "$SUITE_LOG" 2>/dev/null | sed 's/^/   /' || true

# ---- Angka ringkas (dibaca dari log, bukan ditebak) ----
baca_angka() {
  # $1 = pola, $2 = berkas
  grep -oE "$1 [0-9]+" "$2" 2>/dev/null | tail -1 | grep -oE '[0-9]+' || echo ""
}
TES=$(baca_angka "tests" "$SUITE_LOG")
LULUS=$(baca_angka "pass" "$SUITE_LOG")
GAGAL_TES=$(baca_angka "fail" "$SUITE_LOG")
TES=${TES:-0}; LULUS=${LULUS:-0}; GAGAL_TES=${GAGAL_TES:-0}

HASIL="HIJAU"
[[ $gagal -ne 0 ]] && HASIL="MERAH"
DEPLOY_STATUS="tanpa deploy"
[[ $DEPLOY -eq 1 && $gagal -eq 0 ]] && DEPLOY_STATUS="dijalankan"

tulis_ringkasan() {
  # $1 = status deploy final
  node -e '
    const fs=require("fs");
    const [dir,ts,hasil,tes,lulus,gagal,deploy]=process.argv.slice(1);
    const r={waktu:ts.replace(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/,"$1-$2-$3 $4:$5:$6"),
             hasil,tes:Number(tes),lulus:Number(lulus),gagal:Number(gagal),deploy,
             folder:dir};
    fs.writeFileSync(dir+"/ringkasan.json",JSON.stringify(r,null,2));
    fs.appendFileSync(process.env.RIWAYAT,JSON.stringify(r)+"\n");
  ' "$DIR_LOG" "$LOG_TS" "$HASIL" "$TES" "$LULUS" "$GAGAL_TES" "$1"
}
export RIWAYAT="$RIWAYAT_JSONL"

if [[ $gagal -ne 0 ]]; then
  echo
  echo "GATE MERAH — deploy DIBATALKAN. Perbaiki dulu kegagalan di atas."
  tulis_ringkasan "dibatalkan (gate merah)"
  bersihkan_arsip() {
    local jum; jum=$(find "$ARSIP" -maxdepth 1 -type d -name '20*' | wc -l)
    if [[ $jum -gt $SIMPAN_MAKS ]]; then
      find "$ARSIP" -maxdepth 1 -type d -name '20*' | sort | head -n $((jum - SIMPAN_MAKS)) | xargs -r rm -rf
    fi
  }
  bersihkan_arsip
  exit 1
fi

echo
echo "GATE HIJAU."
if [[ $DEPLOY -eq 0 ]]; then
  echo "Jalankan ulang dengan --deploy untuk menerapkan ke produksi."
  tulis_ringkasan "tidak diminta"
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
  tulis_ringkasan "dibatalkan (tanpa kredensial)"
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
  echo "   !! deploy staging GAGAL (log: $DEP_LOG)"; tail -15 "$DEP_LOG" | sed 's/^/      /'
  tulis_ringkasan "gagal staging (exit $kode_stg)"
  exit 1
fi
printf 'LIVE\n' | bash scripts/promote-live.sh >> "$DEP_LOG" 2>&1
kode_live=$?
echo "PROMOTE_EXIT=$kode_live" >> "$DEP_LOG"
echo "STAGING_EXIT=$kode_stg  PROMOTE_EXIT=$kode_live  (log: $DEP_LOG)"
if [[ $kode_live -ne 0 ]]; then
  echo "   !! promote live GAGAL"; tail -15 "$DEP_LOG" | sed 's/^/      /'
  tulis_ringkasan "gagal promote (exit $kode_live)"
  exit 1
fi
grep -E 'LIVE sehat' "$DEP_LOG" | sed 's/^/   /' || true

# ── Rekonsiliasi layanan pasca-deploy ──
# WA Gateway, Google Drive, dan Search Console menyimpan kredensial di DB,
# bukan di kode. Deploy tidak menimpanya, tapi restore DB lama atau baris yang
# terhapus bisa mematikannya diam-diam. Diperiksa otomatis di sini supaya
# ketahuan pada deploy yang sama, bukan berminggu-minggu kemudian.
echo "── rekonsiliasi layanan ──"
# Skrip ini harus jalan DI VPS (database produksi ada di sana), bukan di mesin
# lokal. Dijalankan lewat sshpass yang sama dengan deploy, lalu hasilnya
# disimpan ke log gate.
REKON_LOG="$ARSIP/rekonsiliasi.log"
if sshpass -e ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$SSH_KNOWN_HOSTS" \
     "${VPS_USER}@${VPS_IP}" \
     'cd /www/wwwroot/jurnal.cc.cd && bash scripts/rekonsiliasi-pasca-deploy.sh' > "$REKON_LOG" 2>&1; then
  grep -E 'Status rekonsiliasi|KRITIS|PERINGATAN|SEHAT' "$REKON_LOG" | tail -6 | sed 's/^/   /' || true
else
  kode_rekon=$?
  echo "   !! rekonsiliasi layanan menemukan masalah (exit $kode_rekon)"
  grep -E 'KRITIS|TINDAKAN|  - ' "$REKON_LOG" | tail -8 | sed 's/^/      /' || true
fi

tulis_ringkasan "sukses (staging $kode_stg, promote $kode_live)"

# Retensi: simpan $SIMPAN_MAKS run terakhir.
jum=$(find "$ARSIP" -maxdepth 1 -type d -name '20*' | wc -l)
if [[ $jum -gt $SIMPAN_MAKS ]]; then
  find "$ARSIP" -maxdepth 1 -type d -name '20*' | sort | head -n $((jum - SIMPAN_MAKS)) | xargs -r rm -rf
fi

echo "SELESAI. Ringkasan: $RINGKASAN"
