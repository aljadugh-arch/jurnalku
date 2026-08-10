#!/bin/bash
# Deploy JURNALKU dist to VPS A (jurnal.cc.cd)
# Fix item #3: Tambah menu Ceklok untuk admin/operator/kepala

set -e

VPS_IP="129.226.82.94"
VPS_USER="root"
VPS_PASS="Sekolah0838#"
VPS_DIR="/www/wwwroot/jurnal.cc.cd"
LOCAL_DIST="dist"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=========================================="
echo "JURNALKU Deployment - Fix Item #3"
echo "Target: ${VPS_IP}:${VPS_DIR}"
echo "=========================================="

# 1. Build sudah dilakukan, cek dist/
if [ ! -d "$LOCAL_DIST" ]; then
  echo "ERROR: dist/ tidak ditemukan. Jalankan 'npm run build' dulu."
  exit 1
fi

echo "✓ Build found: $(du -sh $LOCAL_DIST)"

# 2. Buat tarball
TARBALL="jurnalku-dist-${TIMESTAMP}.tar.gz"
echo "→ Membuat tarball: $TARBALL"
tar -czf "/tmp/$TARBALL" -C "$LOCAL_DIST" .

# 3. Upload via scp
echo "→ Upload ke VPS..."
sshpass -p "$VPS_PASS" scp -o StrictHostKeyChecking=no "/tmp/$TARBALL" "${VPS_USER}@${VPS_IP}:/tmp/"

# 4. Backup & extract di VPS
echo "→ Deploy di VPS..."
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" << 'ENDSSH'
set -e
cd /www/wwwroot/jurnal.cc.cd

# Backup dist lama
if [ -d "dist" ]; then
  echo "  • Backup dist lama..."
  mv dist dist.bak-$(date +%Y%m%d-%H%M%S)
fi

# Extract dist baru
echo "  • Extract dist baru..."
mkdir -p dist
cd dist
tar -xzf /tmp/jurnalku-dist-*.tar.gz
rm /tmp/jurnalku-dist-*.tar.gz

echo "  ✓ Deploy selesai!"
ls -lh
ENDSSH

# 5. Restart PM2 jurnalku
echo "→ Restart PM2 jurnalku..."
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" "pm2 restart jurnalku"

echo ""
echo "=========================================="
echo "✓✓✓ DEPLOYMENT BERHASIL ✓✓✓"
echo "=========================================="
echo "Aplikasi: https://jurnal.cc.cd"
echo ""
echo "PERUBAHAN:"
echo "- Role admin/operator: menu Ceklok tersedia"
echo "- Role kepala: menu Ceklok tersedia"
echo "- Path: /guru/absensi-guru (GPS ceklok)"
echo ""
echo "Cek di browser (hard refresh: Ctrl+Shift+R)"
echo "=========================================="
