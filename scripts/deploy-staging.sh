#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  JURNALKU — Deploy ke STAGING (aman, tidak ganggu live)
#  Build lokal → kirim ke staging.jurnal.cc.cd (port 3002)
#  Live (jurnal.cc.cd:3001) TIDAK tersentuh.
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."

VPS=root@129.226.82.94
STG=/www/wwwroot/staging.jurnal.cc.cd
export SSHPASS=$(sed -n 's/^pass=//p' /home/aljadugh/Documents/mdigi/KREDENSIAL-VPS-AB.txt | sed -n '2p')
SSH="sshpass -e ssh -o StrictHostKeyChecking=no $VPS"

echo "▶ [1/5] Syntax check server..."
node -c server/index.cjs
node -c server/tenant.cjs

echo "▶ [2/5] Build frontend (tsc + vite)..."
npx tsc -b
npx vite build

echo "▶ [3/5] Kirim dist ke staging..."
tar czf /tmp/stg_dist.tgz -C dist .
base64 -w0 /tmp/stg_dist.tgz | $SSH "base64 -d > /tmp/stg_dist.tgz && rm -rf $STG/dist && mkdir -p $STG/dist && tar xzf /tmp/stg_dist.tgz -C $STG/dist && rm /tmp/stg_dist.tgz"

echo "▶ [4/5] Kirim server code ke staging..."
base64 -w0 server/index.cjs | $SSH "base64 -d > $STG/server/index.cjs"
base64 -w0 server/tenant.cjs | $SSH "base64 -d > $STG/server/tenant.cjs"

echo "▶ [5/5] Restart staging + health check..."
$SSH "cd $STG/server && node -c index.cjs && pm2 restart jurnalku-staging --update-env"
sleep 2
CODE=$($SSH "curl -s http://127.0.0.1:3002/api/settings -m8 -o /dev/null -w '%{http_code}'")

echo ""
if [ "$CODE" = "200" ]; then
  echo "✅ STAGING OK → https://staging.jurnal.cc.cd (HTTP $CODE)"
  echo "   Test manual dulu di browser. Kalau OK, jalankan: scripts/promote-live.sh"
else
  echo "❌ STAGING GAGAL (HTTP $CODE). Cek: pm2 logs jurnalku-staging"
  exit 1
fi
