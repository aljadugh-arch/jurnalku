#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  JURNALKU — Rollback LIVE ke versi sebelum deploy terakhir
#  Pakai backup .rollback yang dibuat promote-live.sh
# ═══════════════════════════════════════════════════════════════
set -e
VPS=root@129.226.82.94
LIVE=/www/wwwroot/jurnal.cc.cd
export SSHPASS=$(sed -n 's/^pass=//p' /home/aljadugh/Documents/mdigi/KREDENSIAL-VPS-AB.txt | sed -n '2p')
SSH="sshpass -e ssh -o StrictHostKeyChecking=no $VPS"

echo "⚠  ROLLBACK LIVE ke versi sebelum deploy terakhir"
read -p "   Ketik 'ROLLBACK' untuk lanjut: " confirm
[ "$confirm" = "ROLLBACK" ] || { echo "Batal."; exit 1; }

HAS=$($SSH "[ -d $LIVE/dist.rollback ] && echo yes || echo no")
[ "$HAS" = "yes" ] || { echo "❌ Tidak ada dist.rollback. Rollback manual dari /root/backups/jurnalku/"; exit 1; }

echo "▶ Memulihkan dist + server dari .rollback..."
$SSH "
  cd $LIVE
  rm -rf dist && cp -a dist.rollback dist
  cp -a server/index.cjs.rollback server/index.cjs
  cp -a server/tenant.cjs.rollback server/tenant.cjs
  cd server && node -c index.cjs && pm2 restart jurnalku --update-env
"
sleep 3
CODE=$($SSH "curl -sk https://jurnal.cc.cd/api/settings -m10 -o /dev/null -w '%{http_code}'")
echo ""
[ "$CODE" = "200" ] && echo "✅ Rollback OK → https://jurnal.cc.cd (HTTP $CODE)" || echo "❌ Rollback bermasalah (HTTP $CODE). Cek pm2 logs jurnalku"

echo ""
echo "ℹ  DB tidak di-rollback otomatis (data user berisiko hilang)."
echo "   Backup DB pre-deploy ada di: /root/backups/jurnalku/jurnalku.db.pre-deploy-*"
echo "   Restore DB manual hanya jika perlu (lihat instruksi di WORKFLOW.md)."
