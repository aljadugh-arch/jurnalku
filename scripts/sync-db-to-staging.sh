#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  JURNALKU — Sync DB LIVE → STAGING
#  Refresh data staging pakai snapshot terbaru dari live.
#  DB staging dioverwrite (data uji lama hilang). Live read-only.
# ═══════════════════════════════════════════════════════════════
set -e
VPS=root@129.226.82.94
LIVE=/www/wwwroot/jurnal.cc.cd
STG=/www/wwwroot/staging.jurnal.cc.cd
export SSHPASS=$(sed -n 's/^pass=//p' /home/aljadugh/Documents/mdigi/KREDENSIAL-VPS-AB.txt | sed -n '2p')
SSH="sshpass -e ssh -o StrictHostKeyChecking=no $VPS"

echo "▶ Snapshot DB live → staging (live tidak terganggu)..."
$SSH "
  sqlite3 $LIVE/server/jurnalku.db \".backup /tmp/live_snap.db\"
  pm2 stop jurnalku-staging >/dev/null 2>&1
  cp /tmp/live_snap.db $STG/server/jurnalku.db
  rm -f $STG/server/jurnalku.db-wal $STG/server/jurnalku.db-shm /tmp/live_snap.db
  pm2 start jurnalku-staging >/dev/null 2>&1
"
sleep 2
CODE=$($SSH "curl -s http://127.0.0.1:3002/api/settings -m8 -o /dev/null -w '%{http_code}'")
[ "$CODE" = "200" ] && echo "✅ Staging DB di-refresh dari live (HTTP $CODE)" || echo "❌ Staging bermasalah (HTTP $CODE)"
