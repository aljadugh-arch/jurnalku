'use strict'
// Kontrak sirkulasi perpustakaan.
//
// Kondisi sebelumnya: `library_config` hanya menyimpan satu link Google Drive.
// Tidak ada katalog, tidak ada pinjam, tidak ada jatuh tempo, tidak ada denda.
//
// Dua keputusan yang dikunci di sini karena keduanya mudah salah:
//
//  1. STOK DIHITUNG, TIDAK DISIMPAN. Kalau stok jadi kolom tersendiri, ia
//     melenceng begitu ada peminjaman ganda atau pembatalan. Stok selalu
//     jumlah_salinan - COUNT(pinjam aktif).
//
//  2. DENDA DIHITUNG SAAT KEMBALI, bukan saat pinjam. Tarif bisa berubah dan
//     keterlambatan baru nyata ketika buku dikembalikan.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const pst = require(path.join(AKAR, 'server', 'pustaka.cjs'))
const s = baca('server/pustaka.cjs')

test('katalog dan peminjaman punya tabel sendiri', () => {
  assert.ok(/CREATE TABLE IF NOT EXISTS pustaka_buku/.test(s), 'tabel katalog harus ada')
  assert.ok(/CREATE TABLE IF NOT EXISTS pustaka_pinjam/.test(s), 'tabel peminjaman harus ada')
})

test('stok dihitung dari peminjaman aktif, bukan kolom tersimpan', () => {
  assert.ok(/jumlah_salinan - \(SELECT COUNT\(\*\) FROM pustaka_pinjam/.test(s),
    'tersedia harus dihitung: jumlah_salinan - COUNT(pinjam aktif)')
  assert.ok(!/ALTER TABLE pustaka_buku ADD COLUMN (stok|tersedia)/i.test(s),
    'jangan menyimpan stok sebagai kolom — akan melenceng')
})

test('denda: nol bila tidak terlambat', () => {
  assert.strictEqual(pst.hitungDenda('2026-10-10', '2026-10-10', 1000), 0)
  assert.strictEqual(pst.hitungDenda('2026-10-10', '2026-10-09', 1000), 0, 'kembali lebih awal tidak boleh didenda')
})

test('denda: dihitung per hari keterlambatan', () => {
  assert.strictEqual(pst.hitungDenda('2026-10-10', '2026-10-13', 1000), 3000)
  assert.strictEqual(pst.hitungDenda('2026-10-10', '2026-10-11', 500), 500)
})

test('denda berjalan memakai hari ini bila belum dikembalikan', () => {
  const lewat = '2020-01-01'
  assert.ok(pst.hitungDenda(lewat, null, 1000) > 0, 'buku lewat jatuh tempo harus punya denda berjalan')
})

test('tidak bisa meminjam melebihi jumlah salinan', () => {
  assert.ok(/dipinjam >= buku\.jumlah_salinan/.test(s),
    'server harus menolak pinjam saat semua salinan habis')
})

test('tidak bisa menurunkan salinan di bawah yang sedang dipinjam', () => {
  assert.ok(/baru < dipinjam/.test(s),
    'kalau dibiarkan, tersedia jadi negatif dan katalog menampilkan angka mustahil')
})

test('nama peminjam diambil dari DB, bukan dari klien', () => {
  assert.ok(/SELECT nama, rombel_id FROM siswa WHERE id=\? AND tenant_id=\?/.test(s),
    'nama dari klien bisa dipalsukan — harus diturunkan dari DB')
})

test('tarif denda & lama pinjam bisa diubah tanpa deploy', () => {
  assert.ok(/app_config/.test(s) && /pustaka_denda_per_hari/.test(s),
    'tarif harus dibaca dari app_config, bukan hardcode')
})

test('rute, halaman, dan menu terdaftar', () => {
  assert.ok(/daftarkanRutePustaka\(app/.test(baca('server/index.cjs')))
  assert.ok(/path="pustaka"/.test(baca('src/App.tsx')))
  assert.ok(/Sirkulasi Perpustakaan/.test(baca('src/lib/menuItems.tsx')))
})

test('halaman dengan tabel dibungkus overflow-x-auto', () => {
  const h = baca('src/pages/admin/PustakaPage.tsx')
  if (h.includes('<table')) assert.ok(/overflow-x-auto/.test(h), 'tabel katalog harus bisa di-scroll di HP')
})
