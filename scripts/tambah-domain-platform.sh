#!/usr/bin/env bash
# Tambah domain platform baru ke Caddyfile — IDEMPOTEN dan AMAN.
#
# Kenapa harus menunggu DNS: blok apex memakai TLS otomatis (ACME). Bila DNS
# domain belum mengarah ke server ini, Caddy akan gagal terus-menerus meminta
# sertifikat dan bisa menghabiskan kuota Let's Encrypt (yang dipakai BERSAMA
# domain lain). Karena itu script ini MENOLAK menambah domain yang DNS-nya
# belum resolve ke IP server ini.
#
# Pakai:
#   bash scripts/tambah-domain-platform.sh              # periksa saja
#   bash scripts/tambah-domain-platform.sh --terapkan   # tulis + apply Caddy
#
# Setelah DNS diarahkan (A record apex + wildcard ke IP server), jalankan
# dengan --terapkan. Aman diulang: blok yang sudah ada tidak diduplikasi.
set -euo pipefail

DOMAIN_PLATFORM=("jurnalku.biz.id" "idjurnal.my.id" "idjurnal.web.id" "idjurnal.biz.id")
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
ROOT_DIST="${ROOT_DIST:-/www/wwwroot/jurnal.cc.cd/dist}"
TERAPKAN=0
[[ "${1:-}" == "--terapkan" ]] && TERAPKAN=1

IP_SERVER="$(curl -s --max-time 8 https://api.ipify.org || true)"
if [[ -z "$IP_SERVER" ]]; then
  echo "GAGAL: tidak bisa menentukan IP publik server ini." >&2
  exit 1
fi
echo "IP server ini: $IP_SERVER"
echo

siap=(); belum=()
for d in "${DOMAIN_PLATFORM[@]}"; do
  ip="$(getent hosts "$d" 2>/dev/null | awk '{print $1}' | head -1 || true)"
  if [[ "$ip" == "$IP_SERVER" ]]; then
    echo "  OK    $d -> $ip"
    siap+=("$d")
  else
    echo "  TUNGGU $d -> ${ip:-TIDAK RESOLVE} (butuh A record ke $IP_SERVER)"
    belum+=("$d")
  fi
done
echo

if (( ${#siap[@]} == 0 )); then
  echo "Tidak ada domain yang DNS-nya siap. Tambahkan dulu A record:"
  for d in "${belum[@]}"; do
    echo "  $d          A  $IP_SERVER"
    echo "  www.$d      A  $IP_SERVER"
    echo "  *.$d        A  $IP_SERVER   <- WAJIB, untuk subdomain per-lembaga"
  done
  exit 0
fi

blok_apex() {
  cat <<EOF

$1, www.$1 {
	import jurnalku_secure
	root * $ROOT_DIST
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

	@halaman not path /assets/* /api/* /uploads/* *.js *.css *.png *.jpg *.jpeg *.svg *.ico *.webp *.gif *.woff *.woff2 *.ttf *.eot *.map *.json *.webmanifest *.mp3
	handle @halaman {
		header Cache-Control "no-cache, must-revalidate"
		reverse_proxy 127.0.0.1:3002
	}

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
EOF
}

blok_wildcard() {
  cat <<EOF

*.$1 {
	import jurnalku_secure
	tls {
		on_demand
	}
	root * $ROOT_DIST
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

	@halaman not path /assets/* /api/* /uploads/* *.js *.css *.png *.jpg *.jpeg *.svg *.ico *.webp *.gif *.woff *.woff2 *.ttf *.eot *.map *.json *.webmanifest *.mp3
	handle @halaman {
		header Cache-Control "no-cache, must-revalidate"
		reverse_proxy 127.0.0.1:3002
	}

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
EOF
}

if (( TERAPKAN == 0 )); then
  echo "PERIKSA SAJA — akan menambahkan blok untuk: ${siap[*]}"
  echo "Jalankan ulang dengan --terapkan untuk menerapkan."
  exit 0
fi

cp -a "$CADDYFILE" "${CADDYFILE}.bak-$(date +%Y%m%d-%H%M%S)"
ditambah=0
for d in "${siap[@]}"; do
  # Idempoten: lewati bila blok apex atau wildcard sudah ada.
  if grep -qE "^${d//./\\.}(,| )" "$CADDYFILE"; then
    echo "  lewati $d (blok apex sudah ada)"
  else
    blok_apex "$d" >> "$CADDYFILE"; ditambah=$((ditambah+1)); echo "  tambah apex $d"
  fi
  if grep -qE "^\*\.${d//./\\.} \{" "$CADDYFILE"; then
    echo "  lewati *.$d (blok wildcard sudah ada)"
  else
    blok_wildcard "$d" >> "$CADDYFILE"; ditambah=$((ditambah+1)); echo "  tambah wildcard *.$d"
  fi
done

if (( ditambah == 0 )); then
  echo "Tidak ada perubahan."
  exit 0
fi

echo
echo "Memvalidasi & menerapkan Caddy…"
if ! caddy validate --config "$CADDYFILE" >/dev/null 2>&1; then
  echo "CADDYFILE TIDAK VALID — memulihkan backup." >&2
  cp -a "$(ls -t ${CADDYFILE}.bak-* | head -1)" "$CADDYFILE"
  exit 1
fi
/usr/local/bin/caddy-apply
echo "Selesai. Blok ditambahkan: $ditambah"
