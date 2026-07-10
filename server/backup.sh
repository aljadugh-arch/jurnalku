#!/bin/bash
# JURNALKU off-site backup: local sqlite backup -> upload ke Google Drive via rclone.
# Aman jika remote belum siap: skip upload, backup lokal tetap jalan.
# Dipanggil harian via cron. Retensi lokal 14 hari, retensi gdrive 30 hari.
set -e

DB="/www/wwwroot/jurnal.cc.cd/server/jurnalku.db"
DEST="/www/backups/jurnalku"
REMOTE="${JURNALKU_RCLONE_REMOTE:-jurnalku-gdrive}"   # nama remote rclone
REMOTE_DIR="${JURNALKU_RCLONE_DIR:-JurnalkuBackup}"   # folder di gdrive
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$DEST"
if [ ! -f "$DB" ]; then echo "[$(date)] DB not found: $DB"; exit 1; fi

# 1. Online consistent backup (aman untuk WAL/live DB)
FILE="$DEST/jurnalku-$STAMP.db"
sqlite3 "$DB" ".backup '$FILE'"
gzip -f "$FILE"
GZ="$FILE.gz"
echo "[$(date)] Local backup OK: $GZ ($(du -h "$GZ" | cut -f1))"

# 2. Retensi lokal 14 hari
find "$DEST" -name 'jurnalku-*.db.gz' -mtime +14 -delete

# 3. Upload ke gdrive (skip kalau remote tidak ada / tidak valid)
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q "^${REMOTE}:"; then
  if rclone lsd "${REMOTE}:" >/dev/null 2>&1; then
    if rclone copy "$GZ" "${REMOTE}:${REMOTE_DIR}/" --no-traverse 2>/dev/null; then
      echo "[$(date)] Uploaded to gdrive: ${REMOTE}:${REMOTE_DIR}/$(basename "$GZ")"
      # Retensi gdrive 30 hari
      rclone delete "${REMOTE}:${REMOTE_DIR}/" --min-age 30d 2>/dev/null || true
    else
      echo "[$(date)] WARN: upload gagal (cek koneksi/quota). Backup lokal aman."
    fi
  else
    echo "[$(date)] WARN: remote '${REMOTE}' ada tapi auth invalid. Backup lokal aman. Re-authorize rclone."
  fi
else
  echo "[$(date)] INFO: remote rclone '${REMOTE}' belum di-setup. Backup lokal saja. Jalankan setup-gdrive."
fi
