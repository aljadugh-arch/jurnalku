#!/usr/bin/env bash
# Salin snapshot DB live ke staging. Data staging akan ditimpa.
set -euo pipefail

VPS_IP="${VPS_IP:?Set VPS_IP via environment}"
VPS_USER="${VPS_USER:-root}"
VPS_PASS="${VPS_PASS:?Set VPS_PASS via environment}"
SSH_KNOWN_HOSTS="${SSH_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
LIVE="${LIVE_DIR:-/www/wwwroot/jurnal.cc.cd}"
STG="${STG_DIR:-/www/wwwroot/staging.jurnal.cc.cd}"
STG_PM2_APP="${STG_PM2_APP:-jurnalku-staging}"
STG_HEALTH_URL="${STG_HEALTH_URL:-http://127.0.0.1:3003/api/health}"
SNAPSHOT="/tmp/jurnalku-live-snapshot-$(date +%Y%m%d-%H%M%S)-$$.db"

[[ -f "$SSH_KNOWN_HOSTS" ]] || { echo "ERROR: known_hosts tidak ditemukan: $SSH_KNOWN_HOSTS" >&2; exit 1; }
export SSHPASS="$VPS_PASS"
unset VPS_PASS
SSH_OPTS=(-o StrictHostKeyChecking=yes -o UserKnownHostsFile="$SSH_KNOWN_HOSTS")
TARGET="${VPS_USER}@${VPS_IP}"

echo "PERINGATAN: DB staging akan ditimpa snapshot live."
read -r -p "Ketik SYNC untuk lanjut: " confirm
[[ "$confirm" == "SYNC" ]] || { echo "Batal."; exit 1; }

sshpass -e ssh "${SSH_OPTS[@]}" "$TARGET" bash -s -- \
  "$LIVE" "$STG" "$STG_PM2_APP" "$STG_HEALTH_URL" "$SNAPSHOT" <<'REMOTE'
set -euo pipefail
LIVE="$1"; STG="$2"; PM2_APP="$3"; HEALTH_URL="$4"; SNAPSHOT="$5"
cleanup() { rm -f "$SNAPSHOT"; }
trap cleanup EXIT
sqlite3 "$LIVE/server/jurnalku.db" ".backup $SNAPSHOT"
sqlite3 "$SNAPSHOT" 'PRAGMA integrity_check;' | grep -qx ok
pm2 stop "$PM2_APP" >/dev/null
install -m 0600 "$SNAPSHOT" "$STG/server/jurnalku.db"
rm -f "$STG/server/jurnalku.db-wal" "$STG/server/jurnalku.db-shm"
pm2 start "$PM2_APP" --update-env >/dev/null
for attempt in {1..10}; do
  curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null && break
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 1
done
REMOTE

echo "DB staging diperbarui dan sehat."
