#!/usr/bin/env bash
# Promote artefak staging ke live dengan backup dan rollback otomatis.
set -euo pipefail
cd "$(dirname "$0")/.."

VPS_IP="${VPS_IP:?Set VPS_IP via environment}"
VPS_USER="${VPS_USER:-root}"
VPS_PASS="${VPS_PASS:?Set VPS_PASS via environment}"
SSH_KNOWN_HOSTS="${SSH_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
LIVE="${LIVE_DIR:-/www/wwwroot/jurnal.cc.cd}"
SECONDARY_LIVE="${SECONDARY_LIVE_DIR:-/www/wwwroot/jurnalmadrasah.web.id}"
STG="${STG_DIR:-/www/wwwroot/staging.jurnal.cc.cd}"
STG_PM2_APP="${STG_PM2_APP:-jurnalku-staging}"
LIVE_PM2_APP="${LIVE_PM2_APP:-jurnalku-api}"
LIVE_HEALTH_URL="${LIVE_HEALTH_URL:-https://jurnal.cc.cd/api/health}"
TS="$(date +%Y%m%d-%H%M%S)"

[[ -f "$SSH_KNOWN_HOSTS" ]] || { echo "ERROR: known_hosts tidak ditemukan: $SSH_KNOWN_HOSTS" >&2; exit 1; }
export SSHPASS="$VPS_PASS"
unset VPS_PASS
SSH_OPTS=(-o StrictHostKeyChecking=yes -o UserKnownHostsFile="$SSH_KNOWN_HOSTS")
TARGET="${VPS_USER}@${VPS_IP}"
remote() { sshpass -e ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

echo "PERINGATAN: tindakan ini mengubah production jurnal.cc.cd."
read -r -p "Ketik LIVE untuk lanjut: " confirm
[[ "$confirm" == "LIVE" ]] || { echo "Batal."; exit 1; }

remote bash -s -- "$LIVE" "$SECONDARY_LIVE" "$STG" "$TS" "$LIVE_PM2_APP" "$LIVE_HEALTH_URL" <<'REMOTE'
set -euo pipefail
LIVE="$1"; SECONDARY_LIVE="$2"; STG="$3"; TS="$4"; PM2_APP="$5"; HEALTH_URL="$6"
BACKUP="$LIVE/.rollback-$TS"
SECONDARY_BACKUP="$SECONDARY_LIVE/.rollback-$TS"
ACTIVATED=0

rollback() {
  status=$?
  if [[ "$ACTIVATED" == "1" && -d "$BACKUP" ]]; then
    rm -rf "$LIVE/dist"
    mv "$BACKUP/dist" "$LIVE/dist"
    rm -f "$LIVE"/server/*.cjs
    cp -a "$BACKUP/server/." "$LIVE/server/"
    if [[ -d "$BACKUP/server/scripts" ]]; then
      rm -rf "$LIVE/server/scripts"
      cp -a "$BACKUP/server/scripts" "$LIVE/server/scripts"
    fi
    # Aset brand (public/) juga dikembalikan supaya ikon/favicon konsisten
    # dengan dist hasil rollback.
    [[ ! -d "$BACKUP/public" ]] || cp -a "$BACKUP/public/." "$LIVE/public/"
    [[ ! -d "$SECONDARY_BACKUP/public" ]] || cp -a "$SECONDARY_BACKUP/public/." "$SECONDARY_LIVE/public/"
    if [[ -d "$SECONDARY_BACKUP/dist" ]]; then
      rm -rf "$SECONDARY_LIVE/dist"
      mv "$SECONDARY_BACKUP/dist" "$SECONDARY_LIVE/dist"
    fi
    pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap rollback ERR

# Backup seluruh dist + seluruh modul server *.cjs (bukan cuma index/tenant),
# supaya rollback benar-benar memulihkan semua dependency yang mungkin berubah.
mkdir -p "$BACKUP/server" "$SECONDARY_BACKUP"
cp -a "$LIVE/dist" "$BACKUP/dist"
cp -a "$SECONDARY_LIVE/dist" "$SECONDARY_BACKUP/dist"
cp -a "$LIVE"/server/*.cjs "$BACKUP/server/"
# Skrip bantu (server/scripts/) juga dipakai fitur runtime (auto-provision domain
# custom). Ikut di-backup supaya rollback benar-benar memulihkan keadaan sebelumnya.
[[ ! -d "$LIVE/server/scripts" ]] || cp -a "$LIVE/server/scripts" "$BACKUP/server/scripts"
mkdir -p /root/backups/jurnalku
sqlite3 "$LIVE/server/jurnalku.db" ".backup /root/backups/jurnalku/jurnalku.db.pre-deploy-$TS"

test -s "$STG/dist/index.html"
for f in "$STG"/server/*.cjs; do
  node -c "$f"
done
for f in "$STG"/server/scripts/*; do
  [[ -f "$f" ]] || continue
  case "$f" in
    *.sh) bash -n "$f" ;;
    *.cjs|*.js) node -c "$f" ;;
  esac
done
ACTIVATED=1
rm -rf "$LIVE/dist.next" "$SECONDARY_LIVE/dist.next"
cp -a "$STG/dist" "$LIVE/dist.next"
cp -a "$STG/dist" "$SECONDARY_LIVE/dist.next"
rm -rf "$LIVE/dist" "$SECONDARY_LIVE/dist"
mv "$LIVE/dist.next" "$LIVE/dist"
mv "$SECONDARY_LIVE/dist.next" "$SECONDARY_LIVE/dist"
for f in "$STG"/server/*.cjs; do
  install -m 0644 "$f" "$LIVE/server/$(basename "$f")"
done
if [[ -d "$STG/server/scripts" ]]; then
  mkdir -p "$LIVE/server/scripts"
  for f in "$STG"/server/scripts/*; do
    [[ -f "$f" ]] || continue
    case "$f" in
      *.sh) install -m 0755 "$f" "$LIVE/server/scripts/$(basename "$f")" ;;
      *)    install -m 0644 "$f" "$LIVE/server/scripts/$(basename "$f")" ;;
    esac
  done
fi
# Aset brand dari staging → LIVE & SECONDARY. Runtime Node menyajikan
# /favicon.ico, /apple-touch-icon.png, /og-image.png, dan /api/pwa/icon/:size
# langsung dari public/ (bukan dist/), jadi public/ harus ikut dipromosikan.
if [[ -d "$STG/public" ]]; then
  mkdir -p "$LIVE/public" "$SECONDARY_LIVE/public" "$BACKUP/public" "$SECONDARY_BACKUP/public"
  for f in "$STG"/public/*; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    [[ ! -f "$LIVE/public/$base" ]] || cp -a "$LIVE/public/$base" "$BACKUP/public/$base"
    [[ ! -f "$SECONDARY_LIVE/public/$base" ]] || cp -a "$SECONDARY_LIVE/public/$base" "$SECONDARY_BACKUP/public/$base"
    install -m 0644 "$f" "$LIVE/public/$base"
    install -m 0644 "$f" "$SECONDARY_LIVE/public/$base"
  done
  echo "aset brand dipromosikan ke LIVE: $(ls -1 "$STG/public" | wc -l) berkas"
fi
pm2 restart "$PM2_APP" --update-env
# Dua domain diperiksa dengan pola yang SAMA. Sebelumnya domain utama punya 10
# percobaan sedangkan jurnalmadrasah.web.id hanya sekali — pada cold start
# setelah `pm2 restart`, Caddy sempat membalas 502 dan pemeriksaan kedua gagal
# padahal aplikasi hanya butuh ~1 detik lagi untuk siap. Pemeriksaan yang tidak
# sabar bukan pemeriksaan, hanya kebetulan.
#
# Percobaan yang gagal di tengah TIDAK mencetak error: `--show-error` membuat
# setiap percobaan pertama yang masih 502 menulis "curl: (22) ... 502" ke log,
# sehingga log promot sukses terlihat seperti gagal. Error hanya dicetak pada
# percobaan terakhir, saat memang benar-benar gagal.
tunggu_sehat() {
  local url="$1" attempt
  for attempt in {1..10}; do
    curl --fail --silent --max-time 15 "$url" >/dev/null && return 0
    if [[ "$attempt" -eq 10 ]]; then
      curl --fail --silent --show-error --max-time 15 "$url" >/dev/null
      return 1
    fi
    sleep 1
  done
}
tunggu_sehat "$HEALTH_URL" || exit 1
tunggu_sehat https://jurnalmadrasah.web.id/api/health || exit 1
ACTIVATED=0
ln -sfn "$BACKUP" "$LIVE/.rollback-current"
ln -sfn "$SECONDARY_BACKUP" "$SECONDARY_LIVE/.rollback-current"

# Retensi snapshot rollback: sisakan 5 terbaru, hapus sisanya. Tanpa ini tiap
# deploy menumpuk salinan penuh dist+server di webroot (pernah ~200 dir / 2.5GB,
# sebagian berisi salinan DB + .env yang sensitif). Glob .rollback-20* hanya
# menyentuh snapshot bertimestamp, bukan symlink .rollback-current.
bersihkan_rollback() {
  local dir="$1"
  ls -1dt "$dir"/.rollback-20* 2>/dev/null | tail -n +6 | xargs -r rm -rf
}
bersihkan_rollback "$LIVE"
bersihkan_rollback "$SECONDARY_LIVE"
REMOTE

node scripts/check-live-frontend-sync.mjs jurnal.cc.cd jurnalmadrasah.web.id
echo "LIVE sehat dan frontend sinkron: $LIVE_HEALTH_URL + https://jurnalmadrasah.web.id/api/health"

# Staging hanya dipakai untuk verifikasi SEBELUM promote. Setelah promote sukses,
# hentikan agar tidak ada proses uji yang tertinggal di VPS (deploy-staging.sh
# akan membuatnya lagi saat deploy berikutnya). Dijalankan paling akhir supaya
# bila promote gagal, staging tetap hidup untuk penelusuran.
remote "pm2 stop $STG_PM2_APP >/dev/null 2>&1 || true; pm2 delete $STG_PM2_APP >/dev/null 2>&1 || true; echo 'staging dihentikan'" || true
