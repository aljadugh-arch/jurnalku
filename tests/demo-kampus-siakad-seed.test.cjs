'use strict'
// Kontrak: demo kampus (PT) di-seed data contoh SIAKAD (mata kuliah, mahasiswa,
// KRS, nilai) supaya tampilan KRS/KHS/IPK bisa langsung dilihat.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const srv = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')

test('seed demo kampus tersedia + idempotent', () => {
  assert.match(srv, /function seedDemoKampus\(db\)/, 'fungsi seed demo kampus harus ada')
  assert.match(srv, /seedDemoKampus\(db\)/, 'seed harus dipanggil saat boot')
  assert.match(srv, /SELECT id FROM mapel WHERE tenant_id=\? LIMIT 1/, 'seed harus idempotent (skip bila sudah ada mapel)')
})

test('seed menanam mata kuliah, mahasiswa, KRS, dan nilai', () => {
  assert.match(srv, /INSERT OR IGNORE INTO mapel/, 'menanam mata kuliah')
  assert.match(srv, /INSERT OR IGNORE INTO siswa/, 'menanam mahasiswa')
  assert.match(srv, /INSERT INTO krs /, 'menanam KRS')
  assert.match(srv, /INSERT INTO krs_item/, 'menanam item KRS')
  assert.match(srv, /INSERT OR IGNORE INTO krs_nilai/, 'menanam nilai (untuk KHS/IPK)')
  assert.match(srv, /DEMOPT-01/, 'mata kuliah contoh ada')
  assert.match(srv, /DEMOPT2026001/, 'mahasiswa contoh ada')
})
