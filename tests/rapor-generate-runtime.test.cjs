const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { generateRaporForRombel } = require('../server/rapor-grade-service.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE siswa (id TEXT PRIMARY KEY, rombel_id TEXT, tenant_id TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, tahun_ajaran TEXT, tenant_id TEXT);
    CREATE TABLE mapel (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE penilaian_harian (
      id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tanggal TEXT,
      pengetahuan INTEGER, keaktifan INTEGER, sikap INTEGER, tenant_id TEXT
    );
    CREATE TABLE rapor (
      id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT,
      semester TEXT, jenis TEXT, nilai_pengetahuan INTEGER DEFAULT 0,
      nilai_keterampilan INTEGER DEFAULT 0, nilai_sikap INTEGER DEFAULT 0,
      nilai_harian INTEGER DEFAULT 0, nilai_sts INTEGER DEFAULT 0,
      nilai_sas INTEGER DEFAULT 0, nilai_akhir INTEGER DEFAULT 0,
      predikat TEXT, deskripsi TEXT, tenant_id TEXT, updated_at TEXT
    );
    CREATE UNIQUE INDEX idx_rapor_unique
      ON rapor(tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis);
  `)
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('kelas-a', '2026/2027', 'tenant-a')
  db.prepare('INSERT INTO siswa VALUES (?,?,?)').run('siswa-a', 'kelas-a', 'tenant-a')
  db.prepare('INSERT INTO mapel VALUES (?,?,?)').run('mapel-a', 'Matematika', 'tenant-a')
  return db
}

const options = {
  tenantId: 'tenant-a', rombelId: 'kelas-a', tahunAjaran: '2026/2027',
  semester: 'ganjil', from: '2026-07-01', to: '2026-12-31',
  idFactory: (() => { let i = 0; return () => `generated-${++i}` })(),
  predikatFromNilai: n => n >= 70 ? 'C' : 'D',
}

function insertAsesmen(db, jenis, nilai, overrides = {}) {
  db.prepare(`INSERT INTO rapor
    (id,siswa_id,mapel_id,tahun_ajaran,semester,jenis,nilai_sts,tenant_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(
      overrides.id || `asesmen-${jenis}-${nilai}`,
      overrides.siswaId || 'siswa-a', overrides.mapelId || 'mapel-a',
      overrides.tahunAjaran || '2026/2027', overrides.semester || 'ganjil',
      jenis, nilai, overrides.tenantId || 'tenant-a'
    )
}

test('generate membuat rapor dari asesmen STS meski tanpa nilai harian', () => {
  const db = fixture()
  insertAsesmen(db, 'sts', 80)

  const count = generateRaporForRombel(db, { ...options, jenis: 'rapor_sts' })
  const row = db.prepare("SELECT * FROM rapor WHERE jenis='rapor_sts'").get()

  assert.equal(count, 1)
  assert.equal(row.nilai_harian, 0)
  assert.equal(row.nilai_sts, 80)
  assert.equal(row.nilai_akhir, 32)
})

test('generate menggabungkan harian, STS, dan SAS tanpa duplikasi mapel', () => {
  const db = fixture()
  db.prepare('INSERT INTO penilaian_harian VALUES (?,?,?,?,?,?,?,?)')
    .run('harian-1', 'siswa-a', 'mapel-a', '2026-09-01', 100, 50, 25, 'tenant-a')
  insertAsesmen(db, 'sts', 0)
  insertAsesmen(db, 'sas', 100)

  const count = generateRaporForRombel(db, { ...options, jenis: 'rapor_sas' })
  const rows = db.prepare("SELECT * FROM rapor WHERE jenis='rapor_sas'").all()

  assert.equal(count, 1)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].nilai_harian, 70)
  assert.equal(rows[0].nilai_sts, 0)
  assert.equal(rows[0].nilai_sas, 100)
  assert.equal(rows[0].nilai_akhir, 68)
})

test('nilai asesmen numerik 0 tetap dianggap data dan menghasilkan satu rapor', () => {
  const db = fixture()
  insertAsesmen(db, 'sts', 0)

  const count = generateRaporForRombel(db, { ...options, jenis: 'rapor_sts' })
  const row = db.prepare("SELECT nilai_sts,nilai_akhir FROM rapor WHERE jenis='rapor_sts'").get()

  assert.equal(count, 1)
  assert.deepEqual(row, { nilai_sts: 0, nilai_akhir: 0 })
})

test('generate mengecualikan nilai tenant, periode, dan tanggal lain', () => {
  const db = fixture()
  db.prepare('INSERT INTO penilaian_harian VALUES (?,?,?,?,?,?,?,?)')
    .run('outside-date', 'siswa-a', 'mapel-a', '2027-02-01', 100, 100, 100, 'tenant-a')
  insertAsesmen(db, 'sts', 90, { id: 'outside-period', semester: 'genap' })

  const count = generateRaporForRombel(db, { ...options, jenis: 'rapor_sts' })
  assert.equal(count, 0)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rapor WHERE jenis='rapor_sts'").get().n, 0)
})
