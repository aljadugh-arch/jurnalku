const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')
const {
  generateRaporForRombel, computeNilai, pickBobot, normalizeBobot, BOBOT_DEFAULT,
} = require('../server/rapor-grade-service.cjs')

function buildDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, rombel_id TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, tingkat TEXT, tahun_ajaran TEXT);
    CREATE TABLE mapel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE penilaian_harian (
      id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tenant_id TEXT, tanggal TEXT,
      pengetahuan REAL, keaktifan REAL, sikap REAL
    );
    CREATE TABLE rapor (
      id TEXT PRIMARY KEY, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT, semester TEXT, jenis TEXT,
      nilai_pengetahuan INTEGER, nilai_keterampilan INTEGER, nilai_sikap INTEGER, nilai_harian INTEGER,
      nilai_sts INTEGER, nilai_sas INTEGER, nilai_akhir INTEGER, predikat TEXT, deskripsi TEXT,
      tenant_id TEXT, updated_at TEXT
    );
    CREATE UNIQUE INDEX idx_rapor_unique ON rapor(tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis);
    CREATE TABLE rapor_bobot (
      id TEXT PRIMARY KEY, tenant_id TEXT, rombel_id TEXT NOT NULL DEFAULT '', mapel_id TEXT NOT NULL DEFAULT '',
      sts_harian REAL, sts_sts REAL, sts_sas REAL, sas_harian REAL, sas_sts REAL, sas_sas REAL,
      created_at TEXT, updated_at TEXT,
      UNIQUE(tenant_id, rombel_id, mapel_id)
    );
    INSERT INTO rombel VALUES ('r1','t1','X-A','X','2025/2026');
    INSERT INTO siswa VALUES ('s1','t1','Budi','r1');
    INSERT INTO mapel VALUES ('m1','t1','Matematika');
    -- harian = 90 (pengetahuan*0.5 + keaktifan*0.3 + sikap*0.2)
    INSERT INTO penilaian_harian VALUES ('p1','s1','m1','t1','2025-08-01',90,90,90);
    -- baris asesmen STS = 70
    INSERT INTO rapor (id,siswa_id,mapel_id,tahun_ajaran,semester,jenis,nilai_sts,tenant_id)
      VALUES ('a1','s1','m1','2025/2026','ganjil','sts',70,'t1');
  `)
  return db
}

const OPSI = {
  tenantId: 't1', rombelId: 'r1', tahunAjaran: '2025/2026', semester: 'ganjil',
  jenis: 'rapor_sts', from: '2025-07-01', to: '2025-12-31',
  predikatFromNilai: () => 'B',
}
let seq = 0
const withIds = (extra = {}) => ({ ...OPSI, ...extra, idFactory: () => `x-${++seq}` })

const akhirOf = (db) => db.prepare(
  "SELECT nilai_akhir FROM rapor WHERE siswa_id='s1' AND mapel_id='m1' AND jenis='rapor_sts'",
).get()?.nilai_akhir

test('bobot bawaan menghasilkan rumus lama (harian*0.6 + sts*0.4)', () => {
  const db = buildDb()
  generateRaporForRombel(db, withIds())
  // 90*0.6 + 70*0.4 = 54 + 28 = 82
  assert.equal(akhirOf(db), 82)
  db.close()
})

test('bobot kustom 50/50 mengubah nilai akhir', () => {
  const db = buildDb()
  db.prepare(`INSERT INTO rapor_bobot (id,tenant_id,rombel_id,mapel_id,sts_harian,sts_sts,sts_sas,sas_harian,sas_sts,sas_sas)
    VALUES ('b1','t1','','',0.5,0.5,0,0.4,0.2,0.4)`).run()
  generateRaporForRombel(db, withIds())
  // 90*0.5 + 70*0.5 = 45 + 35 = 80
  assert.equal(akhirOf(db), 80)
  db.close()
})

test('bobot per mapel+rombel menang atas default tenant', () => {
  const db = buildDb()
  db.prepare(`INSERT INTO rapor_bobot (id,tenant_id,rombel_id,mapel_id,sts_harian,sts_sts,sts_sas,sas_harian,sas_sts,sas_sas)
    VALUES ('b1','t1','','',0.5,0.5,0,0.4,0.2,0.4)`).run()
  db.prepare(`INSERT INTO rapor_bobot (id,tenant_id,rombel_id,mapel_id,sts_harian,sts_sts,sts_sas,sas_harian,sas_sts,sas_sas)
    VALUES ('b2','t1','r1','m1',0.25,0.75,0,0.4,0.2,0.4)`).run()
  generateRaporForRombel(db, withIds())
  // 90*0.25 + 70*0.75 = 22.5 + 52.5 = 75
  assert.equal(akhirOf(db), 75)
  db.close()
})

test('bobot tenant lain tidak bocor ke tenant ini', () => {
  const db = buildDb()
  db.prepare(`INSERT INTO rapor_bobot (id,tenant_id,rombel_id,mapel_id,sts_harian,sts_sts,sts_sas,sas_harian,sas_sts,sas_sas)
    VALUES ('b1','t2','','',0.5,0.5,0,0.4,0.2,0.4)`).run()
  generateRaporForRombel(db, withIds())
  assert.equal(akhirOf(db), 82)
  db.close()
})

test('tanpa tabel rapor_bobot perhitungan jatuh ke bawaan (DB lama)', () => {
  const db = buildDb()
  db.exec('DROP TABLE rapor_bobot')
  generateRaporForRombel(db, withIds())
  assert.equal(akhirOf(db), 82)
  db.close()
})

test('pickBobot memilih baris paling spesifik', () => {
  const rows = [
    { rombel_id: '', mapel_id: '', sts_harian: 0.6, sts_sts: 0.4, sts_sas: 0 },
    { rombel_id: 'r1', mapel_id: '', sts_harian: 0.5, sts_sts: 0.5, sts_sas: 0 },
    { rombel_id: '', mapel_id: 'm1', sts_harian: 0.3, sts_sts: 0.7, sts_sas: 0 },
  ]
  // (mapel+rombel) tidak ada -> aturan per-mapel menang atas per-rombel.
  assert.equal(pickBobot(rows, { rombelId: 'r1', mapelId: 'm1' }, 'sts').sts, 0.7)
  assert.equal(pickBobot(rows, { rombelId: 'r2', mapelId: 'm1' }, 'sts').sts, 0.7)
  // mapel tidak punya aturan -> pakai aturan rombel.
  assert.equal(pickBobot(rows, { rombelId: 'r1', mapelId: 'm9' }, 'sts').sts, 0.5)
  assert.equal(pickBobot(rows, { rombelId: 'r2', mapelId: 'm9' }, 'sts').sts, 0.4)
  assert.equal(pickBobot([], { rombelId: 'r1', mapelId: 'm1' }, 'sts'), null)
})

test('normalizeBobot mengabaikan nilai tidak valid', () => {
  assert.deepEqual(normalizeBobot(null, 'sts'), null)
  const bobot = normalizeBobot({ sts_harian: 'abc', sts_sts: -1, sts_sas: null }, 'sts')
  assert.deepEqual(bobot, { harian: BOBOT_DEFAULT.sts.harian, sts: BOBOT_DEFAULT.sts.sts, sas: BOBOT_DEFAULT.sts.sas })
})

test('computeNilai cocok dengan contoh RDM (Sumatif 85 / SAS 80 -> 83)', () => {
  const daily = { p: 85, k: 85, sk: 85, nilai_harian: 85, jumlah: 3 }
  // rapor_sts = 85*0.6 + 80*0.4 = 83
  assert.equal(computeNilai({ daily, sts: 80, sas: null, jenis: 'rapor_sts' }).akhir, 83)
})

test('endpoint bobot terpasang di server dengan pembatasan admin', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
  assert.match(indexSource, /app\.get\('\/api\/rapor\/bobot', authMiddleware/, 'GET bobot pakai auth')
  assert.match(indexSource, /app\.put\('\/api\/rapor\/bobot', ADMIN/, 'PUT bobot hanya admin')
  assert.match(indexSource, /app\.delete\('\/api\/rapor\/bobot', ADMIN/, 'DELETE bobot hanya admin')
  assert.match(indexSource, /CREATE TABLE IF NOT EXISTS rapor_bobot/, 'tabel rapor_bobot ada di skema')
  assert.match(indexSource, /UNIQUE\(tenant_id, rombel_id, mapel_id\)/, 'bobot unik per tenant+rombel+mapel')
})

test('UI rapor menyediakan pengaturan bobot nilai', () => {
  const raporPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'RaporPage.tsx'), 'utf8')
  assert.match(raporPage, /Bobot Nilai Rapor/, 'panel bobot ada di halaman rapor')
  assert.match(raporPage, /api\.get\('\/rapor\/bobot'/, 'UI membaca bobot efektif')
  assert.match(raporPage, /api\.put\('\/rapor\/bobot'/, 'UI menyimpan bobot')
  assert.match(raporPage, /api\.delete\('\/rapor\/bobot'/, 'UI bisa mengembalikan ke bawaan')
  assert.match(raporPage, /Seluruh mapel di kelas ini/, 'bobot bisa berlaku untuk seluruh kelas')
})
