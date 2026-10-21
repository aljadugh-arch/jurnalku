'use strict'
// Kontrak: Portal Operator (khusus admin lembaga).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const katalog = baca('src/lib/katalogOperator.ts')
const page = baca('src/pages/admin/PortalOperatorPage.tsx')

test('katalog operator memuat layanan inti madrasah', () => {
  for (const nama of ['EMIS 4.0', 'Verval PD', 'Verval PTK', 'PIP Kemenag', 'ANBK', 'Portal RDM Pusat', 'e-RKAM', 'PDUM']) {
    assert.ok(katalog.includes(nama), `katalog harus memuat ${nama}`)
  }
})

test('setiap aplikasi punya url, kategori, status, dan catatan', () => {
  const jumlah = (katalog.match(/\{ id: '/g) || []).length
  assert.ok(jumlah >= 20, `harus ada minimal 20 aplikasi, dapat ${jumlah}`)
  const url = (katalog.match(/url: 'https:\/\//g) || []).length
  assert.ok(url >= jumlah, `setiap entri harus punya URL https (${url} vs ${jumlah})`)
  const catatan = (katalog.match(/catatan: '/g) || []).length
  assert.strictEqual(catatan, jumlah, 'setiap entri harus punya catatan pemeriksaan')
})

test('status tautan TIDAK diklaim sebagai pemantauan langsung', () => {
  assert.ok(page.includes('bukan pemantauan langsung'), 'harus ada catatan bahwa status bukan pemantauan langsung')
  assert.ok(page.includes('tidak selalu berarti situs sedang mati'), 'harus menjelaskan arti "perlu cek manual"')
  assert.ok(katalog.includes('DIPERIKSA_PADA'), 'harus mencantumkan tanggal pemeriksaan')
})

test('menu internal menautkan halaman Jurnalku yang nyata', () => {
  const rute = [
    '/admin/siswa', '/admin/gtk', '/admin/rombel', '/admin/ppdb',
    '/admin/cetak-rapor', '/admin/buku-induk', '/admin/laporan-keuangan', '/admin/absensi-siswa',
  ]
  for (const r of rute) {
    assert.ok(katalog.includes(`path: '${r}'`), `menu internal harus menautkan ${r}`)
  }
})

test('pencarian, kategori, dan favorit tersedia', () => {
  assert.ok(katalog.includes('export function saringAplikasi'), 'harus ada fungsi saring')
  assert.ok(page.includes('Favorit saya'), 'harus ada filter favorit')
  assert.ok(page.includes('Cari EMIS, NISN, PIP'), 'harus ada kolom pencarian')
  assert.ok(page.includes('KATEGORI.map'), 'harus ada pemilih kategori')
})

test('tautan luar dibuka aman (noopener noreferrer)', () => {
  const jumlah = (page.match(/rel="noopener noreferrer"/g) || []).length
  assert.ok(jumlah >= 2, `tautan luar harus memakai rel aman, dapat ${jumlah}`)
  assert.ok(page.includes('target="_blank"'), 'tautan luar harus tab baru')
})

test('halaman terdaftar sebagai rute admin dan ada di menu', () => {
  const app = baca('src/App.tsx')
  assert.ok(app.includes('path="portal-operator"'), 'rute /admin/portal-operator harus ada')
  const menu = baca('src/lib/menuItems.tsx')
  const i = menu.indexOf('export const adminMenuItems')
  const blok = menu.slice(i, i + 600)
  assert.ok(blok.includes("path: '/admin/portal-operator'"), 'menu harus ada di daftar admin')
})
