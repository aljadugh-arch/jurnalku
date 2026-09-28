#!/usr/bin/env bash
# Pulihkan live dari snapshot yang dibuat promote-live.sh.
set -euo pipefail

VPS_IP="${VPS_IP:?Set VPS_IP via environment}"
VPS_USER="${VPS_USER:-root}"
VPS_PASS="${VPS_PASS:?Set VPS_PASS via environment}"
SSH_KNOWN_HOSTS="${SSH_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
LIVE="${LIVE_DIR:-/www/wwwroot/jurnal.cc.cd}"
LIVE_PM2_APP="${LIVE_PM2_APP:-jurnalku-api}"
LIVE_HEALTH_URL="${LIVE_HEALTH_URL:-https://jurnal.cc.cd/api/health}"

[[ -f "$SSH_KNOWN_HOSTS" ]] || { echo "ERROR: known_hosts tidak ditemukan: $SSH_KNOWN_HOSTS" >&2; exit 1; }
export SSHPASS="$VPS_PASS"
unset VPS_PASS
SSH_OPTS=(-o StrictHostKeyChecking=yes -o UserKnownHostsFile="$SSH_KNOWN_HOSTS")
TARGET="${VPS_USER}@${VPS_IP}"
remote() { sshpass -e ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

echo "PERINGATAN: tindakan ini mengganti kode production dengan versi sebelumnya. DB tidak diubah."
read -r -p "Ketik ROLLBACK untuk lanjut: " confirm
[[ "$confirm" == "ROLLBACK" ]] || { echo "Batal."; exit 1; }

remote bash -s -- "$LIVE" "$LIVE_PM2_APP" "$LIVE_HEALTH_URL" <<'REMOTE'
set -euo pipefail
LIVE="$1"; PM2_APP="$2"; HEALTH_URL="$3"
BACKUP="$(readlink -f "$LIVE/.rollback-current")"
[[ -d "$BACKUP/dist" && -d "$BACKUP/server" ]] || {
  echo "ERROR: snapshot rollback lengkap tidak ditemukan." >&2
  exit 1
}
for f in "$BACKUP"/server/*.cjs; do
  node -c "$f"
done
rm -rf "$LIVE/dist"
cp -a "$BACKUP/dist" "$LIVE/dist"
for f in "$BACKUP"/server/*.cjs; do
  install -m 0644 "$f" "$LIVE/server/$(basename "$f")"
done
pm2 restart "$PM2_APP" --update-env
for attempt in {1..10}; do
  curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null && break
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 1
done
REMOTE

echo "Rollback sehat: $LIVE_HEALTH_URL"
