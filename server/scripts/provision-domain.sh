#!/bin/bash
# provision-domain.sh — Auto-provision custom domain for JURNALKU
# Usage: bash provision-domain.sh <domain>
# Called by Node app after DNS verified as pointing to 129.226.82.94
# Must be run as root (or with sudo for nginx reload + acme.sh)

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

NGINX_CONF="/www/server/panel/vhost/nginx/${DOMAIN}.conf"
CERT_DIR="/www/server/panel/vhost/cert/${DOMAIN}"
ACME="$HOME/.acme.sh/acme.sh"
WEBROOT="/www/wwwroot/jurnal.cc.cd/dist"

echo "[1/5] Generating Nginx config..."

mkdir -p /www/server/panel/vhost/nginx
mkdir -p /www/server/panel/vhost/cert
mkdir -p "$WEBROOT/.well-known/acme-challenge"

cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    access_log /www/wwwlogs/${DOMAIN}.log;
    error_log /www/wwwlogs/${DOMAIN}.error.log;
}
NGINX

echo "[2/5] Testing Nginx config..."
nginx -t 2>&1 || { echo "ERROR: nginx config test failed" >&2; exit 1; }

echo "[3/5] Reloading Nginx (HTTP mode)..."
nginx -s reload 2>/dev/null || pkill -HUP nginx 2>/dev/null || true
sleep 1

echo "[4/5] Issuing SSL certificate via Let's Encrypt..."
"$ACME" --issue \
  -d "$DOMAIN" \
  --webroot "$WEBROOT" \
  --server letsencrypt \
  --force 2>&1 || {
    echo "WARN: acme.sh --issue failed, retrying from scratch..."
    "$ACME" --remove -d "$DOMAIN" --ecc 2>/dev/null || true
    "$ACME" --issue \
      -d "$DOMAIN" \
      --webroot "$WEBROOT" \
      --server letsencrypt 2>&1
  }

echo "[5/5] Installing cert + enabling HTTPS..."
mkdir -p "$CERT_DIR"
"$ACME" --install-cert -d "$DOMAIN" --ecc \
  --fullchain-file "${CERT_DIR}/fullchain.pem" \
  --key-file "${CERT_DIR}/privkey.pem" \
  --reloadcmd "nginx -s reload 2>/dev/null || pkill -HUP nginx 2>/dev/null || true" 2>&1

# Update Nginx config to use SSL
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    location /.well-known/acme-challenge/ { root ${WEBROOT}; }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    access_log /www/wwwlogs/${DOMAIN}.log;
    error_log /www/wwwlogs/${DOMAIN}.error.log;
}
NGINX

nginx -t 2>&1 || { echo "ERROR: final nginx config test failed" >&2; exit 1; }
nginx -s reload 2>/dev/null || pkill -HUP nginx 2>/dev/null || true

echo "OK: ${DOMAIN} provisioned successfully (HTTPS active)"
