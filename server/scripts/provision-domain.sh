#!/bin/bash
# provision-domain.sh — Auto-provision custom domain for JURNALKU
# Usage: bash provision-domain.sh <domain>
# Called by Node app after DNS is verified against PUBLIC_IP.
# Must be run as root.
#
# Production memakai Caddy (BUKAN nginx) dan API bersama di port 3002.
# Custom domain ditambahkan sebagai blok eksplisit di Caddyfile yang
# menyajikan dist dari /www/wwwroot/jurnal.cc.cd/dist dan mem-proxy /api/*,
# /uploads/*, serta ikon tenant ke 127.0.0.1:3002. Caddy mengurus sertifikat
# HTTPS (Let's Encrypt) secara otomatis.
#
# Env opsional (untuk pengujian):
#   CADDYFILE=/path  -> path Caddyfile (default /etc/caddy/Caddyfile)
#   LIVE_DIR=/path   -> root dokumen live
#   DRY_RUN=1        -> append + validasi saja, tidak reload Caddy

set -euo pipefail

DOMAIN="$1"
if [[ -z "$DOMAIN" ]]; then
  echo "ERROR: domain argument required" >&2
  exit 1
fi

# Validate domain format (basic)
if [[ ! "$DOMAIN" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$ ]]; then
  echo "ERROR: invalid domain format: $DOMAIN" >&2
  exit 1
fi

CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
LIVE_DIR="${LIVE_DIR:-/www/wwwroot/jurnal.cc.cd}"
DRY_RUN="${DRY_RUN:-0}"

[[ -f "$CADDYFILE" ]] || { echo "ERROR: Caddyfile tidak ditemukan: $CADDYFILE" >&2; exit 1; }
[[ -d "$LIVE_DIR/dist" ]] || { echo "ERROR: dist live tidak ditemukan: $LIVE_DIR/dist" >&2; exit 1; }

# Idempoten: jangan tambah dua kali.
if grep -qE "^[[:space:]]*${DOMAIN//./\\.}[,[:space:]]" "$CADDYFILE"; then
  echo "Domain $DOMAIN sudah terdaftar di Caddyfile, skip."
  exit 0
fi

BACKUP="$(mktemp)"
cp -a "$CADDYFILE" "$BACKUP"
trap 'rm -f "$BACKUP"' EXIT

restore_and_exit() {
  cp -a "$BACKUP" "$CADDYFILE"
  echo "ERROR: $1 — Caddyfile dikembalikan ke kondisi semula." >&2
  exit 1
}

echo "[1/3] Menambahkan blok Caddy untuk $DOMAIN..."
cat >> "$CADDYFILE" <<CADDY

${DOMAIN}, www.${DOMAIN} {
	root * ${LIVE_DIR}/dist
	encode gzip zstd

	handle /api/* {
		reverse_proxy 127.0.0.1:3002
	}

	handle /uploads/* {
		reverse_proxy 127.0.0.1:3002
	}

	@tenantIcons path /favicon.ico /apple-touch-icon.png
	handle @tenantIcons {
		reverse_proxy 127.0.0.1:3002
	}

	@staticAssets path /assets/*
	handle @staticAssets {
		header Cache-Control "public, max-age=31536000, immutable"
		header X-Content-Type-Options "nosniff"
		file_server
	}

	handle {
		header Cache-Control "no-cache, must-revalidate"
		try_files {path} /index.html
		file_server
	}
}
CADDY

echo "[2/3] Validasi Caddyfile..."
# --adapter caddyfile wajib: tanpa itu Caddy menganggap file sebagai JSON,
# kecuali nama file persis 'Caddyfile'.
caddy validate --adapter caddyfile --config "$CADDYFILE" >/dev/null 2>&1 || restore_and_exit "validasi Caddyfile gagal"

echo "[3/3] Reload Caddy..."
if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1: skip reload. Caddyfile tersimpan di $CADDYFILE"
  exit 0
fi
systemctl reload caddy 2>/dev/null || caddy reload --adapter caddyfile --config "$CADDYFILE" || restore_and_exit "reload Caddy gagal"

echo "OK: ${DOMAIN} provisioned successfully (Caddy HTTPS auto-managed)"
