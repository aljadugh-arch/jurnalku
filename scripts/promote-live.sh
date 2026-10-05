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
  bash -n "$f"
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
pm2 restart "$PM2_APP" --update-env
for attempt in {1..10}; do
  curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null && break
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 1
done
curl --fail --silent --show-error --max-time 15 https://jurnalmadrasah.web.id/api/health >/dev/null
ACTIVATED=0
ln -sfn "$BACKUP" "$LIVE/.rollback-current"
ln -sfn "$SECONDARY_BACKUP" "$SECONDARY_LIVE/.rollback-current"
REMOTE

node scripts/check-live-frontend-sync.mjs jurnal.cc.cd jurnalmadrasah.web.id
echo "LIVE sehat dan frontend sinkron: $LIVE_HEALTH_URL + https://jurnalmadrasah.web.id/api/health"

# Staging hanya dipakai untuk verifikasi SEBELUM promote. Setelah promote sukses,
# hentikan agar tidak ada proses uji yang tertinggal di VPS (deploy-staging.sh
# akan membuatnya lagi saat deploy berikutnya). Dijalankan paling akhir supaya
# bila promote gagal, staging tetap hidup untuk penelusuran.
remote "pm2 stop $STG_PM2_APP >/dev/null 2>&1 || true; pm2 delete $STG_PM2_APP >/dev/null 2>&1 || true; echo 'staging dihentikan'" || true
