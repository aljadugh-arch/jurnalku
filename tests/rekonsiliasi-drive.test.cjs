'use strict'
// Kontrak rekonsiliasi Google Drive backup (23 Okt 2026).
//
// Masalah: koneksi OAuth2 Google Drive "putus sendiri setelah beberapa hari"
// karena aplikasi OAuth di Google Cloud berstatus Testing → refresh token
// kedaluwarsa otomatis setelah 7 hari (invalid_grant).
//
// Rekonsiliasi yang dikunci di sini:
//  1. backup_config punya flag needs_reauth + reconciled_key (migrasi aditif).
//  2. Ada cek kesehatan token harian (reconcileDriveHealth) yang menandai
//     needs_reauth saat invalid_grant, dan membersihkannya saat token sehat.
//  3. Ada endpoint ringan GET /api/google-drive/alert (tanpa memanggil Google)
//     yang dibaca dashboard untuk menampilkan peringatan.
//  4. Flag dibersihkan saat backup/status/reconnect berhasil.
//  5. Halaman yatim DomainSetupPage & GuruNilaiSumatifPage dihapus.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = p => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('backup_config punya kolom needs_reauth dan reconciled_key', () => {
  const s = baca('server/backup-drive.cjs')
  assert.match(s, /needs_reauth INTEGER DEFAULT 0/, 'CREATE TABLE harus memuat needs_reauth')
  assert.match(s, /reconciled_key TEXT/, 'CREATE TABLE harus memuat reconciled_key')
  // Migrasi aditif untuk instalasi lama.
  assert.match(s, /ADD COLUMN needs_reauth INTEGER DEFAULT 0/, 'harus ada ALTER TABLE needs_reauth')
  assert.match(s, /ADD COLUMN reconciled_key TEXT/, 'harus ada ALTER TABLE reconciled_key')
})

test('ada rekonsiliasi harian yang menandai invalid_grant sebagai perlu reauth', () => {
  const s = baca('server/backup-drive.cjs')
  assert.match(s, /const reconcileDriveHealth = async/, 'harus ada reconcileDriveHealth')
  assert.match(s, /reconciled_key === key/, 'cek kesehatan dibatasi sekali per hari')
  assert.match(s, /reauthTokenError\(msg\)\) setReauthFlag\(tenantId, 1\)/, 'invalid_grant harus menandai needs_reauth=1')
  assert.match(s, /if \(cfg\.needs_reauth\) setReauthFlag\(tenantId, 0\)/, 'token sehat harus membersihkan flag')
  assert.match(s, /await reconcileDriveHealth\(tenant\.id, cfg, currentDate\)/, 'reconcile harus dipanggil di tick')
})

test('flag reauth dibersihkan saat backup/status/reconnect berhasil', () => {
  const s = baca('server/backup-drive.cjs')
  assert.match(s, /setReauthFlag\(tenant\.id, 0\) \/\/ backup berhasil/, 'backup otomatis sukses bersihkan flag')
  assert.match(s, /setReauthFlag\(req\.tenantId, 0\) \/\/ backup manual berhasil/, 'backup manual sukses bersihkan flag')
  assert.match(s, /if \(cfg\.needs_reauth\) setReauthFlag\(req\.tenantId, 0\)/, 'status cek sukses bersihkan flag')
  // Reconnect (OAuth callback) reset flag + izinkan rekonsiliasi ulang hari ini.
  assert.match(s, /UPDATE backup_config SET needs_reauth=0, reconciled_key=NULL/, 'callback OAuth reset flag')
})

test('ada endpoint ringan /api/google-drive/alert tanpa memanggil Google', () => {
  const s = baca('server/backup-drive.cjs')
  assert.match(s, /app\.get\('\/api\/google-drive\/alert', kadmin/, 'endpoint alert harus ada')
  assert.match(s, /needs_reauth: !!cfg\.needs_reauth/, 'alert mengembalikan needs_reauth')
  assert.match(s, /last_error: lastErr\?\.error \|\| null/, 'alert mengembalikan pesan galat terakhir')
})

test('dashboard admin menampilkan peringatan saat perlu reauth', () => {
  const d = baca('src/pages/admin/AdminDashboard.tsx')
  assert.match(d, /api\.get\('\/google-drive\/alert'\)/, 'AdminDashboard harus memanggil alert')
  assert.match(d, /driveAlert\?\.needs_reauth/, 'AdminDashboard menampilkan banner saat needs_reauth')
  assert.match(d, /to="\/admin\/backup-restore"/, 'banner menautkan ke halaman backup')
  const m = baca('src/pages/admin/MobileAdminDashboard.tsx')
  assert.match(m, /api\.get\('\/google-drive\/alert'\)/, 'MobileAdminDashboard harus memanggil alert')
  assert.match(m, /driveAlert\?\.needs_reauth/, 'MobileAdminDashboard menampilkan banner')
})

test('halaman yatim DomainSetupPage & GuruNilaiSumatifPage sudah dihapus', () => {
  assert.ok(!fs.existsSync(path.join(AKAR, 'src/pages/admin/DomainSetupPage.tsx')), 'DomainSetupPage harus hilang')
  assert.ok(!fs.existsSync(path.join(AKAR, 'src/pages/guru/GuruNilaiSumatifPage.tsx')), 'GuruNilaiSumatifPage harus hilang')
})
