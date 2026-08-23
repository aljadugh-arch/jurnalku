#!/bin/bash
# Deploy JURNALKU dist + server ke VPS A (jurnal.cc.cd)
set -e

VPS_IP="129.226.82.94"
VPS_USER="root"
VPS_PASS="Sekolah0838#"
VPS_DIR="/www/wwwroot/jurnal.cc.cd"
LOCAL_DIST="dist"
TARBALL="jurnalku-deploy.tar.gz"

echo "=========================================="
echo "JURNALKU Deployment"
echo "Target: ${VPS_IP}:${VPS_DIR}"
echo "=========================================="

# 1. Cek dist/
if [ ! -d "$LOCAL_DIST" ]; then
  echo "ERROR: dist/ tidak ditemukan. Jalankan 'npm run build' dulu."
  exit 1
fi

echo "✓ Build found: $(du -sh $LOCAL_DIST)"

# 2. Buat tarball dengan nama fixed
echo "→ Membuat tarball: $TARBALL"
tar -czf "/tmp/$TARBALL" -C "$LOCAL_DIST" .

# 3. Upload via scp (nama fixed, timpa yang lama)
echo "→ Upload ke VPS..."
sshpass -p "$VPS_PASS" scp -o StrictHostKeyChecking=no "/tmp/$TARBALL" "${VPS_USER}@${VPS_IP}:/tmp/"

# 4. Backup & extract di VPS
echo "→ Deploy di VPS..."
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" "
set -e
cd /www/wwwroot/jurnal.cc.cd

# Backup dist lama
if [ -d \"dist\" ]; then
  echo \"  • Backup dist lama...\"
  mv dist \"dist.bak-\$(date +%Y%m%d-%H%M%S)\"
fi

# Extract dist baru
echo \"  • Extract dist baru...\"
mkdir -p dist
cd dist
tar -xzf /tmp/$TARBALL
rm -f /tmp/$TARBALL

echo \"  ✓ Deploy selesai!\"
ls -lh
"

# 5. Restart PM2
echo "→ Restart PM2 jurnalku-api..."
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" "pm2 restart jurnalku-api"

echo ""
echo "=========================================="
echo "✓✓✓ DEPLOYMENT BERHASIL ✓✓✓"
echo "=========================================="
echo "Aplikasi: https://jurnal.cc.cd"
echo ""
echo "Cek di browser (hard refresh: Ctrl+Shift+R)"
echo "=========================================="