'use strict'
// Kontrak halaman "Cetak & Ekspor Rapor".
//
// Latar: tombol cetak per bagian sebenarnya sudah ada di backend, tetapi
// tersembunyi di dropdown halaman Rapor dan cetak massal hanya muncul bila
// layout "MTs Plus" dipilih. Pengguna tidak menemukannya. Kontrak ini menjaga
// agar halaman khusus tetap ada dan semua aksi tetap TERLIHAT sebagai tombol.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('halaman Cetak & Ekspor Rapor ada dan terdaftar di router', () => {
  const p = path.join(AKAR, 'src/pages/admin/CetakRaporPage.tsx')
  assert.ok(fs.existsSync(p), 'CetakRaporPage harus ada')
  const app = baca('src/App.tsx')
  assert.ok(app.includes('CetakRaporPage'), 'harus diimpor di App.tsx')
  assert.ok(app.includes('path="cetak-rapor"'), 'rute /admin/cetak-rapor harus terdaftar')
})

test('halaman menawarkan EMPAT bagian rapor secara terpisah', () => {
  const isi = baca('src/pages/admin/CetakRaporPage.tsx')
  for (const bagian of ["'cover'", "'identitas'", "'nilai'", "'lengkap'"]) {
    assert.ok(isi.includes(bagian), `bagian ${bagian} harus ada`)
  }
  assert.ok(isi.includes("label: 'Cover / Sampul'"), 'label cover harus eksplisit')
  assert.ok(isi.includes("label: 'Identitas Siswa'"), 'label identitas harus eksplisit')
  assert.ok(isi.includes("label: 'Nilai / Capaian'"), 'label nilai harus eksplisit')
})

test('aksi per siswa DAN per kelas sama-sama tersedia', () => {
  const isi = baca('src/pages/admin/CetakRaporPage.tsx')
  assert.ok(isi.includes("'/rapor/export/pdf'"), 'harus memanggil cetak per siswa')
  assert.ok(isi.includes("'/rapor/export/pdf-bulk'"), 'harus memanggil cetak massal kelas')
  assert.ok(isi.includes('Cetak per Siswa'), 'seksi per siswa harus ada')
  assert.ok(isi.includes('Cetak per Kelas'), 'seksi per kelas harus ada')
})

test('buku induk tersedia per siswa dan per kelas', () => {
  const isi = baca('src/pages/admin/CetakRaporPage.tsx')
  assert.ok(isi.includes("'/buku-induk/pdf'"), 'harus memanggil buku induk per siswa')
  assert.ok(isi.includes("'/buku-induk/pdf-bulk'"), 'harus memanggil buku induk per kelas')
  assert.ok(isi.includes('Buku Induk'), 'seksi buku induk harus ada')
  assert.ok(isi.includes('id="buku-induk"'), 'harus punya anchor untuk menu #buku-induk')
})

test('tidak ada aksi yang disembunyikan di balik dropdown', () => {
  const isi = baca('src/pages/admin/CetakRaporPage.tsx')
  // Semua tombol dirender langsung lewat .map pada array BAGIAN/BUKU_INDUK.
  assert.ok(/BAGIAN\.map/.test(isi), 'bagian rapor dirender sebagai tombol langsung')
  assert.ok(/BUKU_INDUK\.map/.test(isi), 'buku induk dirender sebagai tombol langsung')
  assert.ok(!isi.includes('setCetakOpen'), 'tidak boleh memakai dropdown tersembunyi')
})

test('menu sidebar menautkan halaman dan buku induk', () => {
  const menu = baca('src/lib/menuItems.tsx')
  assert.ok(menu.includes("path: '/admin/cetak-rapor'"), 'menu Cetak & Ekspor Rapor harus ada')
  assert.ok(menu.includes('/admin/cetak-rapor#buku-induk'), 'menu Buku Induk harus menautkan anchor')
  // Dua peran: admin dan kepala.
  const jumlah = (menu.match(/Cetak & Ekspor Rapor/g) || []).length
  assert.ok(jumlah >= 2, `menu harus ada untuk admin DAN kepala, dapat ${jumlah}`)
})

test('halaman dibatasi fitur penilaian (gerbang paket)', () => {
  const fa = baca('src/lib/featureAccess.ts')
  assert.ok(fa.includes("'/admin/cetak-rapor'"), 'path harus digerbang fitur penilaian')
})

test('error blob dibaca sebagai JSON, bukan ditampilkan sebagai teks mentah', () => {
  const isi = baca('src/pages/admin/CetakRaporPage.tsx')
  assert.ok(isi.includes('instanceof Blob'), 'respons error blob harus di-parse')
  assert.ok(isi.includes('JSON.parse'), 'harus JSON.parse isi blob error')
})
