#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  JURNALKU — Promote STAGING → LIVE (jurnal.cc.cd:3001)
#  Deploy kode yang SUDAH diuji di staging ke production.
#  Auto-backup live sebelum overwrite. Auto-rollback jika gagal.
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."

VPS=root@129.226.82.94
LIVE=/www/wwwroot/jurnal.cc.cd
STG=/www/wwwroot/staging.jurnal.cc.cd
export SSHPASS=$(sed -n 's/^pass=//p' /home/aljadugh/Documents/mdigi/KREDENSIAL-VPS-AB.txt | sed -n '2p')
SSH="sshpass -e ssh -o StrictHostKeyChecking=no $VPS"
TS=$(date +%Y%m%d-%H%M%S)

echo "⚠  PROMOTE STAGING → LIVE (production jurnal.cc.cd)"
read -p "   Ketik 'LIVE' untuk lanjut: " confirm
[ "$confirm" = "LIVE" ] || { echo "Batal."; exit 1; }

echo "▶ [1/5] Backup live (dist + server + DB)..."
$SSH "
  cd $LIVE
  rm -rf dist.rollback && cp -a dist dist.rollback
  cp -a server/index.cjs server/index.cjs.rollback
  cp -a server/tenant.cjs server/tenant.cjs.rollback
  sqlite3 server/jurnalku.db \".backup /root/backups/jurnalku/jurnalku.db.pre-deploy-$TS\"
  echo '  ✓ backup: dist.rollback, *.rollback, DB pre-deploy-$TS'
"

echo "▶ [2/5] Copy dist staging → live..."
$SSH "rm -rf $LIVE/dist && cp -a $STG/dist $LIVE/dist"

echo "▶ [3/5] Copy server code staging → live..."
$SSH "cp -a $STG/server/index.cjs $LIVE/server/index.cjs && cp -a $STG/server/tenant.cjs $LIVE/server/tenant.cjs"

echo "▶ [4/5] Syntax check + restart live..."
$SSH "cd $LIVE/server && node -c index.cjs && node -c tenant.cjs && pm2 restart jurnalku --update-env"
sleep 3

echo "▶ [5/5] Health check live..."
CODE=$($SSH "curl -sk https://jurnal.cc.cd/api/settings -m10 -o /dev/null -w '%{http_code}'")

echo ""
if [ "$CODE" = "200" ]; then
  echo "✅ LIVE OK → https://jurnal.cc.cd (HTTP $CODE)"
  echo "   Rollback tersedia: scripts/rollback-live.sh"
else
  echo "❌ LIVE GAGAL (HTTP $CODE) — AUTO ROLLBACK..."
  $SSH "
    cd $LIVE
    rm -rf dist && mv dist.rollback dist
    mv server/index.cjs.rollback server/index.cjs
    mv server/tenant.cjs.rollback server/tenant.cjs
    cd server && pm2 restart jurnalku --update-env
  "
  sleep 3
  RC=$($SSH "curl -sk https://jurnal.cc.cd/api/settings -m10 -o /dev/null -w '%{http_code}'")
  echo "   ↩ Rollback selesai (HTTP $RC). Live dipulihkan ke versi sebelumnya."
  exit 1
fi
