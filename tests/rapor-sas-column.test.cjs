'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { makeStatements } = require('../server/rapor-grade-service.cjs')

test('asesmen SAS dibaca dari kolom nilai_sas, bukan nilai_sts', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE penilaian_harian (
    siswa_id TEXT, mapel_id TEXT, tenant_id TEXT, tanggal TEXT,
    pengetahuan REAL, keaktifan REAL, sikap REAL
  )`)
  db.exec(`CREATE TABLE rapor (
    nilai_sts REAL, nilai_sas REAL, siswa_id TEXT, mapel_id TEXT,
    tahun_ajaran TEXT, semester TEXT, jenis TEXT, tenant_id TEXT
  )`)
  db.prepare('INSERT INTO rapor VALUES (?,?,?,?,?,?,?,?)').run(70, 88, 's1', 'm1', '2025/2026', 'ganjil', 'sas', 't1')
  const statements = makeStatements(db, { tenantId: 't1', from: '2025-07-01', to: '2025-12-31' })
  assert.deepEqual(statements.asesmenFor('s1', 'm1', '2025/2026', 'ganjil', 'sas'), { nilai_sts: 70, nilai_sas: 88, nilai: 88 })
  db.close()
})
