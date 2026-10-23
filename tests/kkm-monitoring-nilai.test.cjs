'use strict'
// Kontrak: KKM per mapel+tingkat + monitoring pengisian nilai per guru.
const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const path = require('node:path')

const { loadKkm, pickKkm, kkmOverview, tingkatListTenant, KKM_DEFAULT } = require('../server/kkm-service.cjs')
const { hitungMonitoringNilai } = require('../server/nilai-monitoring-service.cjs')

function fixtureDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE mapel (id TEXT PRIMARY KEY, kode TEXT, nama TEXT, kelompok TEXT DEFAULT 'wajib', tingkat TEXT DEFAULT '[]', jam_per_minggu INTEGER DEFAULT 2, tenant_id TEXT DEFAULT 'default');
    CREATE TABLE rombel (id TEXT PRIMARY KEY, nama TEXT, tingkat TEXT, tahun_ajaran TEXT, wali_kelas_id TEXT, kapasitas INTEGER DEFAULT 36, tenant_id TEXT DEFAULT 'default');
    CREATE TABLE gtk (id TEXT PRIMARY KEY, nama TEXT, kode_guru TEXT, tenant_id TEXT DEFAULT 'default');
    CREATE TABLE siswa (id TEXT PRIMARY KEY, nama TEXT, nis TEXT, rombel_id TEXT, status TEXT DEFAULT 'aktif', tenant_id TEXT DEFAULT 'default');
    CREATE TABLE pengajar (id TEXT PRIMARY KEY, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT, jam_per_minggu INTEGER DEFAULT 2, tenant_id TEXT DEFAULT 'default');
    CREATE TABLE jadwal (id TEXT PRIMARY KEY, mapel_id TEXT, rombel_id TEXT, gtk_id TEXT, hari TEXT, jam_mulai TEXT, jam_selesai TEXT, tenant_id TEXT DEFAULT 'default');
    CREATE TABLE penilaian_harian (id TEXT PRIMARY KEY, jurnal_id TEXT, siswa_id TEXT, mapel_id TEXT, tanggal TEXT, sikap INTEGER DEFAULT 0, keaktifan INTEGER DEFAULT 0, pengetahuan INTEGER DEFAULT 0, tenant_id TEXT DEFAULT 'default');
    CREATE TABLE rapor (id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT, semester TEXT, jenis TEXT, nilai_sts INTEGER DEFAULT 0, nilai_sas INTEGER DEFAULT 0, kkm INTEGER DEFAULT 70, tenant_id TEXT DEFAULT 'default');
    CREATE TABLE kkm_mapel (id TEXT PRIMARY KEY, tenant_id TEXT, mapel_id TEXT, tingkat TEXT DEFAULT '', kkm INTEGER DEFAULT 70, updated_at TEXT, UNIQUE(tenant_id, mapel_id, tingkat));
  `)
  return db
}

test('pickKkm: override tingkat spesifik menang atas nilai umum, lalu fallback', () => {
  const rows = [
    { mapel_id: 'm1', tingkat: '', kkm: 75 },
    { mapel_id: 'm1', tingkat: 'VII', kkm: 78 },
    { mapel_id: 'm2', tingkat: 'VIII', kkm: 80 },
  ]
  assert.equal(pickKkm(rows, { mapelId: 'm1', tingkat: 'VII' }, 70), 78)
  assert.equal(pickKkm(rows, { mapelId: 'm1', tingkat: 'VIII' }, 70), 75, 'VIII tanpa override jatuh ke umum')
  assert.equal(pickKkm(rows, { mapelId: 'm2', tingkat: 'VIII' }, 70), 80)
  assert.equal(pickKkm(rows, { mapelId: 'm2', tingkat: 'VII' }, 70), 70, 'tanpa umum & tanpa spesifik -> fallback')
})

test('kkmOverview: nilai umum null bila belum diisi, override per tingkat terpisah', () => {
  const db = fixtureDb()
  db.prepare("INSERT INTO mapel (id, kode, nama, kelompok, tenant_id) VALUES ('m1','BIN','Bahasa Indonesia','wajib','t1')").run()
  db.prepare("INSERT INTO mapel (id, kode, nama, kelompok, tenant_id) VALUES ('m2','MAT','Matematika','wajib','t1')").run()
  db.prepare("INSERT INTO rombel (id, nama, tingkat, tahun_ajaran, tenant_id) VALUES ('r1','VII-A','VII','2026/2027','t1')").run()
  db.prepare("INSERT INTO rombel (id, nama, tingkat, tahun_ajaran, tenant_id) VALUES ('r2','VIII-A','VIII','2026/2027','t1')").run()
  db.prepare("INSERT INTO kkm_mapel (id, tenant_id, mapel_id, tingkat, kkm) VALUES ('k1','t1','m1','',75)").run()
  db.prepare("INSERT INTO kkm_mapel (id, tenant_id, mapel_id, tingkat, kkm) VALUES ('k2','t1','m1','VII',78)").run()

  const tingkat = tingkatListTenant(db, 't1')
  assert.deepEqual(tingkat, ['VII', 'VIII'])
  const mapelRows = db.prepare("SELECT id, nama, kelompok FROM mapel WHERE tenant_id='t1' ORDER BY nama").all()
  const overview = kkmOverview(db, 't1', { mapelRows, tingkatList: tingkat })
  const m1 = overview.find(m => m.mapel_id === 'm1')
  const m2 = overview.find(m => m.mapel_id === 'm2')
  assert.equal(m1.kkm_umum, 75)
  assert.equal(m1.per_tingkat.find(t => t.tingkat === 'VII').kkm, 78)
  assert.equal(m1.per_tingkat.find(t => t.tingkat === 'VIII').kkm, null)
  assert.equal(m2.kkm_umum, null, 'm2 belum diisi = null (pakai fallback)')
})

test('hitungMonitoringNilai: status terisi harian/sts/sas per guru per mapel+rombel', () => {
  const db = fixtureDb()
  // Data: 1 guru, 1 mapel, 1 rombel, 3 siswa.
  db.prepare("INSERT INTO gtk (id, nama, kode_guru, tenant_id) VALUES ('g1','Guru Satu','K01','t1')").run()
  db.prepare("INSERT INTO mapel (id, kode, nama, kelompok, tenant_id) VALUES ('m1','BIN','Bahasa Indonesia','wajib','t1')").run()
  db.prepare("INSERT INTO rombel (id, nama, tingkat, tahun_ajaran, tenant_id) VALUES ('r1','VII-A','VII','2026/2027','t1')").run()
  db.prepare("INSERT INTO pengajar (id, gtk_id, mapel_id, rombel_id, tenant_id) VALUES ('p1','g1','m1','r1','t1')").run()
  for (const [id, nama] of [['s1','Siswa A'], ['s2','Siswa B'], ['s3','Siswa C']]) {
    db.prepare("INSERT INTO siswa (id, nama, nis, rombel_id, tenant_id) VALUES (?,?,?,?,?)").run(id, nama, `NIS-${id}`, 'r1', 't1')
  }
  // Harian: hanya s1 yang punya nilai > 0; s2 baris semua nol (tidak dihitung).
  db.prepare("INSERT INTO penilaian_harian (id, siswa_id, mapel_id, tanggal, pengetahuan, tenant_id) VALUES ('h1','s1','m1','2026-09-01',80,'t1')").run()
  db.prepare("INSERT INTO penilaian_harian (id, siswa_id, mapel_id, tanggal, pengetahuan, tenant_id) VALUES ('h2','s2','m1','2026-09-01',0,'t1')").run()
  // STS: s1 & s3 terisi.
  db.prepare("INSERT INTO rapor (id, siswa_id, mapel_id, tahun_ajaran, semester, jenis, nilai_sts, tenant_id) VALUES ('r1','s1','m1','2026/2027','ganjil','sts',80,'t1')").run()
  db.prepare("INSERT INTO rapor (id, siswa_id, mapel_id, tahun_ajaran, semester, jenis, nilai_sts, tenant_id) VALUES ('r3','s3','m1','2026/2027','ganjil','sts',85,'t1')").run()
  // SAS: hanya s1.
  db.prepare("INSERT INTO rapor (id, siswa_id, mapel_id, tahun_ajaran, semester, jenis, nilai_sas, tenant_id) VALUES ('r4','s1','m1','2026/2027','ganjil','sas',90,'t1')").run()

  const hasil = hitungMonitoringNilai(db, { tenantId: 't1', tahunAjaran: '2026/2027', semester: 'ganjil' })
  assert.equal(hasil.jumlah_guru, 1)
  const tugas = hasil.daftar[0].tugas[0]
  assert.equal(tugas.total, 3)
  assert.equal(tugas.harian, 1, 'harian: hanya s1 (s2 semua-nol tidak dihitung)')
  assert.equal(tugas.sts, 2, 'sts: s1 & s3')
  assert.equal(tugas.sas, 1, 'sas: hanya s1')
})

test('monitoring menolak semester/tahun_ajaran tidak valid', () => {
  const db = fixtureDb()
  assert.throws(() => hitungMonitoringNilai(db, { tenantId: 't1', tahunAjaran: '2026/2027', semester: 'gajil' }), /semester/, 'salah eja harus ditolak')
  assert.throws(() => hitungMonitoringNilai(db, { tenantId: 't1', tahunAjaran: '2026-2027', semester: 'ganjil' }), /YYYY\/YYYY/, 'tahun_ajaran harus YYYY/YYYY')
})

// Kontrak rute: PUT /api/rapor/kkm WAJIB didaftarkan SEBELUM /api/rapor/:id.
// Express mencocokkan rute sesuai urutan pendaftaran; bila kkm didaftarkan
// sesudah :id, permintaan ke /api/rapor/kkm dibaca sebagai id 'kkm' dan
// berakhir 404 "Rapor tidak ditemukan" alih-alih menyimpan KKM.
test('rute /api/rapor/kkm didaftarkan sebelum /api/rapor/:id', () => {
  const fs = require('node:fs')
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
  // Cocokkan DEKLARASI rute (di awal baris), bukan kemunculan di komentar.
  const baris = src.split('\n')
  const barisKkm = baris.findIndex(l => /^\s*app\.put\('\/api\/rapor\/kkm'/.test(l))
  const barisId = baris.findIndex(l => /^\s*app\.put\('\/api\/rapor\/:id'/.test(l))
  assert.ok(barisKkm !== -1, 'rute PUT /api/rapor/kkm harus ada')
  assert.ok(barisId !== -1, 'rute PUT /api/rapor/:id harus ada')
  assert.ok(barisKkm < barisId, `kkm (baris ${barisKkm}) harus sebelum :id (baris ${barisId}) — bila tidak, :id menelan /api/rapor/kkm`)
})
