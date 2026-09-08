# JURNALKU — Panduan Deployment

Deployment production wajib memakai variabel environment. Jangan menulis IP, password, token, atau secret ke repository.

## Prasyarat

- Node.js sesuai `package.json`
- `npm`, `sshpass`, `ssh`, `scp`, `tar`, dan `curl`
- Host key VPS sudah diverifikasi dan disimpan di `~/.ssh/known_hosts`
- `JWT_SECRET` production berupa nilai acak minimal 32 karakter
- `PUBLIC_IP` production berisi alamat publik server aktif

## Variabel lokal

Set di shell atau secret manager, bukan di file tracked:

```bash
export VPS_IP='alamat-server-aktif'
export VPS_USER='root'
export VPS_PASS='password-dari-secret-manager'
export SSH_KNOWN_HOSTS="$HOME/.ssh/known_hosts"
```

Verifikasi fingerprint host melalui kanal tepercaya sebelum menambahkannya ke `known_hosts`. Jangan memakai `StrictHostKeyChecking=no`.

## Verifikasi sebelum deployment

```bash
npm ci
node --test tests/*.test.cjs
npm run lint
npm run build
```

Pastikan service production memiliki environment wajib tanpa mencetak nilainya:

```bash
pm2 env jurnalku-api | grep -q '^JWT_SECRET:'
pm2 env jurnalku-api | grep -q '^PUBLIC_IP:'
```

## Deployment frontend langsung

`deploy-to-vps.sh` mengunggah artefak unik, memvalidasi hasil ekstraksi, menukar direktori `dist` secara atomik, melakukan health check, dan rollback otomatis jika gagal.

```bash
./deploy-to-vps.sh
```

Override opsional:

```bash
export VPS_DIR='/www/wwwroot/jurnal.cc.cd'
export PM2_APP='jurnalku-api'
export DEPLOY_HEALTH_URL='https://jurnal.cc.cd/api/health'
```

## Alur staging lalu production

```bash
scripts/deploy-staging.sh
```

Uji staging, lalu:

```bash
scripts/promote-live.sh
```

Promosi meminta konfirmasi `LIVE`, membuat snapshot kode dan DB, memvalidasi source, me-restart PM2, melakukan health check, serta rollback otomatis bila health check gagal.

## Rollback kode

```bash
scripts/rollback-live.sh
```

Rollback meminta konfirmasi `ROLLBACK`. DB tidak dipulihkan otomatis agar data baru tidak hilang.

## Sinkronisasi DB live ke staging

Perintah ini menimpa DB staging:

```bash
scripts/sync-db-to-staging.sh
```

Skrip meminta konfirmasi `SYNC`, membuat snapshot SQLite konsisten, memeriksa integritas, lalu memverifikasi health staging.

## Environment PM2 production

Konfigurasikan melalui secret manager atau environment proses:

```bash
export NODE_ENV='production'
export JWT_SECRET='nilai-acak-minimal-32-karakter'
export PUBLIC_IP='alamat-server-aktif'
pm2 restart jurnalku-api --update-env
```

Jangan menyalin nilai nyata ke dokumentasi, shell history, issue, atau log.

## Verifikasi pascadeployment

```bash
curl --fail --silent --show-error https://jurnal.cc.cd/api/health
curl --fail --silent --show-error https://jurnalmadrasah.web.id/api/health
```

Periksa asset HTML kedua domain dan jalankan smoke test untuk login, dashboard, Presensi, Absensi QR Siswa, serta route admin sensitif.

## Troubleshooting

```bash
pm2 status
pm2 logs jurnalku-api --lines 100
nginx -t
```

Jika deployment gagal, jangan menonaktifkan verifikasi host atau memasukkan credential ke argumen `sshpass -p`. Perbaiki konfigurasi `known_hosts`, environment, atau health endpoint terlebih dahulu.
