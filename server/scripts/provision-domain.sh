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
# PENTING (Caddy `admin off`): instance Caddy produksi menjalankan
# `admin off` sebagai pertahanan SSRF, jadi `systemctl reload caddy` SELALU
# gagal ("dial tcp [::1]:2019: connect: connection refused") dan blok baru
# tidak pernah aktif walau Caddyfile sudah ditulis. Penerapan wajib lewat
# /usr/local/bin/caddy-apply (validate + restart). Skrip ini memakai
# caddy-apply lebih dulu, lalu jatuh ke reload/`caddy reload` hanya bila
# caddy-apply tidak ada (host tanpa admin-off).
#
# Env opsional (untuk pengujian):
#   CADDYFILE=/path   -> path Caddyfile (default /etc/caddy/Caddyfile)
#   LIVE_DIR=/path    -> root dokumen live
#   CADDY_APPLY=/path -> skrip penerap (default /usr/local/bin/caddy-apply)
#   LIVE_IP=ip        -> IP server yang diharapkan untuk record A www
#   SKIP_WWW=1        -> jangan tambahkan varian www
#   DRY_RUN=1         -> append + validasi saja, tidak menerapkan Caddy

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
CADDY_APPLY="${CADDY_APPLY:-/usr/local/bin/caddy-apply}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_WWW="${SKIP_WWW:-0}"

[[ -f "$CADDYFILE" ]] || { echo "ERROR: Caddyfile tidak ditemukan: $CADDYFILE" >&2; exit 1; }
[[ -d "$LIVE_DIR/dist" ]] || { echo "ERROR: dist live tidak ditemukan: $LIVE_DIR/dist" >&2; exit 1; }

# IP server untuk memutuskan varian www. Default: IP yang benar-benar dipakai
# host ini (bukan env lama yang bisa basi), fallback ke LIVE_IP/env.
if [[ -z "${LIVE_IP:-}" ]]; then
  LIVE_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi

# Varian www hanya ditambahkan bila DNS-nya benar-benar mengarah ke server ini.
# Menambahkan www tanpa record A membuat ACME gagal terus dan ikut memicu
# rate-limit Let's Encrypt untuk domain lain (pernah terjadi: 429 pada
# www.jurnal.mtsplussd7.cc.cd dan www.jurnal.mimifdangimbang.my.id).
HOSTS="$DOMAIN"
if [[ "$SKIP_WWW" != "1" && -n "$LIVE_IP" ]]; then
  if command -v dig >/dev/null 2>&1; then
    www_ips="$(dig +short "www.$DOMAIN" A 2>/dev/null | tr '\n' ' ')"
  else
    www_ips="$(getent ahostsv4 "www.$DOMAIN" 2>/dev/null | awk '{print $1}' | tr '\n' ' ')"
  fi
  case " $www_ips " in
    *" $LIVE_IP "*) HOSTS="$DOMAIN, www.$DOMAIN" ;;
  esac
fi

# Idempoten: jangan tambah dua kali (blok lama bisa berupa "domain, www.domain {").
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

echo "[1/3] Menambahkan blok Caddy untuk $HOSTS..."
cat >> "$CADDYFILE" <<CADDY

${HOSTS} {
	import jurnalku_secure
	root * ${LIVE_DIR}/dist
	encode gzip zstd

	handle /api/* {
		reverse_proxy 127.0.0.1:3002
	}

	handle /uploads/* {
		reverse_proxy 127.0.0.1:3002
	}

	@tenantIcons path /favicon.ico /apple-touch-icon.png /og-image.png /favicon.svg
	handle @tenantIcons {
		reverse_proxy 127.0.0.1:3002
	}

	@staticAssets path /assets/*
	handle @staticAssets {
		header Cache-Control "public, max-age=31536000, immutable"
		header X-Content-Type-Options "nosniff"
		file_server
	}

	# SEO + halaman SPA: permintaan TANPA ekstensi berkas diproksi ke Node
	# supaya judul/deskripsi/canonical/og per-lembaga terisi dinamis.
	@halaman not path /assets/* /api/* /uploads/* *.js *.css *.png *.jpg *.jpeg *.svg *.ico *.webp *.gif *.woff *.woff2 *.ttf *.eot *.map *.json *.webmanifest *.mp3
	handle @halaman {
		header Cache-Control "no-cache, must-revalidate"
		reverse_proxy 127.0.0.1:3002
	}

	# Play Store / TWA: berkas verifikasi Digital Asset Links wajib sampai ke Node.
	@wellknown path /.well-known/*
	handle @wellknown {
		reverse_proxy 127.0.0.1:3002
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

echo "[3/3] Menerapkan Caddy..."
if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1: skip penerapan. Caddyfile tersimpan di $CADDYFILE"
  exit 0
fi

# Caddy produksi memakai `admin off` -> reload mustahil; caddy-apply adalah
# jalur yang benar (validate + restart + tunggu aktif).
if [[ -x "$CADDY_APPLY" ]]; then
  "$CADDY_APPLY" || restore_and_exit "caddy-apply gagal (Caddy tidak kembali aktif)"
elif systemctl reload caddy 2>/dev/null; then
  :
elif caddy reload --adapter caddyfile --config "$CADDYFILE" 2>/dev/null; then
  :
else
  systemctl restart caddy 2>/dev/null || restore_and_exit "penerapan Caddy gagal"
fi

echo "OK: ${DOMAIN} provisioned successfully (Caddy HTTPS auto-managed)"
