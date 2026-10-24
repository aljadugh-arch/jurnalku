'use strict'
// Kontrak kustomisasi PPDB (24 Okt 2026).
//
// Admin bisa mengganti sebutan modul (PPDB / SPMB / PSB / istilah lembaga lain)
// dan judul halaman publik, plus menyalin tautan formulir publik. Sebutan
// kustom juga menentukan prefix nomor pendaftaran (mis. SPMB-2026-0001).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = p => fs.readFileSync(path.join(AKAR, p), 'utf8')
const ppdb = baca('server/ppdb.cjs')
const index = baca('server/index.cjs')

test('settings punya kolom ppdb_nama + ppdb_judul (migrasi aditif)', () => {
  assert.match(index, /\['settings', 'ppdb_nama', "TEXT DEFAULT 'PPDB'"\]/, 'kolom ppdb_nama')
  assert.match(index, /\['settings', 'ppdb_judul', "TEXT DEFAULT 'Pendaftaran Siswa Baru'"\]/, 'kolom ppdb_judul')
})

test('service PPDB membaca & menyimpan pengaturan kustom', () => {
  assert.match(ppdb, /bacaPengaturan = \(tenantId\)/, 'baca pengaturan')
  assert.match(ppdb, /simpanPengaturan = \(tenantId/, 'simpan pengaturan')
  assert.match(ppdb, /canonicalSettingsId: canonicalId/, 'pakai canonicalSettingsId untuk baris settings')
})

test('prefix nomor pendaftaran mengikuti nama kustom', () => {
  assert.match(ppdb, /prefixNomor = \(tenantId\)/, 'helper prefixNomor')
  assert.match(ppdb, /\$\{prefixNomor\(tenantId\)\}-\$\{ta\}-/, 'nomorBerikutnya memakai prefix kustom')
  assert.ok(ppdb.includes("replace(/[^A-Z0-9]+/g, '-')"), 'sanitasi karakter nama jadi prefix')
})

test('route pengaturan PPDB (GET + PUT) untuk panitia', () => {
  assert.match(ppdb, /app\.get\('\/api\/ppdb\/pengaturan', PANITIA/, 'GET pengaturan')
  assert.match(ppdb, /app\.put\('\/api\/ppdb\/pengaturan', PANITIA/, 'PUT pengaturan')
  assert.match(ppdb, /url_publik = `https:\/\/\$\{host\}\/ppdb`/, 'link publik kanonik')
})

test('info publik mengembalikan nama + judul kustom', () => {
  assert.match(ppdb, /nama: pengaturan\.nama/, 'info publik sertakan nama')
  assert.match(ppdb, /judul: pengaturan\.judul/, 'info publik sertakan judul')
})

test('frontend PpdbPage punya tab Pengaturan + salin tautan', () => {
  const p = baca('src/pages/admin/PpdbPage.tsx')
  assert.match(p, /api\.get\('\/ppdb\/pengaturan'\)/, 'memuat pengaturan')
  assert.match(p, /api\.put\('\/ppdb\/pengaturan'/, 'menyimpan pengaturan')
  assert.match(p, /salinLink/, 'fungsi salin tautan')
  assert.match(p, /navigator\.clipboard\.writeText/, 'pakai clipboard API')
  assert.match(p, /'pengaturan', 'Pengaturan'/, 'tab Pengaturan ada')
  assert.match(p, /\{pengaturan\.nama\} — \{pengaturan\.judul\}/, 'judul halaman pakai nama kustom')
})

test('frontend publik + login pakai nama kustom (fallback PPDB)', () => {
  const pub = baca('src/pages/PpdbPublikPage.tsx')
  assert.match(pub, /info\?\.judul \|\| 'Pendaftaran Siswa Baru'/, 'judul publik pakai kustom')
  assert.match(pub, /info\?\.nama \|\| 'PPDB'/, 'nama publik pakai kustom')
  assert.doesNotMatch(pub, /placeholder="PPDB-2026-0001"/, 'placeholder nomor tidak lagi hardcode PPDB-2026')
})
