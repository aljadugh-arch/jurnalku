#!/usr/bin/env bash
# Deploy frontend JURNALKU secara atomik ke production.
set -euo pipefail

VPS_IP="${VPS_IP:?Set VPS_IP via environment}"
VPS_USER="${VPS_USER:-root}"
VPS_PASS="${VPS_PASS:?Set VPS_PASS via environment}"
VPS_DIR="${VPS_DIR:-/www/wwwroot/jurnal.cc.cd}"
PM2_APP="${PM2_APP:-jurnalku-api}"
DEPLOY_HEALTH_URL="${DEPLOY_HEALTH_URL:-https://jurnal.cc.cd/api/health}"
SSH_KNOWN_HOSTS="${SSH_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
LOCAL_DIST="${LOCAL_DIST:-dist}"
DEPLOY_ID="$(date +%Y%m%d-%H%M%S)-$$"
REMOTE_ARCHIVE="/tmp/jurnalku-dist-${DEPLOY_ID}.tar.gz"
LOCAL_ARCHIVE="$(mktemp /tmp/jurnalku-dist.XXXXXX.tar.gz)"

cleanup() {
  rm -f "$LOCAL_ARCHIVE"
}
trap cleanup EXIT

if [[ ! -f "$LOCAL_DIST/index.html" ]]; then
  echo "ERROR: $LOCAL_DIST/index.html tidak ditemukan. Jalankan npm run build." >&2
  exit 1
fi
if [[ ! -f "$SSH_KNOWN_HOSTS" ]]; then
  echo "ERROR: known_hosts tidak ditemukan: $SSH_KNOWN_HOSTS" >&2
  echo "Verifikasi fingerprint host, lalu tambahkan dengan ssh-keyscan secara manual." >&2
  exit 1
fi

export SSHPASS="$VPS_PASS"
unset VPS_PASS
SSH_OPTS=(-o StrictHostKeyChecking=yes -o UserKnownHostsFile="$SSH_KNOWN_HOSTS")
TARGET="${VPS_USER}@${VPS_IP}"

echo "[1/4] Membuat artefak $DEPLOY_ID..."
tar -czf "$LOCAL_ARCHIVE" -C "$LOCAL_DIST" .

echo "[2/4] Mengunggah artefak unik..."
sshpass -e scp "${SSH_OPTS[@]}" "$LOCAL_ARCHIVE" "$TARGET:$REMOTE_ARCHIVE"

echo "[3/4] Memasang frontend secara atomik..."
sshpass -e ssh "${SSH_OPTS[@]}" "$TARGET" bash -s -- \
  "$VPS_DIR" "$REMOTE_ARCHIVE" "$DEPLOY_ID" "$PM2_APP" "$DEPLOY_HEALTH_URL" <<'REMOTE'
set -euo pipefail
VPS_DIR="$1"
ARCHIVE="$2"
DEPLOY_ID="$3"
PM2_APP="$4"
HEALTH_URL="$5"
STAGING="$VPS_DIR/dist.staging-$DEPLOY_ID"
BACKUP="$VPS_DIR/dist.backup-$DEPLOY_ID"
ACTIVATED=0

rollback() {
  status=$?
  rm -rf "$STAGING"
  rm -f "$ARCHIVE"
  if [[ "$ACTIVATED" == "1" ]]; then
    rm -rf "$VPS_DIR/dist"
    [[ ! -d "$BACKUP" ]] || mv "$BACKUP" "$VPS_DIR/dist"
    pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap rollback ERR

mkdir -p "$STAGING"
tar -xzf "$ARCHIVE" -C "$STAGING"
test -s "$STAGING/index.html"
rm -f "$ARCHIVE"

if [[ -d "$VPS_DIR/dist" ]]; then
  mv "$VPS_DIR/dist" "$BACKUP"
fi
ACTIVATED=1
mv "$STAGING" "$VPS_DIR/dist"
pm2 restart "$PM2_APP" --update-env
for attempt in {1..10}; do
  curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null && break
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 1
done
ACTIVATED=0
find "$VPS_DIR" -maxdepth 1 -type d -name 'dist.backup-*' -mtime +7 -exec rm -rf {} +
REMOTE

echo "[4/4] Deployment sehat: $DEPLOY_HEALTH_URL"
