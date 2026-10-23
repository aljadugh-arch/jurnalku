'use strict'
// Kontrak: K-13 dihapus total; jalur Kurikulum Merdeka (penilaian harian/STS/SAS,
// rapor mtsplus/rdm, buku induk) tetap utuh. Helper bersama (terbilang,
// nilaiKeAbjad, semesterRange) dipindah ke rapor-format-service.cjs.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = p => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('helper terbilang/nilaiKeAbjad/semesterRange pindah ke rapor-format-service.cjs', () => {
  const fmt = baca('server/rapor-format-service.cjs')
  assert.ok(fmt.includes('function terbilang'), 'terbilang harus ada di modul format')
  assert.ok(fmt.includes('function nilaiKeAbjad'), 'nilaiKeAbjad harus ada')
  assert.ok(fmt.includes('function semesterRange'), 'semesterRange harus ada')
  // Pemakai kurmer mengimpor dari modul format, bukan dari modul K-13.
  assert.ok(!fs.existsSync(path.join(AKAR, 'server', 'rapor-k13-service.cjs')), 'rapor-k13-service.cjs harus dihapus')
  assert.ok(!fs.existsSync(path.join(AKAR, 'server', 'rapor-k13-pdf-service.cjs')), 'rapor-k13-pdf-service.cjs harus dihapus')
  for (const f of ['buku-induk-pdf-service.cjs', 'rapor-mtsplus-pdf-service.cjs']) {
    const isi = baca(`server/${f}`)
    assert.ok(isi.includes("require('./rapor-format-service.cjs')"), `${f} harus impor dari modul format`)
    assert.ok(!isi.includes('rapor-k13-service'), `${f} tidak boleh impor dari modul K-13`)
  }
})

test('backend tidak lagi mendaftarkan route /api/rapor-k13', () => {
  const idx = baca('server/index.cjs')
  assert.ok(!/app\.(get|put|post|delete)\('\/api\/rapor-k13/.test(idx), 'tidak boleh ada route /api/rapor-k13')
  assert.ok(!idx.includes('CREATE TABLE IF NOT EXISTS rapor_k13'), 'migrasi tabel rapor_k13 harus dihapus')
  assert.ok(!idx.includes('CREATE TABLE IF NOT EXISTS sikap_k13'), 'migrasi tabel sikap_k13 harus dihapus')
  assert.ok(!idx.includes("require('./rapor-k13-service.cjs')"), 'require k13-service harus hilang')
  assert.ok(!idx.includes("require('./rapor-k13-pdf-service.cjs')"), 'require k13-pdf-service harus hilang')
})

test('frontend tidak lagi menampilkan toggle/editor/cetak K-13', () => {
  const rapor = baca('src/pages/admin/RaporPage.tsx')
  assert.ok(!rapor.includes("setKurikulum('k13')"), 'toggle K-13 harus hilang')
  assert.ok(!rapor.includes('K13_MENU'), 'menu cetak K-13 harus hilang')
  assert.ok(!rapor.includes('rapor-k13'), 'pemanggilan API rapor-k13 harus hilang')
  assert.ok(!rapor.includes('Editor Rapor K-13'), 'editor K-13 harus hilang')
  const kkm = baca('src/pages/admin/AdminKkmPage.tsx')
  assert.ok(!kkm.includes('k13'), 'AdminKkmPage tidak boleh menyebut k13')
  const paket = baca('src/lib/fiturPaket.ts')
  assert.ok(!paket.includes('rapor K13'), 'deskripsi paket tidak boleh menyebut rapor K13')
})

test('KKM_DEFAULT hanya merdeka (tidak ada kunci k13)', () => {
  const kkm = baca('server/kkm-service.cjs')
  assert.match(kkm, /KKM_DEFAULT = \{ merdeka: 70 \}/, 'KKM_DEFAULT hanya { merdeka: 70 }')
})
