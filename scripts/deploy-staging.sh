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
STG_PORT="${STG_PORT:-3003}"
STG_HEALTH_URL="${STG_HEALTH_URL:-http://127.0.0.1:${STG_PORT}/api/health}"
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

# Seluruh modul backend *.cjs (kecuali file test) dikirim, bukan daftar hardcoded,
# supaya modul baru (mis. rapor-grade-service.cjs, ledger-service.cjs) otomatis
# ikut ter-deploy dan tidak menyebabkan MODULE_NOT_FOUND di staging/production.
mapfile -t SERVER_FILES < <(find server -maxdepth 1 -name '*.cjs' ! -name '*.test.cjs' -printf '%f\n' | sort)
if [[ ${#SERVER_FILES[@]} -eq 0 ]]; then
  echo "ERROR: tidak ada file server/*.cjs ditemukan." >&2
  exit 1
fi

# Skrip bantu di server/scripts/ (mis. provision-domain.sh) TIDAK ikut terambil
# oleh find -maxdepth 1 di atas. Tanpa menyertakannya, perbaikan pada skrip itu
# hilang begitu VPS di-provision ulang, dan fitur yang memanggilnya (auto-provision
# domain custom tenant) mati diam-diam tanpa error apa pun saat deploy.
SERVER_SCRIPTS=()
if [[ -d server/scripts ]]; then
  mapfile -t SERVER_SCRIPTS < <(find server/scripts -maxdepth 1 -type f -printf '%f\n' | sort)
fi

# Aset brand di public/ dibaca LANGSUNG oleh runtime Node (bukan lewat dist):
# /favicon.ico, /apple-touch-icon.png, /og-image.png, /api/pwa/icon/:size memakai
# path.join(__dirname,'..','public',...). Kalau public/ tidak ikut dikirim, ikon
# default tetap versi lama walau build & dist sudah baru. server/uploads TIDAK
# ikut (data runtime, bukan aset kode).
mapfile -t BRAND_FILES < <(find public -maxdepth 1 -type f \( -name '*.png' -o -name '*.ico' -o -name '*.svg' -o -name 'manifest.json' -o -name 'robots.txt' -o -name 'sitemap.xml' \) -printf 'public/%f\n' | sort)

echo "[1/5] Syntax check server (${#SERVER_FILES[@]} modul, ${#SERVER_SCRIPTS[@]} skrip)..."
for f in "${SERVER_FILES[@]}"; do
  node -c "server/$f"
done
for f in "${SERVER_SCRIPTS[@]}"; do
  case "$f" in
    *.sh) bash -n "server/scripts/$f" ;;
    *.cjs|*.js) node -c "server/scripts/$f" ;;
  esac
done

echo "[2/5] Build frontend..."
npm run build

echo "[3/5] Buat dan unggah artefak..."
TAR_SERVER_ARGS=()
for f in "${SERVER_FILES[@]}"; do
  TAR_SERVER_ARGS+=("server/$f")
done
TAR_ARGS=(dist "${TAR_SERVER_ARGS[@]}")
[[ ${#SERVER_SCRIPTS[@]} -eq 0 ]] || TAR_ARGS+=(server/scripts)
[[ ${#BRAND_FILES[@]} -eq 0 ]] || TAR_ARGS+=("${BRAND_FILES[@]}")
tar -czf "$LOCAL_ARCHIVE" "${TAR_ARGS[@]}"
sshpass -e scp "${SSH_OPTS[@]}" "$LOCAL_ARCHIVE" "$TARGET:$REMOTE_ARCHIVE"

echo "[4/5] Pasang artefak staging secara atomik..."
remote bash -s -- "$STG" "$REMOTE_ARCHIVE" "$DEPLOY_ID" "$STG_PM2_APP" "$STG_HEALTH_URL" "$STG_PORT" <<'REMOTE'
set -euo pipefail
STG="$1"; ARCHIVE="$2"; DEPLOY_ID="$3"; PM2_APP="$4"; HEALTH_URL="$5"; STG_PORT="$6"
WORK="$STG/.deploy-$DEPLOY_ID"
BACKUP_SERVER="$STG/.server-backup-$DEPLOY_ID"
BACKUP_PUBLIC="$STG/.public-backup-$DEPLOY_ID"
ACTIVATED=0

# Restart, atau buat prosesnya bila belum ada (mis. dibersihkan setelah smoke
# test). Tanpa ini deploy gagal "Process not found" dan staging tidak pernah
# kembali hidup.
ensure_pm2() {
  if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
    pm2 restart "$PM2_APP" --update-env
  else
    PORT="$STG_PORT" pm2 start "$STG/server/index.cjs" --name "$PM2_APP" --cwd "$STG" --update-env
  fi
}

rollback() {
  status=$?
  rm -rf "$WORK"
  rm -f "$ARCHIVE"
  if [[ "$ACTIVATED" == "1" && -d "$BACKUP_SERVER" ]]; then
    rm -rf "$STG/dist"
    [[ ! -d "$STG/dist.previous" ]] || mv "$STG/dist.previous" "$STG/dist"
    cp -a "$BACKUP_SERVER/." "$STG/server/"
    [[ ! -d "$BACKUP_PUBLIC" ]] || cp -a "$BACKUP_PUBLIC/." "$STG/public/"
    ensure_pm2 >/dev/null 2>&1 || true
  fi
  rm -rf "$BACKUP_SERVER" "$BACKUP_PUBLIC"
  exit "$status"
}
trap rollback ERR

mkdir -p "$WORK" "$STG/server"
tar -xzf "$ARCHIVE" -C "$WORK"
test -s "$WORK/dist/index.html"
for f in "$WORK"/server/*.cjs; do
  node -c "$f"
done
for f in "$WORK"/server/scripts/*; do
  [[ -f "$f" ]] || continue
  case "$f" in
    *.sh) bash -n "$f" ;;
    *.cjs|*.js) node -c "$f" ;;
  esac
done

mkdir -p "$BACKUP_SERVER"
cp -a "$STG/server/." "$BACKUP_SERVER/" 2>/dev/null || true
ACTIVATED=1

rm -rf "$STG/dist.next"
mv "$WORK/dist" "$STG/dist.next"
rm -rf "$STG/dist.previous"
[[ ! -d "$STG/dist" ]] || mv "$STG/dist" "$STG/dist.previous"
mv "$STG/dist.next" "$STG/dist"
for f in "$WORK"/server/*.cjs; do
  install -m 0644 "$f" "$STG/server/$(basename "$f")"
done
if [[ -d "$WORK/server/scripts" ]]; then
  mkdir -p "$STG/server/scripts"
  for f in "$WORK"/server/scripts/*; do
    [[ -f "$f" ]] || continue
    case "$f" in
      *.sh) install -m 0755 "$f" "$STG/server/scripts/$(basename "$f")" ;;
      *)    install -m 0644 "$f" "$STG/server/scripts/$(basename "$f")" ;;
    esac
  done
fi
# Aset brand: runtime Node membaca public/ (bukan dist/) untuk /favicon.ico,
# /apple-touch-icon.png, /og-image.png, dan /api/pwa/icon/:size. Versi lama
# dicadangkan supaya rollback benar-benar utuh.
if [[ -d "$WORK/public" ]]; then
  mkdir -p "$STG/public" "$BACKUP_PUBLIC"
  for f in "$WORK"/public/*; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    [[ ! -f "$STG/public/$base" ]] || cp -a "$STG/public/$base" "$BACKUP_PUBLIC/$base"
    install -m 0644 "$f" "$STG/public/$base"
  done
  echo "aset brand dipasang: $(ls -1 "$WORK/public" | wc -l) berkas"
fi
ensure_pm2
for attempt in {1..10}; do
  curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null && break
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 1
done
ACTIVATED=0
rm -rf "$BACKUP_SERVER" "$BACKUP_PUBLIC"
REMOTE

echo "[5/5] STAGING sehat: $STG_HEALTH_URL"
