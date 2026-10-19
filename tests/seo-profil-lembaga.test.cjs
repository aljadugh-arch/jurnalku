'use strict'
// Kontrak SEO: setiap domain lembaga harus punya halaman yang isinya BERBEDA,
// bukan sembilan salinan beranda yang sama.
//
// TEMUAN NYATA (URL Inspection API, 19 Okt 2026):
//   jurnal.cc.cd      -> NEUTRAL "Duplicate, Google chose different canonical"
//   idjurnal.my.id    -> NEUTRAL "Duplicate, Google chose different canonical"
//   idjurnal.biz.id   -> NEUTRAL "Duplicate, Google chose different canonical"
//   /panduan di 7 domain -> NEUTRAL "Discovered - currently not indexed"
//
// Penyebab: sembilan domain menyajikan <title> dan isi beranda yang praktis
// identik ("Madrasah Digital — JURNALKU"). Canonical-nya benar (menunjuk diri
// sendiri), tetapi Google tetap memilih satu wakil karena isinya sama.
//
// Perbaikan: halaman /profil berisi data yang benar-benar berbeda per lembaga
// (nama, jenjang, NPSN, NSM, alamat, kepala sekolah, jumlah siswa/GTK/rombel,
// daftar ekstrakurikuler) — semuanya dibaca dari DB, bukan dikarang.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('ada rute /profil publik tanpa login', () => {
  const s = baca('server/index.cjs')
  assert.ok(/app\.get\('\/profil', \(req, res\) => renderProfilLembaga\(req, res\)\)/.test(s),
    'rute /profil harus ada dan tidak butuh authMiddleware')
  assert.ok(/function renderProfilLembaga/.test(s))
})

test('profil memakai data nyata dari DB, bukan teks tetap', () => {
  const s = baca('server/index.cjs')
  for (const pola of [
    /FROM siswa WHERE tenant_id=\? AND status='aktif'/,
    /FROM gtk WHERE tenant_id=\? AND status='aktif'/,
    /FROM rombel WHERE tenant_id=\?/,
    /FROM ekskul WHERE tenant_id=\?/,
  ]) assert.ok(pola.test(s), `profil harus menghitung dari DB: ${pola}`)
  assert.ok(/getTenantSettings\(db, tenantId, 'nama_lembaga,jenjang,npsn/.test(s),
    'identitas lembaga harus dari settings')
})

test('profil punya canonical sendiri dan robots index', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf('function renderProfilLembaga')
  const blok = s.slice(i, i + 6000)
  assert.ok(/rel="canonical" href="\$\{escHtml\(base \+ '\/profil'\)\}"/.test(blok),
    'canonical harus menunjuk /profil, bukan beranda')
  assert.ok(/name="robots" content="index, follow"/.test(blok))
  assert.ok(/EducationalOrganization/.test(blok), 'harus ada structured data lembaga')
})

test('profil memuat identitas yang membedakan tiap lembaga', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf('function renderProfilLembaga')
  const blok = s.slice(i, i + 6000)
  for (const label of ['NPSN', 'NSM', 'Alamat', 'Kepala sekolah', 'Ekstrakurikuler']) {
    assert.ok(blok.includes(label), `profil harus menampilkan ${label}`)
  }
})

test('/profil masuk sitemap HANYA untuk domain milik satu lembaga', () => {
  const s = baca('server/index.cjs')
  assert.ok(/const punyaLembaga = /.test(s),
    'harus ada pemeriksaan kepemilikan domain')
  assert.ok(/if \(punyaLembaga\) halaman\.push\(\['\/profil', '0\.9', 'weekly'\]\)/.test(s),
    '/profil tidak boleh masuk sitemap domain platform (jurnal.cc.cd dipakai 9 tenant)')
})

test('laporan indeks per-URL tersedia lewat script', () => {
  const s = baca('scripts/search-console.cjs')
  assert.ok(/PERINTAH === 'indeks'/.test(s), 'harus ada perintah indeks')
  assert.ok(/urlInspection\/index:inspect/.test(s), 'harus memakai URL Inspection API')
  assert.ok(/verdict/.test(s) && /coverageState/.test(s),
    'harus melaporkan verdict dan coverageState, bukan hanya "sitemap terkirim"')
})
