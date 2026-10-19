'use strict'
// Kontrak: notifikasi jadwal guru yang "belum work" harus bisa didiagnosis
// dari API, bukan hanya dari log PM2.
//
// TEMUAN PRODUKSI (19 Okt 2026):
//   scheduler JALAN        -> 1.604 pesan jadwal-guru berstatus sent
//   tenant e3138852        -> 12 pesan jadwal-guru terkirim hari ini
//   tenant mtsplussd7      -> 8 pesan pending sejak 08:45 WIB, sesi `qr`
//   terakhir sukses kirim  -> 17 Okt 04:55 (dua hari sebelumnya)
//
// Akar: sesi Baileys tenant itu `qr` (perlu scan ulang). Worker memeriksa
// `if(!sock?.user) return` — tick berhenti diam-diam, antrean menumpuk, dan
// TIDAK ADA satu pun sinyal yang bisa dilihat admin. Yang dilaporkan sebagai
// "notif belum work" sebenarnya "sesi WA belum tersambung".
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('worker menulis denyut agar kondisi macet terlihat', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/CREATE TABLE IF NOT EXISTS wa_worker_heartbeat/.test(s),
    'harus ada tabel denyut worker')
  assert.ok(/function denyut\(/.test(s), 'harus ada fungsi denyut')
  // Denyut wajib ditulis juga saat sesi BELUM login — justru itu kasus macetnya.
  assert.ok(/denyut\(c\.tenant_id, sesi\?\.status \|\| 'belum_login'/.test(s),
    'sesi belum login harus tetap menulis denyut dengan alasan')
  assert.ok(/denyut\(c\.tenant_id, 'online'\)/.test(s))
})

test('denyut mencatat jumlah antrean dan umur pesan tertua', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/pending INTEGER DEFAULT 0/.test(s))
  assert.ok(/tertua_detik INTEGER/.test(s))
  assert.ok(/status IN \('pending','failed'\)/.test(s))
})

// KONTRAK DIPERBARUI: halaman WA Gateway dipakai ADMIN LEMBAGA juga, jadi
// endpoint status tidak boleh SUPERADMIN saja — kalau tidak, tombol Refresh
// Status di halaman mereka menjawab "Akses ditolak: role tidak berwenang".
// Penjagaan nomor platform tetap ada di tolakTenantPlatform (tenant `default`).
test('API /api/wa-kesehatan memakai WA_KELOLA (admin lembaga + penjaga platform)', () => {
  const s = baca('server/index.cjs')
  assert.ok(/app\.get\('\/api\/wa-kesehatan', \.\.\.WA_KELOLA/.test(s),
    'endpoint status WA harus bisa dibuka admin lembaga')
  const iKelola = s.indexOf('const WA_KELOLA =')
  const iEnd = s.indexOf("app.get('/api/wa-kesehatan'")
  assert.ok(iKelola > 0 && iEnd > iKelola,
    'endpoint harus setelah WA_KELOLA, kalau tidak ReferenceError saat start')
})

test('API menyebut penyebab, bukan hanya angka', () => {
  const s = baca('server/index.cjs')
  assert.ok(/Sesi WA belum terhubung — buka menu WA Gateway dan scan QR/.test(s),
    'harus menyebut QR bila sesi berstatus qr')
  assert.ok(/pesan tertahan lebih dari/.test(s), 'harus menyebut antrean tertahan')
  assert.ok(/Worker WA belum pernah melapor/.test(s))
})

test('halaman notifikasi menampilkan status WA yang bisa ditindaklanjuti', () => {
  const s = baca('src/pages/admin/NotifSettingsPage.tsx')
  assert.ok(/wa-kesehatan/.test(s), 'harus memanggil endpoint status')
  assert.ok(/Belum bisa mengirim/.test(s))
  assert.ok(/Buka WA Gateway untuk scan QR/.test(s),
    'harus memberi jalan keluar saat sesi qr')
})
