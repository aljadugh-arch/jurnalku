# JURNALKU — Alur Development Aman (Safe Dev Workflow)

Tujuan: fix bug / tambah fitur TANPA mengganggu sistem live (jurnal.cc.cd).

## Arsitektur 2 Environment

| Environment | URL | Port | DB | PM2 | Dir server |
|-------------|-----|------|----|----|------------|
| **LIVE** (produksi) | https://jurnal.cc.cd | 3001 | jurnalku.db (data asli) | `jurnalku` | /www/wwwroot/jurnal.cc.cd |
| **STAGING** (uji) | https://staging.jurnal.cc.cd | 3002 | jurnalku.db (copy) | `jurnalku-staging` | /www/wwwroot/staging.jurnal.cc.cd |

- Keduanya TERPISAH penuh: dir sendiri, DB sendiri, node_modules sendiri, PM2 app sendiri, port sendiri.
- Utak-atik staging TIDAK PERNAH menyentuh live.
- Cert SSL: wildcard `*.jurnal.cc.cd` sudah cover staging.

## Alur Kerja (setiap fix bug / fitur baru)

```
1. Edit kode di lokal (~/Downloads/JURNALKU)
2. scripts/deploy-staging.sh      → build + kirim ke staging
3. Buka https://staging.jurnal.cc.cd, tes manual di browser
   (opsional: node scripts/e2e_comprehensive.mjs untuk smoke test)
4. Kalau OK → scripts/promote-live.sh  → deploy ke live (auto-backup + auto-rollback)
5. Kalau live bermasalah → scripts/rollback-live.sh  → balik ke versi sebelumnya
```

## Script

| Script | Fungsi |
|--------|--------|
| `scripts/deploy-staging.sh` | Build lokal → deploy ke staging (port 3002). Live aman. |
| `scripts/promote-live.sh` | Staging → live. Auto-backup dist+server+DB. Auto-rollback jika health check gagal. Minta konfirmasi ketik `LIVE`. |
| `scripts/rollback-live.sh` | Pulihkan live ke versi sebelum deploy terakhir (dari `.rollback`). Minta konfirmasi ketik `ROLLBACK`. |
| `scripts/sync-db-to-staging.sh` | Refresh DB staging pakai snapshot terbaru live (buat tes dgn data real). |

## Aturan Emas

1. **JANGAN edit langsung di server live.** Selalu lewat lokal → staging → promote.
2. **Selalu tes di staging dulu** sebelum promote-live.
3. **DB tidak pernah di-rollback otomatis** (risiko hilang data user). Backup DB pre-deploy tersimpan di `/root/backups/jurnalku/jurnalku.db.pre-deploy-*`.
4. **Backup harian otomatis** sudah jalan (cron 02:00, retensi 7 hari) di `/root/backups/jurnalku/`.

## Restore DB manual (darurat, hanya jika perlu)

```bash
ssh root@129.226.82.94
pm2 stop jurnalku
cp /root/backups/jurnalku/jurnalku.db.pre-deploy-<TIMESTAMP> /www/wwwroot/jurnal.cc.cd/server/jurnalku.db
rm -f /www/wwwroot/jurnal.cc.cd/server/jurnalku.db-wal /www/wwwroot/jurnal.cc.cd/server/jurnalku.db-shm
pm2 start jurnalku
```

## Catatan Teknis

- Staging punya node_modules terpisah + `dotenv` terinstall (baca `.env` untuk PORT 3002).
- Live TIDAK punya dotenv → pakai fallback PORT 3001 & JWT_SECRET default. (Catatan: JWT_SECRET live masih default hardcoded — perbaiki di deploy berikutnya via .env + install dotenv, uji di staging dulu.)
- Nginx: vhost `staging.jurnal.cc.cd.conf` proxy ke 3002; exact-match menang atas wildcard `*.jurnal.cc.cd`.

## Git (versioning lokal)

```bash
git add -A && git commit -m "deskripsi perubahan"   # sebelum tiap deploy
git log --oneline                                    # riwayat
git checkout <commit> -- <file>                      # ambil versi lama file tertentu
```
