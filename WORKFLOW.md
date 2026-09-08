# JURNALKU — Workflow Staging dan Production

## Tujuan

Semua perubahan diuji di staging sebelum dipromosikan ke production. Seluruh target server dan credential berasal dari environment atau secret manager.

## Persiapan shell

```bash
export VPS_IP='alamat-server-aktif'
export VPS_USER='root'
export VPS_PASS='password-dari-secret-manager'
export SSH_KNOWN_HOSTS="$HOME/.ssh/known_hosts"
```

Fingerprint host harus diverifikasi melalui kanal tepercaya. Jangan memakai `StrictHostKeyChecking=no` atau `sshpass -p`.

## Environment service

Service staging dan production wajib memiliki:

```bash
NODE_ENV=production
JWT_SECRET=nilai-acak-minimal-32-karakter
PUBLIC_IP=alamat-server-aktif
```

`JWT_SECRET` tidak memiliki fallback. Service gagal start bila secret hilang atau terlalu pendek. Jangan mencetak nilai secret ketika memeriksa konfigurasi.

## Alur rutin

1. Ubah kode lokal.
2. Jalankan gate lokal:

   ```bash
   node --test tests/*.test.cjs
   npm run lint
   npm run build
   ```

3. Deploy staging:

   ```bash
   scripts/deploy-staging.sh
   ```

4. Uji staging: login, dashboard, operasi CRUD yang berubah, API health, dan layout mobile.
5. Promosikan setelah staging lulus:

   ```bash
   scripts/promote-live.sh
   ```

6. Verifikasi kedua domain production:

   ```bash
   curl --fail --silent --show-error https://jurnal.cc.cd/api/health
   curl --fail --silent --show-error https://jurnalmadrasah.web.id/api/health
   ```

## Rollback

```bash
scripts/rollback-live.sh
```

Skrip memulihkan snapshot kode dari promosi terakhir dan tidak mengubah DB. Pemulihan DB harus menjadi keputusan terpisah karena dapat menghapus data baru.

## Sinkronisasi data uji

```bash
scripts/sync-db-to-staging.sh
```

Perintah ini menimpa DB staging dengan snapshot konsisten dari live. Jangan jalankan jika data staging masih dibutuhkan.

## Aturan keamanan

- Jangan simpan IP deployment, password, token, atau JWT secret di repository.
- Jangan baca credential dari path workstation tertentu di skrip tracked.
- Gunakan nama artefak deployment unik untuk mencegah tabrakan proses paralel.
- Validasi artefak sebelum aktivasi.
- Gunakan health check dan rollback otomatis.
- Rahasia yang pernah ter-commit harus dirotasi. Menghapusnya dari working tree tidak menghapus Git history.
- Jangan membersihkan Git history tanpa koordinasi karena operasi itu menulis ulang seluruh branch dan tag.

## Diagnostik

```bash
pm2 status
pm2 logs jurnalku-api --lines 100
nginx -t
```

Jika health check gagal, pertahankan atau pulihkan versi sehat terakhir. Jangan mengakali kegagalan dengan menonaktifkan SSH host verification.
