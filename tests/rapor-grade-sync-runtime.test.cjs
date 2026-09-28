const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { refreshGeneratedRapor, periodFromTanggal } = require('../server/rapor-grade-service.cjs')

// Runtime test: hasil generate awal TIDAK boleh basi saat nilai sumber berubah.
// Fokus: hanya baris rapor yang SUDAH ada yang dihitung ulang (tidak membuat
// rapor baru untuk pasangan yang belum pernah digenerate).
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
      nilai_sas INTEGER DEFAULT 0, nilai_akhir INTEGER DEFAULT 0, kkm INTEGER,
      predikat TEXT, deskripsi TEXT, tenant_id TEXT, updated_at TEXT
    );
    CREATE UNIQUE INDEX idx_rapor_unique
      ON rapor(tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis);
  `)
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('kelas-a', '2026/2027', 'tenant-a')
  db.prepare('INSERT INTO siswa VALUES (?,?,?)').run('siswa-a', 'kelas-a', 'tenant-a')
  db.prepare('INSERT INTO siswa VALUES (?,?,?)').run('siswa-b', 'kelas-a', 'tenant-a')
  db.prepare('INSERT INTO mapel VALUES (?,?,?)').run('mapel-a', 'Matematika', 'tenant-a')
  db.prepare('INSERT INTO mapel VALUES (?,?,?)').run('mapel-b', 'IPA', 'tenant-a')
  return db
}

let seq = 0
const idFactory = () => `row-${++seq}`
const predikatFromNilai = n => (n >= 75 ? 'A' : n >= 60 ? 'B' : 'C')

function addDaily(db, { id, siswa = 'siswa-a', mapel = 'mapel-a', tanggal = '2026-09-01', p = 0, k = 0, s = 0, tenant = 'tenant-a' }) {
  db.prepare('INSERT INTO penilaian_harian VALUES (?,?,?,?,?,?,?,?)')
    .run(id, siswa, mapel, tanggal, p, k, s, tenant)
}

function addGenerated(db, { id, siswa = 'siswa-a', mapel = 'mapel-a', tahun = '2026/2027', semester = 'ganjil', jenis = 'rapor_sts', akhir = 0, harian = 0, sts = 0, sas = 0, deskripsi = '' }) {
  db.prepare(`INSERT INTO rapor
    (id,siswa_id,mapel_id,tahun_ajaran,semester,jenis,nilai_harian,nilai_sts,nilai_sas,nilai_akhir,predikat,deskripsi,tenant_id,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, siswa, mapel, tahun, semester, jenis, harian, sts, sas, akhir, predikatFromNilai(akhir), deskripsi, 'tenant-a')
}

