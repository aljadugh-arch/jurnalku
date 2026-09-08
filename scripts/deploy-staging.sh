#!/usr/bin/env bash
# Build lokal lalu deploy kode ke staging. Production tidak disentuh.
set -euo pipefail
cd "$(dirname "$0")/.."

VPS_IP="${VPS_IP:?Set VPS_IP via environment}"
VPS_USER="${VPS_USER:-root}"
VPS_PASS="${VPS_PASS:?Set VPS_PASS via environment}"
SSH_KNOWN_HOSTS="${SSH_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
STG="${STG_DIR:-/www/wwwroot/staging.jurnal.cc.cd}"
STG_PM2_APP="${STG_PM2_APP:-jurnalku-staging}"
STG_HEALTH_URL="${STG_HEALTH_URL:-http://127.0.0.1:3003/api/health}"
DEPLOY_ID="$(date +%Y%m%d-%H%M%S)-$$"
LOCAL_ARCHIVE="$(mktemp /tmp/jurnalku-staging.XXXXXX.tgz)"
REMOTE_ARCHIVE="/tmp/jurnalku-staging-${DEPLOY_ID}.tgz"

cleanup() { rm -f "$LOCAL_ARCHIVE"; }
trap cleanup EXIT
[[ -f "$SSH_KNOWN_HOSTS" ]] || { echo "ERROR: known_hosts tidak ditemukan: $SSH_KNOWN_HOSTS" >&2; exit 1; }

export SSHPASS="$VPS_PASS"
unset VPS_PASS
SSH_OPTS=(-o StrictHostKeyChecking=yes -o UserKnownHostsFile="$SSH_KNOWN_HOSTS")
TARGET="${VPS_USER}@${VPS_IP}"
remote() { sshpass -e ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

echo "[1/5] Syntax check server..."
node -c server/index.cjs
node -c server/tenant.cjs

echo "[2/5] Build frontend..."
npm run build

echo "[3/5] Buat dan unggah artefak..."
tar -czf "$LOCAL_ARCHIVE" dist server/index.cjs server/tenant.cjs
sshpass -e scp "${SSH_OPTS[@]}" "$LOCAL_ARCHIVE" "$TARGET:$REMOTE_ARCHIVE"

echo "[4/5] Pasang artefak staging secara atomik..."
remote bash -s -- "$STG" "$REMOTE_ARCHIVE" "$DEPLOY_ID" "$STG_PM2_APP" "$STG_HEALTH_URL" <<'REMOTE'
set -euo pipefail
STG="$1"; ARCHIVE="$2"; DEPLOY_ID="$3"; PM2_APP="$4"; HEALTH_URL="$5"
WORK="$STG/.deploy-$DEPLOY_ID"
cleanup() { rm -rf "$WORK"; rm -f "$ARCHIVE"; }
trap cleanup EXIT
mkdir -p "$WORK"
tar -xzf "$ARCHIVE" -C "$WORK"
test -s "$WORK/dist/index.html"
node -c "$WORK/server/index.cjs"
node -c "$WORK/server/tenant.cjs"
rm -rf "$STG/dist.next"
mv "$WORK/dist" "$STG/dist.next"
rm -rf "$STG/dist.previous"
[[ ! -d "$STG/dist" ]] || mv "$STG/dist" "$STG/dist.previous"
mv "$STG/dist.next" "$STG/dist"
install -m 0644 "$WORK/server/index.cjs" "$STG/server/index.cjs"
install -m 0644 "$WORK/server/tenant.cjs" "$STG/server/tenant.cjs"
pm2 restart "$PM2_APP" --update-env
for attempt in {1..10}; do
  curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null && break
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 1
done
REMOTE

echo "[5/5] STAGING sehat: $STG_HEALTH_URL"
