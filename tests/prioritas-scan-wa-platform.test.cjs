'use strict'
// Kontrak dua perbaikan:
//
//  1. PRIORITAS SCAN. Tombol "Semua Hadir" / "Simpan rentang" tidak boleh
//     menimpa catatan QR/RFID. Terbukti di produksi: VII-B punya 30 siswa,
//     14 scan QR, dan 16 sisanya tercatat 'hadir' dari batch-range padahal
//     tidak ada bukti kehadiran.
//
//  2. WA PLATFORM HANYA SUPERADMIN. Nomor WA platform adalah nomor CS &
//     notifikasi Jurnalku. Sebelumnya admin lembaga juga bisa membuka dan
//     mengganti konfigurasinya.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

// ---------------- (1) prioritas scan ----------------
test('simpan rentang tidak menimpa siswa yang sudah scan', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.post('/api/absensi-siswa/bulk-range'")
  const badan = s.slice(i, i + 2600)
  assert.ok(/PRIORITAS SCAN/.test(badan), 'harus ada penjagaan prioritas scan')
  assert.ok(/metode IN \('qr','rfid','device'\)/.test(badan),
    'harus memeriksa apakah siswa sudah punya catatan scan')
  assert.ok(/if \(sudahScan\) \{ already\+\+; continue \}/.test(badan),
    'siswa yang sudah scan harus dilewati, bukan ditimpa')
})

test('tombol semua hadir tidak menimpa scan, tapi sakit/izin/alpha boleh', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.post('/api/absensi-siswa/bulk',")
  const badan = s.slice(i, i + 3000)
  assert.ok(/PRIORITAS SCAN/.test(badan))
  assert.ok(/!\[ 'sakit', 'izin', 'alpha' \]\.includes\(d\.status\)/.test(badan) ||
            /!\['sakit', 'izin', 'alpha'\]\.includes\(d\.status\)/.test(badan),
    'status non-hadir tetap boleh mengoreksi scan (siswa scan lalu diketahui sakit)')
})

// ---------------- (2) WA platform superadmin ----------------
test('endpoint WA gateway hanya untuk superadmin', () => {
  const s = baca('server/index.cjs')
  for (const ep of [
    "app.get('/api/wa-gateway/config'",
    "app.put('/api/wa-gateway/config'",
    "app.post('/api/wa-gateway/test'",
    "app.get('/api/wa-gateway/status'",
    "app.post('/api/wa-gateway/connect'",
    "app.get('/api/wa-gateway/qr'",
  ]) {
    const i = s.indexOf(ep)
    assert.ok(i > 0, `${ep} harus ada`)
    const baris = s.slice(i, s.indexOf('\n', i))
    assert.ok(/SUPERADMIN/.test(baris),
      `${ep} harus memakai SUPERADMIN, bukan ADMIN — dapat: ${baris.slice(0, 110)}`)
  }
})

test('SUPERADMIN didefinisikan sebagai role super_admin saja', () => {
  const s = baca('server/index.cjs')
  assert.ok(/const SUPERADMIN = requireRole\('super_admin'\)/.test(s))
})

test('menu admin lembaga tidak memuat WA Platform', () => {
  const s = baca('src/lib/menuItems.tsx')
  const awal = s.indexOf('export const adminMenuItems')
  const akhir = s.indexOf('export const superAdminMenuItems')
  assert.ok(awal > 0 && akhir > awal)
  // Potong hanya daftar menu (bukan helper filterRoleItems yang menyebut path
  // wa-gateway sebagai path terbatas untuk operator/TU — itu bukan menu).
  const blokMenu = s.slice(awal, s.indexOf('// Pilih daftar menu sesuai role', awal))
  assert.ok(!/label: 'Sambungkan WA Platform'/.test(blokMenu),
    'admin lembaga tidak boleh punya menu WA Platform — nomor itu milik platform')
})

test('menu superadmin tetap punya WA Platform', () => {
  const s = baca('src/lib/menuItems.tsx')
  const i = s.indexOf('export const superAdminMenuItems')
  const blok = s.slice(i, i + 3000)
  assert.ok(/'\/admin\/wa-gateway'/.test(blok), 'superadmin harus tetap bisa memindai QR platform')
})