function addAsesmen(db, { id, siswa = 'siswa-a', mapel = 'mapel-a', tahun = '2026/2027', semester = 'ganjil', jenis = 'sts', nilai = 0 }) {
  db.prepare(`INSERT INTO rapor (id,siswa_id,mapel_id,tahun_ajaran,semester,jenis,nilai_sts,tenant_id,updated_at)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, siswa, mapel, tahun, semester, jenis, nilai, 'tenant-a')
}

function row(db, jenis = 'rapor_sts', siswa = 'siswa-a', mapel = 'mapel-a') {
  return db.prepare('SELECT * FROM rapor WHERE jenis=? AND siswa_id=? AND mapel_id=?').get(jenis, siswa, mapel)
}

test('nilai harian baru menghitung ulang rapor STS yang sudah digenerate', () => {
  const db = fixture()
  addDaily(db, { id: 'h1', p: 100, k: 50, s: 25 })
  addAsesmen(db, { id: 'asesmen-sts', nilai: 80 })
  addGenerated(db, { id: 'gen-sts', harian: 0, sts: 0, akhir: 0, jenis: 'rapor_sts' })

  const result = refreshGeneratedRapor(db, {
    tenantId: 'tenant-a', siswaId: 'siswa-a', mapelId: 'mapel-a',
    tahunAjaran: '2026/2027', semester: 'ganjil', predikatFromNilai,
  })

  const updated = row(db)
  assert.equal(result.updated, 1)
  assert.equal(updated.nilai_harian, 70) // 100*.5 + 50*.3 + 25*.2
  assert.equal(updated.nilai_pengetahuan, 100)
  assert.equal(updated.nilai_keterampilan, 50)
  assert.equal(updated.nilai_sikap, 25)
  assert.equal(updated.nilai_sts, 80)
  assert.equal(updated.nilai_akhir, 74) // 70*.6 + 80*.4
})

test('nilai asesmen berubah menghitung ulang rapor SAS (harian .4 + sts .2 + sas .4)', () => {
  const db = fixture()
  addDaily(db, { id: 'h1', p: 100, k: 50, s: 25 })
  addAsesmen(db, { id: 'asesmen-sts', jenis: 'sts', nilai: 60 })
  addAsesmen(db, { id: 'asesmen-sas', jenis: 'sas', nilai: 100 })
  addGenerated(db, { id: 'gen-sas', jenis: 'rapor_sas' })

  refreshGeneratedRapor(db, {
    tenantId: 'tenant-a', siswaId: 'siswa-a', mapelId: 'mapel-a',
    tahunAjaran: '2026/2027', semester: 'ganjil', predikatFromNilai,
  })

  const updated = row(db, 'rapor_sas')
  assert.equal(updated.nilai_harian, 70)
  assert.equal(updated.nilai_sts, 60)
  assert.equal(updated.nilai_sas, 100)
  assert.equal(updated.nilai_akhir, 80) // 70*.4 + 60*.2 + 100*.4
})

test('rapor yang belum pernah digenerate tidak dibuat otomatis', () => {
  const db = fixture()
  addDaily(db, { id: 'h1', p: 100, k: 100, s: 100 })
  addAsesmen(db, { id: 'asesmen-sts', nilai: 90 })

  const result = refreshGeneratedRapor(db, {
    tenantId: 'tenant-a', siswaId: 'siswa-a', mapelId: 'mapel-a',
    tahunAjaran: '2026/2027', semester: 'ganjil', predikatFromNilai,
  })

  assert.equal(result.updated, 0)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rapor WHERE jenis LIKE 'rapor_%'").get().n, 0)
})

test('menghapus nilai harian terakhir menghitung ulang rapor menjadi nol tanpa menghapus baris', () => {
  const db = fixture()
  addAsesmen(db, { id: 'asesmen-sts', nilai: 40 })
  addGenerated(db, { id: 'gen-sts', harian: 90, sts: 40, akhir: 70 })

  refreshGeneratedRapor(db, {
    tenantId: 'tenant-a', siswaId: 'siswa-a', mapelId: 'mapel-a',
    tahunAjaran: '2026/2027', semester: 'ganjil', predikatFromNilai,
  })

  const updated = row(db)
  assert.equal(updated.nilai_harian, 0)
  assert.equal(updated.nilai_akhir, 16) // 0*.6 + 40*.4
})

test('menghapus nilai harian terakhir tetap menghitung ulang walau tanggalnya sudah kosong', () => {
  const db = fixture()
  addDaily(db, { id: 'h1', tanggal: '2026-09-03', p: 80, k: 80, s: 80 })
  addAsesmen(db, { id: 'asesmen-sts', nilai: 40 })
  addGenerated(db, { id: 'gen-sts', harian: 80, sts: 40, akhir: 64 })

  // Guru menghapus satu-satunya nilai harian pada tanggal itu.
  db.prepare("DELETE FROM penilaian_harian WHERE id='h1'").run()

  const result = refreshGeneratedRapor(db, {
    tenantId: 'tenant-a', siswaId: 'siswa-a', mapelId: 'mapel-a', tanggal: '2026-09-03',
    predikatFromNilai,
  })

  const updated = row(db)
  assert.equal(result.updated, 1)
  assert.equal(updated.nilai_harian, 0)
  assert.equal(updated.nilai_akhir, 16) // 0*.6 + 40*.4
})

test('refreshing satu pasangan tidak menyentuh siswa, mapel, semester, atau tenant lain', () => {
  const db = fixture()
  addDaily(db, { id: 'h1', p: 100, k: 100, s: 100 })
  addDaily(db, { id: 'h2', siswa: 'siswa-b', p: 10, k: 10, s: 10 })
  addDaily(db, { id: 'h3', mapel: 'mapel-b', p: 20, k: 20, s: 20 })
  addDaily(db, { id: 'h4', tanggal: '2026-02-01', p: 30, k: 30, s: 30 })
  db.prepare('INSERT INTO siswa VALUES (?,?,?)').run('siswa-c', 'kelas-a', 'tenant-b')
  addDaily(db, { id: 'h5', siswa: 'siswa-c', tenant: 'tenant-b', p: 99, k: 99, s: 99 })
  addGenerated(db, { id: 'gen-a', harian: 1, akhir: 1 })
  addGenerated(db, { id: 'gen-b', siswa: 'siswa-b', harian: 1, akhir: 1 })
  addGenerated(db, { id: 'gen-mapel-b', mapel: 'mapel-b', harian: 1, akhir: 1 })
  addGenerated(db, { id: 'gen-genap', tahun: '2026/2027', semester: 'genap', harian: 1, akhir: 1 })
  addGenerated(db, { id: 'gen-tenant-b', siswa: 'siswa-c', harian: 1, akhir: 1 })

  refreshGeneratedRapor(db, {
    tenantId: 'tenant-a', siswaId: 'siswa-a', mapelId: 'mapel-a',
    tahunAjaran: '2026/2027', semester: 'ganjil', predikatFromNilai,
  })

  assert.equal(row(db).nilai_harian, 100)
  assert.equal(row(db, 'rapor_sts', 'siswa-b').nilai_harian, 1)
  assert.equal(row(db, 'rapor_sts', 'siswa-a', 'mapel-b').nilai_harian, 1)
  assert.equal(db.prepare("SELECT nilai_harian FROM rapor WHERE id='gen-genap'").get().nilai_harian, 1)
  assert.equal(db.prepare("SELECT nilai_harian FROM rapor WHERE id='gen-tenant-b'").get().nilai_harian, 1)
})

test('deskripsi dan metadata rapor yang sudah diisi tidak dihapus saat hitung ulang', () => {
  const db = fixture()
  addDaily(db, { id: 'h1', p: 80, k: 80, s: 80 })
  addGenerated(db, { id: 'gen-sts', harian: 0, akhir: 0, deskripsi: 'Sudah baik, pertahankan.' })
  db.prepare("UPDATE rapor SET kkm=75 WHERE id='gen-sts'").run()

  refreshGeneratedRapor(db, {
    tenantId: 'tenant-a', siswaId: 'siswa-a', mapelId: 'mapel-a',
    tahunAjaran: '2026/2027', semester: 'ganjil', predikatFromNilai,
  })

  const updated = row(db)
  assert.equal(updated.deskripsi, 'Sudah baik, pertahankan.')
  assert.equal(updated.kkm, 75)
  assert.equal(updated.nilai_harian, 80)
})

test('refresh berbasis tanggal memakai periode semester yang benar dan seluruh pasangan hari itu', () => {
  const db = fixture()
  addDaily(db, { id: 'h1', tanggal: '2026-09-03', p: 100, k: 100, s: 100 })
  addDaily(db, { id: 'h2', tanggal: '2026-09-03', siswa: 'siswa-b', mapel: 'mapel-b', p: 100, k: 0, s: 0 })
  addGenerated(db, { id: 'gen-a', harian: 0, akhir: 0 })
  addGenerated(db, { id: 'gen-b', siswa: 'siswa-b', mapel: 'mapel-b', harian: 0, akhir: 0 })

  const result = refreshGeneratedRapor(db, { tenantId: 'tenant-a', tanggal: '2026-09-03', predikatFromNilai })

  assert.equal(result.updated, 2)
  assert.equal(row(db).nilai_harian, 100)
  assert.equal(row(db, 'rapor_sts', 'siswa-b', 'mapel-b').nilai_harian, 50)
})

test('periode diturunkan dari tanggal: Juli-Desember ganjil, Januari-Juni genap', () => {
  assert.deepEqual(periodFromTanggal('2026-09-03'), { tahunAjaran: '2026/2027', semester: 'ganjil' })
  assert.deepEqual(periodFromTanggal('2026-07-01'), { tahunAjaran: '2026/2027', semester: 'ganjil' })
  assert.deepEqual(periodFromTanggal('2027-01-05'), { tahunAjaran: '2026/2027', semester: 'genap' })
  assert.deepEqual(periodFromTanggal('2027-06-30'), { tahunAjaran: '2026/2027', semester: 'genap' })
  assert.equal(periodFromTanggal(''), null)
})

test('nilai harian di luar rentang semester tidak dipakai menghitung ulang', () => {
  const db = fixture()
  addDaily(db, { id: 'dalam', p: 100, k: 100, s: 100 })
  addDaily(db, { id: 'luar', tanggal: '2027-02-01', p: 0, k: 0, s: 0 })
  addGenerated(db, { id: 'gen-sts', harian: 0, akhir: 0 })

  refreshGeneratedRapor(db, {
    tenantId: 'tenant-a', siswaId: 'siswa-a', mapelId: 'mapel-a',
    tahunAjaran: '2026/2027', semester: 'ganjil', predikatFromNilai,
  })

  assert.equal(row(db).nilai_harian, 100)
})
