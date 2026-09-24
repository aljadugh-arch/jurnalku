#!/bin/bash

# Test TTS API di VPS Jurnalku
# Script untuk test generate audio lokal via espeak

VPS_IP="${VPS_IP:-}"
VPS_USER="${VPS_USER:-}"
VPS_PASS="${VPS_PASS:-}"
PORT="${PORT:-22}"

if [ -z "$VPS_IP" ] || [ -z "$VPS_USER" ] || [ -z "$VPS_PASS" ]; then
  echo "Usage: VPS_IP=xxx VPS_USER=xxx VPS_PASS=xxx $0"
  exit 1
fi

export SSHPASS="$VPS_PASS"

echo "=== Testing Local TTS API on VPS ==="
echo "VPS: $VPS_IP"
echo ""

# 1. Verify espeak installed
echo "[1] Verify espeak installed..."
sshpass -e ssh -p "$PORT" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "which espeak" && echo "✓ espeak OK" || exit 1
echo ""

# 2. Test espeak directly
echo "[2] Test espeak directly (generate WAV)..."
sshpass -e ssh -p "$PORT" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "espeak -l id -w /tmp/test-tts.wav 'Test Ahmad masuk' && file /tmp/test-tts.wav && ls -lh /tmp/test-tts.wav && rm /tmp/test-tts.wav" && echo "✓ espeak generate WAV OK" || exit 1
echo ""

# 3. Check upload dir exists
echo "[3] Check uploads directory..."
sshpass -e ssh -p "$PORT" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "ls -ld /www/wwwroot/jurnal.cc.cd/server/uploads && ls -ld /www/wwwroot/jurnal.cc.cd/server/uploads/tts_local_cache 2>/dev/null || mkdir -p /www/wwwroot/jurnal.cc.cd/server/uploads/tts_local_cache" && echo "✓ uploads dirs OK" || exit 1
echo ""

# 4. Check API logs for errors
echo "[4] Check API logs..."
sshpass -e ssh -p "$PORT" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "pm2 logs jurnalku-api --lines 10 --nostream | grep -E '(TTS|error|Error|ERR)' || echo '(no TTS errors)'
"
echo ""

echo "=== All checks passed! ==="
echo "TTS Local is ready. Test by:"
echo "  1. Go to Admin > Pengaturan"
echo "  2. Scroll to TTS Prewarm"
echo "  3. Click 'Mulai Pre-Warm'"
echo "  (This will generate audio for all student names)"
