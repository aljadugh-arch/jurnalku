'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { parseCsv, analyzeColumns, buildImportPreview, clampNilai } = require('../server/nilai-import-service.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE siswa (id TEXT, tenant_id TEXT, nis TEXT, nisn TEXT, nama TEXT, rombel_id TEXT, status TEXT)`);
  db.exec(`INSERT INTO siswa VALUES
    ('s1','t1','101','001','Ani','r1','aktif'),
    ('s2','t1','102','002','Budi','r1','aktif'),
    ('s3','t1','103','003','Citra','r1','aktif')`);
  db.exec(`CREATE TABLE mapel (id TEXT, tenant_id TEXT, nama TEXT, kode TEXT)`);
  db.exec(`INSERT INTO mapel VALUES ('m1','t1','Matematika','MTK'),('m2','t1','B. Indonesia','BIN'),('m3','t1','IPA','IPA')`);
  return db
}

test('parseCsv: deteksi delimiter koma dan semicolon', () => {
  const semi = parseCsv('NIS;Matematika;IPA\n101;85;78\n102;70;88\n')
  assert.deepEqual(semi.headers, ['NIS', 'Matematika', 'IPA'])
  assert.equal(semi.rows.length, 2)
  assert.equal(semi.rows[0]['Matematika'], '85')
  const comma = parseCsv('NIS,Matematika\n101,90\n')
  assert.equal(comma.rows[0].Matematika, '90')
})

test('analyzeColumns: deteksi identitas NIS/NISN/Nama + mapel', () => {
  assert.equal(analyzeColumns(['NIS', 'MTK', 'IPA']).identityType, 'nis')
  assert.equal(analyzeColumns(['NISN', 'BIN']).identityType, 'nisn')
  assert.equal(analyzeColumns(['Nama', 'IPA']).identityType, 'nama')
  const long = analyzeColumns(['NIS', 'Mapel', 'Nilai'])
  assert.equal(long.mapelLongCol, 'Mapel')
  assert.equal(long.nilaiLongCol, 'Nilai')
})

test('buildImportPreview: matriks NIS -> siswa + mapel, cocokkan semua', () => {
  const db = fixture()
  const { headers, rows } = parseCsv('NIS;Matematika;B. Indonesia;IPA\n101;85;90;78\n102;70;88;92\n999;60;70;80\n')
  const p = buildImportPreview(db, 't1', { headers, rows })
  assert.equal(p.items.length, 6) // 2 siswa x 3 mapel
  assert.equal(p.tidakCocok.length, 3) // siswa 999 tidak dikenal x 3 mapel
  db.close()
})

test('buildImportPreview: format panjang NIS + Mapel + Nilai', () => {
  const db = fixture()
  const { headers, rows } = parseCsv('NIS;Mapel;Nilai\n101;Matematika;85\n101;IPA;78\n')
  const p = buildImportPreview(db, 't1', { headers, rows })
  assert.equal(p.items.length, 2)
  assert.equal(p.items[0].siswa_id, 's1')
  assert.equal(p.items[0].mapel_id, 'm1')
  db.close()
})

test('buildImportPreview: cocokkan by NISN dan nama', () => {
  const db = fixture()
  const byNisn = buildImportPreview(db, 't1', { headers: ['NISN', 'Matematika'], rows: [{ NISN: '002', Matematika: '80' }] })
  assert.equal(byNisn.items[0].siswa_id, 's2')
  const byNama = buildImportPreview(db, 't1', { headers: ['Nama', 'IPA'], rows: [{ Nama: 'Citra', IPA: '90' }] })
  assert.equal(byNama.items[0].siswa_id, 's3')
  db.close()
})

test('clampNilai membatasi 0-100 dan membulatkan', () => {
  assert.equal(clampNilai(150), 100)
  assert.equal(clampNilai(-5), 0)
  assert.equal(clampNilai(78.6), 79)
})