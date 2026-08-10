#!/bin/bash
# JURNALKU uptime watchdog. Cek health tiap run (via cron */5).
# Kalau down: auto-restart PM2 + kirim alert WA (jika WA gateway aktif).
# Diam kalau sehat (watchdog pattern).
HEALTH="http://localhost:3001/api/tenant/info"
PM2_APP="jurnalku"
LOG="/www/backups/jurnalku/uptime.log"
STATE="/tmp/jurnalku-down.flag"
# Nomor admin utk alert WA (isi via env atau edit langsung). Kosong = skip WA.
WA_NUMBER="${JURNALKU_ALERT_WA:-}"
WA_API="${JURNALKU_WA_API:-http://localhost:3001/api/wa-gateway/send-internal}"

CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH" 2>/dev/null || echo "000")

if [ "$CODE" = "200" ]; then
  # Sehat. Kalau sebelumnya down, catat recovery + hapus flag.
  if [ -f "$STATE" ]; then
    echo "[$(date)] RECOVERED (HTTP 200)" >> "$LOG"
    rm -f "$STATE"
  fi
  exit 0
fi

# DOWN. Log + restart + alert (sekali per insiden).
echo "[$(date)] DOWN (HTTP $CODE) -> restart $PM2_APP" >> "$LOG"
pm2 restart "$PM2_APP" >> "$LOG" 2>&1
sleep 5
CODE2=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH" 2>/dev/null || echo "000")
echo "[$(date)] after restart: HTTP $CODE2" >> "$LOG"

# Alert WA hanya sekali per insiden (pakai flag)
if [ ! -f "$STATE" ]; then
  touch "$STATE"
  if [ -n "$WA_NUMBER" ]; then
    MSG="[JURNALKU] Server DOWN (HTTP $CODE) pada $(date '+%H:%M %d/%m'). Auto-restart -> HTTP $CODE2."
    curl -s --max-time 10 -X POST -H 'Content-Type: application/json' \
      -d "{\"number\":\"$WA_NUMBER\",\"message\":\"$MSG\"}" "$WA_API" >> "$LOG" 2>&1 || true
  fi
fi
