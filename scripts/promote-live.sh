#!/usr/bin/env bash
# Promote artefak staging ke live dengan backup dan rollback otomatis.
set -euo pipefail
cd "$(dirname "$0")/.."

VPS_IP="${VPS_IP:?Set VPS_IP via environment}"
VPS_USER="${VPS_USER:-root}"
VPS_PASS="${VPS_PASS:?Set VPS_PASS via environment}"
SSH_KNOWN_HOSTS="${SSH_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
LIVE="${LIVE_DIR:-/www/wwwroot/jurnal.cc.cd}"
STG="${STG_DIR:-/www/wwwroot/staging.jurnal.cc.cd}"
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

remote bash -s -- "$LIVE" "$STG" "$TS" "$LIVE_PM2_APP" "$LIVE_HEALTH_URL" <<'REMOTE'
set -euo pipefail
LIVE="$1"; STG="$2"; TS="$3"; PM2_APP="$4"; HEALTH_URL="$5"
BACKUP="$LIVE/.rollback-$TS"
ACTIVATED=0

rollback() {
  status=$?
  if [[ "$ACTIVATED" == "1" && -d "$BACKUP" ]]; then
    rm -rf "$LIVE/dist"
    mv "$BACKUP/dist" "$LIVE/dist"
    cp -a "$BACKUP/index.cjs" "$LIVE/server/index.cjs"
    cp -a "$BACKUP/tenant.cjs" "$LIVE/server/tenant.cjs"
    pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap rollback ERR

mkdir -p "$BACKUP"
cp -a "$LIVE/dist" "$BACKUP/dist"
cp -a "$LIVE/server/index.cjs" "$BACKUP/index.cjs"
cp -a "$LIVE/server/tenant.cjs" "$BACKUP/tenant.cjs"
mkdir -p /root/backups/jurnalku
sqlite3 "$LIVE/server/jurnalku.db" ".backup /root/backups/jurnalku/jurnalku.db.pre-deploy-$TS"

test -s "$STG/dist/index.html"
node -c "$STG/server/index.cjs"
node -c "$STG/server/tenant.cjs"
ACTIVATED=1
rm -rf "$LIVE/dist.next"
cp -a "$STG/dist" "$LIVE/dist.next"
rm -rf "$LIVE/dist"
mv "$LIVE/dist.next" "$LIVE/dist"
install -m 0644 "$STG/server/index.cjs" "$LIVE/server/index.cjs"
install -m 0644 "$STG/server/tenant.cjs" "$LIVE/server/tenant.cjs"
pm2 restart "$PM2_APP" --update-env
for attempt in {1..10}; do
  curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null && break
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 1
done
ACTIVATED=0
ln -sfn "$BACKUP" "$LIVE/.rollback-current"
REMOTE

echo "LIVE sehat: $LIVE_HEALTH_URL"
