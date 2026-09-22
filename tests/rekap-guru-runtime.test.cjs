const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const ExcelJS = require('exceljs')
const {
  getTeacherMapelRombelContext, getGuruWithAssignments, isTeacherAssignedToPair,
  getRekapNilaiRows, createRekapWorkbook, createRekapPdf,
} = require('../server/nilai-rekap-service.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE gtk (id TEXT PRIMARY KEY, nama TEXT, kode_guru TEXT, tenant_id TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, nama TEXT, tahun_ajaran TEXT, tenant_id TEXT);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, nama TEXT, nis TEXT, rombel_id TEXT, tenant_id TEXT);
    CREATE TABLE mapel (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE pengajar (id TEXT PRIMARY KEY, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT, tenant_id TEXT);
    CREATE TABLE jadwal (id TEXT PRIMARY KEY, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT, tenant_id TEXT);
    CREATE TABLE penilaian_harian (id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tanggal TEXT, pengetahuan REAL, keaktifan REAL, sikap REAL, tenant_id TEXT);
    CREATE TABLE rapor (id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT, semester TEXT, jenis TEXT, nilai_sts REAL, tenant_id TEXT);
  `)
  const run = (sql, ...args) => db.prepare(sql).run(...args)
  run("INSERT INTO gtk VALUES ('gtk-a','Bu Sari','G001','ta')")
  run("INSERT INTO gtk VALUES ('gtk-b','Pak Budi','G002','ta')")
  run("INSERT INTO rombel VALUES ('rb-a','7A','2026/2027','ta')")
  run("INSERT INTO rombel VALUES ('rb-b','7B','2026/2027','ta')")
  run("INSERT INTO siswa VALUES ('s-a','Ani','1001','rb-a','ta')")
  run("INSERT INTO siswa VALUES ('s-c','Cici','1002','rb-a','ta')")
  run("INSERT INTO mapel VALUES ('m-a','Matematika','ta')")
  run("INSERT INTO mapel VALUES ('m-b','IPA','ta')")
  run("INSERT INTO pengajar VALUES ('pg1','gtk-a','m-a','rb-a','ta')")
  run("INSERT INTO jadwal VALUES ('jd1','gtk-b','m-b','rb-b','ta')")
  run("INSERT INTO penilaian_harian VALUES ('ph1','s-a','m-a','2026-08-01',80,70,60,'ta')")
  run("INSERT INTO rapor VALUES ('r1','s-a','m-a','2026/2027','ganjil','sts',0,'ta')")
  run("INSERT INTO rapor VALUES ('r2','s-a','m-a','2026/2027','ganjil','sas',90,'ta')")
  return db
}

const baseOptions = {
  tenantId: 'ta', rombelId: 'rb-a', mapelId: 'm-a', tahunAjaran: '2026/2027', semester: 'ganjil',
  from: '2026-07-01', to: '2026-12-31', jenis: 'semua',
}

test('konteks guru mengambil dari pengajar dan jadwal (union, tanpa duplikat)', () => {
  const db = fixture()
  const ctxA = getTeacherMapelRombelContext(db, { tenantId: 'ta', gtkId: 'gtk-a' })
  assert.deepEqual(ctxA, [{ mapel_id: 'm-a', mapel_nama: 'Matematika', rombel_id: 'rb-a', rombel_nama: '7A', tahun_ajaran: '2026/2027' }])
  const ctxB = getTeacherMapelRombelContext(db, { tenantId: 'ta', gtkId: 'gtk-b' })
  assert.deepEqual(ctxB, [{ mapel_id: 'm-b', mapel_nama: 'IPA', rombel_id: 'rb-b', rombel_nama: '7B', tahun_ajaran: '2026/2027' }])
})

test('daftar guru hanya berisi guru yang punya penugasan', () => {
  const db = fixture()
  run_(db, "INSERT INTO gtk VALUES ('gtk-c','Tanpa Kelas','G003','ta')")
  const daftar = getGuruWithAssignments(db, 'ta')
  assert.deepEqual(daftar.map(g => g.id).sort(), ['gtk-a', 'gtk-b'])
})
function run_(db, sql) { db.prepare(sql).run() }

test('isTeacherAssignedToPair menolak kombinasi mapel/rombel yang tidak diajar', () => {
  const db = fixture()
  assert.equal(isTeacherAssignedToPair(db, { tenantId: 'ta', gtkId: 'gtk-a', mapelId: 'm-a', rombelId: 'rb-a' }), true)
  assert.equal(isTeacherAssignedToPair(db, { tenantId: 'ta', gtkId: 'gtk-a', mapelId: 'm-b', rombelId: 'rb-a' }), false)
  assert.equal(isTeacherAssignedToPair(db, { tenantId: 'ta', gtkId: 'gtk-b', mapelId: 'm-b', rombelId: 'rb-b' }), true)
})

test('rekap nilai mempertahankan nilai nol dan null untuk siswa tanpa nilai', () => {
  const rows = getRekapNilaiRows(fixture(), baseOptions)
  assert.equal(rows.length, 2)
  const ani = rows.find(r => r.siswa_id === 's-a')
  const cici = rows.find(r => r.siswa_id === 's-c')
  assert.equal(ani.nilai_harian, 73)
  assert.equal(ani.nilai_sts, 0)
  assert.equal(ani.nilai_sas, 90)
  assert.equal(cici.nilai_harian, 0)
  assert.equal(cici.nilai_sts, null)
  assert.equal(cici.nilai_sas, null)
})

test('rekap nilai jenis=sts hanya mengisi kolom STS, kolom lain null', () => {
  const rows = getRekapNilaiRows(fixture(), { ...baseOptions, jenis: 'sts' })
  const ani = rows.find(r => r.siswa_id === 's-a')
  assert.equal(ani.nilai_sts, 0)
  assert.equal(ani.nilai_sas, null)
  assert.equal(ani.nilai_harian, null)
})

test('workbook rekap dapat diparsing dan berisi header + nilai benar', async () => {
  const rows = getRekapNilaiRows(fixture(), baseOptions)
  const workbook = createRekapWorkbook(rows, {
    rombelNama: '7A', mapelNama: 'Matematika', guruNama: 'Bu Sari', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'semua',
  })
  const bytes = await workbook.xlsx.writeBuffer()
  const parsed = new ExcelJS.Workbook()
  await parsed.xlsx.load(bytes)
  const sheet = parsed.getWorksheet('Rekap Nilai')
  assert.equal(sheet.getCell('A1').value, 'Rekap Nilai - Matematika - 7A - 2026/2027 ganjil')
  assert.equal(sheet.getCell('A2').value, 'Guru: Bu Sari')
  assert.equal(sheet.getCell('D4').value, 'Nilai Harian')
  assert.equal(sheet.getCell('B5').value, '1001')
  assert.equal(sheet.getCell('E5').value, 0)
  assert.equal(sheet.getCell('F5').value, 90)
})

test('createRekapPdf menghasilkan dokumen PDF valid (menghasilkan buffer non-kosong)', async () => {
  const rows = getRekapNilaiRows(fixture(), baseOptions)
  const doc = createRekapPdf(rows, {
    rombelNama: '7A', mapelNama: 'Matematika', guruNama: 'Bu Sari', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'semua',
  })
  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise(resolve => doc.on('end', resolve))
  doc.end()
  await done
  const buf = Buffer.concat(chunks)
  assert.ok(buf.length > 500)
  assert.equal(buf.subarray(0, 4).toString(), '%PDF')
})
