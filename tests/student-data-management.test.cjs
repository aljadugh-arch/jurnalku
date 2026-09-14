const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const XLSX = require('xlsx')

const root = path.join(__dirname, '..')

function fixtureDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, rombel_id TEXT, nama TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, siswa_id TEXT, role TEXT);
    CREATE TABLE absensi_siswa (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, siswa_id TEXT NOT NULL, FOREIGN KEY (siswa_id) REFERENCES siswa(id));
    CREATE TABLE qr_siswa_identifiers (tenant_id TEXT NOT NULL, token TEXT NOT NULL, siswa_id TEXT NOT NULL, PRIMARY KEY (tenant_id, token));
    CREATE TABLE cashless_ledger (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, student_id TEXT NOT NULL, amount INTEGER NOT NULL);
  `)
  const students = [
    ['a1', 'tenant-a', 'r1', 'A Satu'],
    ['a2', 'tenant-a', 'r2', 'A Dua'],
    ['b1', 'tenant-b', 'r1', 'B Satu'],
  ]
  for (const row of students) db.prepare('INSERT INTO siswa VALUES (?,?,?,?)').run(...row)
  for (const [id, tenant] of [['a1', 'tenant-a'], ['a2', 'tenant-a'], ['b1', 'tenant-b']]) {
    db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(`u-${id}`, tenant, id, 'siswa')
    db.prepare('INSERT INTO absensi_siswa VALUES (?,?,?)').run(`abs-${id}`, tenant, id)
    db.prepare('INSERT INTO qr_siswa_identifiers VALUES (?,?,?)').run(tenant, `qr-${id}`, id)
    db.prepare('INSERT INTO cashless_ledger VALUES (?,?,?,?)').run(`cash-${id}`, tenant, id, 1000)
  }
  return db
}

test('bulk delete per rombel removes related student records only inside active tenant', () => {
  const { deleteStudents } = require('../server/student-data-delete.cjs')
  const db = fixtureDb()
  const result = deleteStudents(db, { tenantId: 'tenant-a', rombelId: 'r1' })
  assert.equal(result.students, 1)
  assert.deepEqual(db.prepare('SELECT id FROM siswa ORDER BY id').all(), [{ id: 'a2' }, { id: 'b1' }])
  for (const table of ['users', 'absensi_siswa', 'qr_siswa_identifiers', 'cashless_ledger']) {
    assert.equal(db.prepare(`SELECT COUNT(*) total FROM ${table} WHERE tenant_id='tenant-a' AND ${table === 'cashless_ledger' ? 'student_id' : 'siswa_id'}='a1'`).get().total, 0)
    assert.equal(db.prepare(`SELECT COUNT(*) total FROM ${table} WHERE tenant_id='tenant-b'`).get().total, 1)
  }
  db.close()
})

test('bulk delete all removes only the active tenant and requires explicit route confirmation', () => {
  const { deleteStudents } = require('../server/student-data-delete.cjs')
  const db = fixtureDb()
  const result = deleteStudents(db, { tenantId: 'tenant-a' })
  assert.equal(result.students, 2)
  assert.deepEqual(db.prepare('SELECT id, tenant_id FROM siswa').all(), [{ id: 'b1', tenant_id: 'tenant-b' }])
  assert.equal(db.prepare("SELECT COUNT(*) total FROM absensi_siswa WHERE tenant_id='tenant-b'").get().total, 1)
  db.close()

  const server = fs.readFileSync(path.join(root, 'server', 'index.cjs'), 'utf8')
  assert.match(server, /app\.get\('\/api\/siswa\/bulk-delete\/count', ADMIN/)
  assert.match(server, /app\.post\('\/api\/siswa\/bulk-delete', ADMIN/)
  assert.match(server, /HAPUS SEMUA SISWA/)
  assert.match(server, /HAPUS SISWA ROMBEL/)
})

test('Data Siswa sends rombel filter and exposes protected per-rombel and all delete controls', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
  const tenantRoutes = fs.readFileSync(path.join(root, 'server', 'tenant.cjs'), 'utf8')
  assert.match(page, /params\.rombel_id = selectedRombelId/)
  assert.match(page, /foundation\/rombels/)
  assert.match(tenantRoutes, /app\.get\('\/api\/foundation\/rombels'/)
  assert.match(tenantRoutes, /if \(rombel_id\)/)
  assert.match(page, /Semua rombel \/ kelas/)
  assert.match(page, /Hapus Rombel/)
  assert.match(page, /Hapus Semua Siswa/)
  assert.match(page, /\/siswa\/bulk-delete/)
})

test('student import template is a downloadable valid xlsx matching supported fields', () => {
  const templatePath = path.join(root, 'public', 'templates', 'template-import-siswa.xlsx')
  assert.equal(fs.existsSync(templatePath), true, 'template XLSX must exist')
  const wb = XLSX.readFile(templatePath)
  assert.ok(wb.SheetNames.includes('Data Siswa'))
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Data Siswa'], { header: 1 })
  assert.deepEqual(rows[0], ['NIK', 'NIS', 'NISN', 'Nama', 'Nama Panggilan', 'JK', 'Tempat Lahir', 'Tanggal Lahir', 'Alamat', 'No HP', 'Nama Ortu', 'Rombel'])

  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
  const component = fs.readFileSync(path.join(root, 'src', 'components', 'ImportExcel.tsx'), 'utf8')
  assert.match(page, /templateUrl="\/templates\/template-import-siswa\.xlsx"/)
  assert.match(page, /'Rombel': 'rombel_nama'/)
  assert.match(component, /Unduh Template/)
  assert.match(component, /download=\{templateName\}/)
})
