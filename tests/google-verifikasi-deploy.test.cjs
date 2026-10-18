'use strict'
// Kontrak: berkas verifikasi Google Search Console (google*.html) di public/
// HARUS ikut terkirim ke server oleh deploy, dan HARUS disajikan apa adanya
// oleh Node (bukan ditelan SPA fallback yang mengembalikan index.html).
//
// Kenapa ini dikunci: Google memverifikasi kepemilikan domain dengan mengambil
// berkas itu dan mencocokkan isinya persis. Kalau deploy tidak mengirimnya,
// atau SPA fallback yang menjawab, Google membaca index.html dan verifikasi
// gagal dengan pesan "file not found" yang tidak menjelaskan apa pun.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('deploy mengirim berkas verifikasi google*.html dari public/', () => {
  const sh = baca('scripts/deploy-staging.sh')
  // Pola find harus menyertakan google*.html
  assert.ok(/name 'google\*\.html'/.test(sh), "deploy-staging.sh harus menyertakan -name 'google*.html' di BRAND_FILES")
})

test('promote-live mempromosikan public/ ke produksi', () => {
  const sh = baca('scripts/promote-live.sh')
  assert.ok(/STG\/public/.test(sh), 'promote-live.sh harus membaca public/ dari staging')
  assert.ok(/LIVE\/public/.test(sh), 'promote-live.sh harus menulis public/ ke live')
})

test('express.static terdaftar SEBELUM SPA fallback (berkas statis menang)', () => {
  const s = baca('server/index.cjs')
  const statis = s.indexOf("app.use(express.static(path.join(__dirname, '..', 'dist')")
  const fallback = s.indexOf('// SPA fallback')
  assert.ok(statis > 0, 'express.static harus ada')
  assert.ok(fallback > 0, 'SPA fallback harus ada')
  assert.ok(statis < fallback, 'express.static harus didaftarkan SEBELUM SPA fallback agar berkas verifikasi tidak ditelan index.html')
})

test('path ber-ekstensi yang tidak ada balas 404, bukan index.html', () => {
  const srv = baca('server/index.cjs')
  // Penjaga harus ada di SPA fallback
  const i = srv.indexOf('// SPA fallback')
  const badan = srv.slice(i, i + 1400)
  assert.ok(/\\\.[a-z0-9]\{1,8\}\$\/i\.test\(req\.path\)/.test(badan) || badan.includes('/\\.[a-z0-9]{1,8}$/i'), 'SPA fallback harus mengembalikan 404 untuk path ber-ekstensi yang tidak ada')
})

test('rute aplikasi tanpa ekstensi tetap dilayani SPA', () => {
  const srv = baca('server/index.cjs')
  const i = srv.indexOf('// SPA fallback')
  const badan = srv.slice(i, i + 1600)
  // renderIndexSeo tetap dipanggil untuk rute tanpa ekstensi
  assert.ok(badan.includes('renderIndexSeo(req)'), 'rute tanpa ekstensi harus tetap mendapat SEO/SPA')
})
