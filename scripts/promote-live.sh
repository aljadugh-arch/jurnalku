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
    rm -f "$LIVE"/server/*.cjs
    cp -a "$BACKUP/server/." "$LIVE/server/"
    pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap rollback ERR

# Backup seluruh dist + seluruh modul server *.cjs (bukan cuma index/tenant),
# supaya rollback benar-benar memulihkan semua dependency yang mungkin berubah.
mkdir -p "$BACKUP/server"
cp -a "$LIVE/dist" "$BACKUP/dist"
cp -a "$LIVE"/server/*.cjs "$BACKUP/server/"
mkdir -p /root/backups/jurnalku
sqlite3 "$LIVE/server/jurnalku.db" ".backup /root/backups/jurnalku/jurnalku.db.pre-deploy-$TS"

test -s "$STG/dist/index.html"
for f in "$STG"/server/*.cjs; do
  node -c "$f"
done
ACTIVATED=1
rm -rf "$LIVE/dist.next"
cp -a "$STG/dist" "$LIVE/dist.next"
rm -rf "$LIVE/dist"
mv "$LIVE/dist.next" "$LIVE/dist"
for f in "$STG"/server/*.cjs; do
  install -m 0644 "$f" "$LIVE/server/$(basename "$f")"
done
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
