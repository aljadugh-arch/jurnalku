const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const ExcelJS = require('exceljs')
const { getAuthorizedLedgerRombels, getLedgerRows, createLedgerWorkbook } = require('../server/ledger-service.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE rombel (id TEXT PRIMARY KEY, nama TEXT, tahun_ajaran TEXT, wali_kelas_id TEXT, tenant_id TEXT);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, nama TEXT, nis TEXT, rombel_id TEXT, tenant_id TEXT);
    CREATE TABLE mapel (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE penilaian_harian (id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tanggal TEXT, pengetahuan REAL, keaktifan REAL, sikap REAL, tenant_id TEXT);
    CREATE TABLE rapor (id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT, semester TEXT, jenis TEXT, nilai_sts REAL, nilai_akhir REAL, tenant_id TEXT);
  `)
  const run = (sql, ...args) => db.prepare(sql).run(...args)
  run("INSERT INTO rombel VALUES ('rb-a','7A','2026/2027','gtk-wali','ta')")
  run("INSERT INTO rombel VALUES ('rb-b','7B','2026/2027','gtk-lain','ta')")
  run("INSERT INTO siswa VALUES ('s-a','Ani','1001','rb-a','ta')")
  run("INSERT INTO siswa VALUES ('s-b','Budi','2001','rb-b','ta')")
  run("INSERT INTO mapel VALUES ('m-a','Matematika','ta')")
  run("INSERT INTO mapel VALUES ('m-unused','Tidak Dipakai','ta')")
  run("INSERT INTO mapel VALUES ('m-foreign','Mapel Tenant B','tb')")
  run("INSERT INTO penilaian_harian VALUES ('ph1','s-a','m-a','2026-08-01',80,70,60,'ta')")
  run("INSERT INTO penilaian_harian VALUES ('ph-old','s-a','m-unused','2026-01-01',99,99,99,'ta')")
  run("INSERT INTO penilaian_harian VALUES ('ph-b','s-b','m-a','2026-08-01',10,10,10,'ta')")
  run("INSERT INTO rapor VALUES ('sts','s-a','m-a','2026/2027','ganjil','sts',0,NULL,'ta')")
  run("INSERT INTO rapor VALUES ('sas','s-a','m-a','2026/2027','ganjil','sas',90,NULL,'ta')")
  run("INSERT INTO rapor VALUES ('rst','s-a','m-a','2026/2027','ganjil','rapor_sts',NULL,44,'ta')")
  run("INSERT INTO rapor VALUES ('rsa','s-a','m-a','2026/2027','ganjil','rapor_sas',NULL,68,'ta')")
  return db
}

const options = {
  tenantId: 'ta', rombelId: 'rb-a', tahunAjaran: '2026/2027', semester: 'ganjil',
  from: '2026-07-01', to: '2026-12-31', jenis: 'semua',
}

test('ledger memakai formula harian, mempertahankan nol, dan tidak membuat mapel kosong', () => {
  const rows = getLedgerRows(fixture(), options)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    siswa_id: 's-a', siswa_nama: 'Ani', siswa_nis: '1001',
    mapel_id: 'm-a', mapel_nama: 'Matematika', nilai_harian: 73,
    nilai_sts: 0, nilai_sas: 90, nilai_akhir_sts: 44, nilai_akhir_sas: 68,
  })
})

test('ledger memfilter jenis rapor dan periode secara eksplisit', () => {
  const db = fixture()
  const rows = getLedgerRows(db, { ...options, jenis: 'rapor_sts' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].nilai_sts, 0)
  assert.equal(rows[0].nilai_sas, null)
  assert.equal(rows[0].nilai_akhir_sts, 44)
  assert.equal(rows[0].nilai_akhir_sas, null)
})

test('daftar rombel ledger dibatasi ke kelas wali, sementara admin melihat semua kelas tenant', () => {
  const db = fixture()
  assert.deepEqual(getAuthorizedLedgerRombels(db, { tenantId: 'ta', role: 'wali_kelas', gtkId: 'gtk-wali' }), [
    { id: 'rb-a', nama: '7A', tahun_ajaran: '2026/2027' },
  ])
  assert.deepEqual(getAuthorizedLedgerRombels(db, { tenantId: 'ta', role: 'admin' }), [
    { id: 'rb-a', nama: '7A', tahun_ajaran: '2026/2027' },
    { id: 'rb-b', nama: '7B', tahun_ajaran: '2026/2027' },
  ])
  assert.deepEqual(getAuthorizedLedgerRombels(db, { tenantId: 'tb', role: 'admin' }), [])
})

test('workbook ledger dapat diparsing dan berisi dua nilai akhir', async () => {
  const rows = getLedgerRows(fixture(), options)
  const workbook = createLedgerWorkbook(rows, {
    rombelNama: '7A', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'semua',
  })
  const bytes = await workbook.xlsx.writeBuffer()
  const parsed = new ExcelJS.Workbook()
  await parsed.xlsx.load(bytes)
  const sheet = parsed.getWorksheet('Ledger')
  assert.equal(sheet.getCell('A1').value, 'Ledger Nilai - 7A - 2026/2027 ganjil')
  assert.equal(sheet.getCell('H3').value, 'Nilai Akhir STS')
  assert.equal(sheet.getCell('I3').value, 'Nilai Akhir SAS')
  assert.equal(sheet.getCell('B4').value, '1001')
  assert.equal(sheet.getCell('E4').value, 73)
  assert.equal(sheet.getCell('F4').value, 0)
  assert.equal(sheet.getCell('I4').value, 68)
})
