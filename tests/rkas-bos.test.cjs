'use strict'
// Kontrak RKAS / BOS.
//
// Inti modul ini adalah satu perbedaan yang mudah salah:
//
//   PAGU = rencana  -> DISIMPAN di rkas_kegiatan
//   REALISASI = fakta -> DIHITUNG dari keuangan_transaksi
//
// Kalau realisasi disimpan sebagai kolom, ia akan berbeda dari buku kas begitu
// ada transaksi yang dikoreksi — dan laporan anggaran tidak lagi bisa
// dipertanggungjawabkan. Karena itu realisasi TIDAK punya kolom sendiri.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const s = baca('server/rkas.cjs')

test('tabel program dan kegiatan ada', () => {
  assert.ok(/CREATE TABLE IF NOT EXISTS rkas_program/.test(s))
  assert.ok(/CREATE TABLE IF NOT EXISTS rkas_kegiatan/.test(s))
})

test('pagu disimpan sebagai rencana', () => {
  assert.ok(/pagu INTEGER NOT NULL DEFAULT 0/.test(s), 'pagu adalah rencana, wajar disimpan')
})

test('realisasi TIDAK disimpan sebagai kolom', () => {
  assert.ok(!/realisasi INTEGER/.test(s),
    'realisasi harus dihitung dari transaksi — kalau disimpan akan melenceng dari buku kas')
  assert.ok(/SELECT COALESCE\(SUM\(nominal\),0\)/.test(s),
    'realisasi dihitung dari SUM(nominal) keuangan_transaksi')
})

test('realisasi hanya menghitung transaksi keluar', () => {
  const i = s.indexOf('const hitungRealisasi')
  const badan = s.slice(i, i + 600)
  assert.ok(/tipe='keluar'/.test(badan), 'uang masuk bukan realisasi belanja')
})

test('sumber dana dibatasi ke daftar yang sah', () => {
  assert.ok(/const SUMBER_DANA = \['bos', 'komite', 'apbd', 'yayasan', 'lain'\]/.test(s))
  assert.ok(/SUMBER_DANA\.includes/.test(s), 'sumber dana tak dikenal harus jatuh ke default, bukan diterima mentah')
})

test('program tidak bisa dihapus bila masih punya kegiatan', () => {
  const i = s.indexOf("app.delete('/api/rkas/program/:id'")
  const badan = s.slice(i, i + 500)
  assert.ok(/adaKegiatan > 0/.test(badan),
    'menghapus program berisi kegiatan akan meninggalkan kegiatan yatim')
})

test('ringkasan menghitung serapan per sumber dana', () => {
  const i = s.indexOf("app.get('/api/rkas/ringkasan'")
  const badan = s.slice(i, i + 1400)
  assert.ok(/perSumber/.test(badan), 'pengawas menanyakan per sumber dana, bukan hanya total')
  assert.ok(/serapan/.test(badan))
})

test('rute, halaman, dan menu terdaftar', () => {
  assert.ok(/daftarkanRuteRkas\(app/.test(baca('server/index.cjs')))
  assert.ok(/path="rkas"/.test(baca('src/App.tsx')))
  assert.ok(/RKAS & BOS/.test(baca('src/lib/menuItems.tsx')))
})

test('halaman dengan tabel dibungkus overflow-x-auto', () => {
  const h = baca('src/pages/admin/RkasPage.tsx')
  if (h.includes('<table')) assert.ok(/overflow-x-auto/.test(h))
})

test('UI menjelaskan cara realisasi dicocokkan, tidak mengarang', () => {
  const h = baca('src/pages/admin/RkasPage.tsx')
  assert.ok(/kode kegiatan/i.test(h),
    'karena skema transaksi tidak punya kolom kegiatan, pencocokan lewat kode harus dijelaskan ke user')
})
