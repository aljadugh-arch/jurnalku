'use strict'
// Kontrak demo per segmen + perbaikan demo/CORS/proktor.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('demo per segmen: kemenag/dikdasmen/umum -> tenant demo berbeda', () => {
  const srv = baca('server/index.cjs')
  assert.match(srv, /const DEMO_SEGMEN = \{/, 'DEMO_SEGMEN harus ada')
  assert.match(srv, /kemenag:\s*\{ id: 'demo-kemenag'/, 'kemenag -> demo-kemenag')
  assert.match(srv, /dikdasmen:\s*\{ id: 'demo-kampus'/, 'dikdasmen -> demo-kampus (PT/KRS)')
  assert.match(srv, /umum:\s*\{ id: 'demo-umum'/, 'umum -> demo-umum (NF)')
  // Routing demo oleh segmen domain.
  assert.match(srv, /SEGMENT_DOOR\(demoHost\)\?\.segmen \|\| 'umum'/, 'demo login pilih tenant dari segmen domain')
})

test('demo tersedia di semua domain platform termasuk pintu kemenag', () => {
  const srv = baca('server/index.cjs')
  const i = srv.indexOf('const DEMO_HOSTS')
  const blok = srv.slice(i, srv.indexOf(')', srv.indexOf('split', i)) + 1)
  assert.ok(blok, 'blok DEMO_HOSTS harus ada')
  for (const d of ['jurnal.cc.cd', 'jurnalmadrasah.web.id', 'jurnalku.biz.id', 'idjurnal.web.id', 'idjurnal.biz.id', 'idjurnal.my.id']) {
    assert.ok(blok.includes(d), `host ${d} harus ada di DEMO_HOSTS`)
  }
})

test('hostMilikSatuLembaga hanya menutup demo untuk domain_custom, bukan base_domain segmen', () => {
  const srv = baca('server/index.cjs')
  const blok = srv.slice(srv.indexOf('function hostMilikSatuLembaga'), srv.indexOf('app.post', srv.indexOf('function hostMilikSatuLembaga')))
  assert.match(blok, /domain_custom/, 'harus memeriksa domain_custom')
  assert.doesNotMatch(blok, /base_domain,\s*'\.'/, 'tidak boleh menutup demo lewat base_domain')
})

test('CORS mengizinkan semua domain platform baru', () => {
  const cors = baca('server/cors-origin.cjs')
  // Pola subdomain di cors-origin.cjs memakai tanda backslash sebelum titik.
  for (const d of ['jurnalku', 'idjurnal']) {
    assert.ok(cors.includes(d), `pola subdomain harus memuat ${d}`)
  }
  assert.ok(cors.includes('my\\.id') && cors.includes('biz\\.id') && cors.includes('web\\.id'),
    'pola subdomain harus memuat idjurnal.my.id/.biz.id/.web.id')
  const srv = baca('server/index.cjs')
  assert.match(srv, /ALLOWED_ORIGINS.*jurnalku\.biz\.id/, 'ALLOWED_ORIGINS harus memuat jurnalku.biz.id')
  assert.match(srv, /ALLOWED_ORIGINS.*idjurnal\.web\.id/, 'ALLOWED_ORIGINS harus memuat idjurnal.web.id')
})

test('proktor bisa membaca penugasan miliknya (bukan ditolak role)', () => {
  const srv = baca('server/index.cjs')
  const blok = srv.slice(srv.indexOf("app.get('/api/ujian/proktor/assignments'"), srv.indexOf("app.put('/api/ujian"))
  assert.match(blok, /PROCTOR, \(req, res\)/, 'route penugasan proktor harus memakai PROCTOR')
  assert.match(blok, /isProktor/, 'harus ada scoping per proktor')
  assert.match(blok, /a\.user_id=\?/, 'proktor hanya melihat penugasan miliknya')
})

test('nama tenant demo lama diperbaiki dari "Contoh Data" ganda', () => {
  const srv = baca('server/index.cjs')
  assert.match(srv, /UPDATE settings SET nama_lembaga='Demo Madrasah', jenjang='MTs' WHERE tenant_id='demo-tenant'/, 'harus memperbaiki nama demo-tenant lama')
})
