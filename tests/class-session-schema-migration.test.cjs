const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { migrateClassSessionScheduleSource } = require('../server/class-session-schema.cjs')

test('migrasi sesi kelas menerima jadwal ujian tanpa merusak sesi reguler lama', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE jadwal (id TEXT PRIMARY KEY);
    CREATE TABLE gtk (id TEXT PRIMARY KEY);
    CREATE TABLE mapel (id TEXT PRIMARY KEY);
    CREATE TABLE rombel (id TEXT PRIMARY KEY);
    INSERT INTO jadwal VALUES ('regular-1');
    INSERT INTO gtk VALUES ('g1');
    INSERT INTO mapel VALUES ('m1');
    INSERT INTO rombel VALUES ('r1');
    CREATE TABLE sesi_kelas_guru (
      id TEXT PRIMARY KEY,
      jadwal_id TEXT NOT NULL,
      guru_id TEXT NOT NULL,
      mapel_id TEXT NOT NULL,
      rombel_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      waktu_masuk TEXT NOT NULL,
      waktu_selesai TEXT,
      status TEXT DEFAULT 'aktif',
      menit_terlambat INTEGER DEFAULT 0,
      tenant_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (jadwal_id) REFERENCES jadwal(id),
      FOREIGN KEY (guru_id) REFERENCES gtk(id),
      FOREIGN KEY (mapel_id) REFERENCES mapel(id),
      FOREIGN KEY (rombel_id) REFERENCES rombel(id)
    );
    CREATE UNIQUE INDEX idx_sesi_kelas_jadwal_tanggal ON sesi_kelas_guru(tenant_id,jadwal_id,tanggal);
    INSERT INTO sesi_kelas_guru
      (id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,status,tenant_id)
      VALUES ('s1','regular-1','g1','m1','r1','2026-09-21','07:00','selesai','t1');
  `)

  migrateClassSessionScheduleSource(db)

  const columns = db.prepare("PRAGMA table_info('sesi_kelas_guru')").all().map(row => row.name)
  assert.ok(columns.includes('jadwal_source'))
  const scheduleForeignKeys = db.prepare("PRAGMA foreign_key_list('sesi_kelas_guru')").all().filter(row => row.from === 'jadwal_id')
  assert.equal(scheduleForeignKeys.length, 0)
  assert.deepEqual(db.prepare('SELECT id,jadwal_id,jadwal_source,status FROM sesi_kelas_guru').all(), [
    { id: 's1', jadwal_id: 'regular-1', jadwal_source: 'reguler', status: 'selesai' },
  ])
  assert.doesNotThrow(() => db.prepare(`INSERT INTO sesi_kelas_guru
    (id,jadwal_id,jadwal_source,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,status,tenant_id)
    VALUES ('s2','exam-1','ujian','g1','m1','r1','2026-09-22','07:30','aktif','t1')`).run())
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
  db.close()
})

test('migrasi idempotent pada schema baru', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE sesi_kelas_guru (
    id TEXT PRIMARY KEY,jadwal_id TEXT NOT NULL,jadwal_source TEXT DEFAULT 'reguler',
    guru_id TEXT NOT NULL,mapel_id TEXT NOT NULL,rombel_id TEXT NOT NULL,tanggal TEXT NOT NULL,
    waktu_masuk TEXT NOT NULL,waktu_selesai TEXT,status TEXT DEFAULT 'aktif',
    menit_terlambat INTEGER DEFAULT 0,tenant_id TEXT NOT NULL,created_at TEXT,updated_at TEXT
  )`)
  migrateClassSessionScheduleSource(db)
  migrateClassSessionScheduleSource(db)
  assert.equal(db.prepare("PRAGMA table_info('sesi_kelas_guru')").all().filter(row => row.name === 'jadwal_source').length, 1)
  db.close()
})

test('migrasi tetap berjalan pada schema lama tanpa kolom menit_terlambat', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE gtk (id TEXT PRIMARY KEY);
    CREATE TABLE mapel (id TEXT PRIMARY KEY);
    CREATE TABLE rombel (id TEXT PRIMARY KEY);
    INSERT INTO gtk VALUES ('g1');
    INSERT INTO mapel VALUES ('m1');
    INSERT INTO rombel VALUES ('r1');
    CREATE TABLE sesi_kelas_guru (
      id TEXT PRIMARY KEY,
      jadwal_id TEXT NOT NULL,
      guru_id TEXT NOT NULL,
      mapel_id TEXT NOT NULL,
      rombel_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      waktu_masuk TEXT NOT NULL,
      waktu_selesai TEXT,
      status TEXT DEFAULT 'aktif',
      tenant_id TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE UNIQUE INDEX idx_sesi_kelas_jadwal_tanggal ON sesi_kelas_guru(tenant_id,jadwal_id,tanggal);
    CREATE INDEX idx_sesi_kelas_tenant_tanggal ON sesi_kelas_guru(tenant_id,tanggal,status);
    INSERT INTO sesi_kelas_guru
      (id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,status,tenant_id)
      VALUES ('lama-1','j1','g1','m1','r1','2026-09-01','07:00','selesai','t1');
  `)

  // Sebelum perbaikan ini migrasi gagal permanen: "no such column: menit_terlambat".
  assert.equal(migrateClassSessionScheduleSource(db), true)

  const kolom = db.prepare("PRAGMA table_info('sesi_kelas_guru')").all().map(row => row.name)
  assert.ok(kolom.includes('menit_terlambat'))
  assert.ok(kolom.includes('jadwal_source'))
  assert.deepEqual(db.prepare('SELECT id,jadwal_source,menit_terlambat,status FROM sesi_kelas_guru').all(), [
    { id: 'lama-1', jadwal_source: 'reguler', menit_terlambat: 0, status: 'selesai' },
  ])
  const namaIndex = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sesi_kelas_guru'").all().map(r => r.name)
  assert.ok(namaIndex.includes('idx_sesi_kelas_jadwal_tanggal'))
  assert.ok(namaIndex.includes('idx_sesi_kelas_tenant_tanggal'))
  // Index unik tetap ditegakkan setelah migrasi.
  assert.throws(() => db.prepare(`INSERT INTO sesi_kelas_guru
    (id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,status,tenant_id)
    VALUES ('duplikat','j1','g1','m1','r1','2026-09-01','08:00','aktif','t1')`).run())
  // Panggilan kedua tidak mengubah apa pun lagi.
  assert.equal(migrateClassSessionScheduleSource(db), false)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sesi_kelas_guru').get().c, 1)
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
  db.close()
})

test('migrasi tidak gagal bila tabel sementara sesi_kelas_guru_new tertinggal', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE sesi_kelas_guru (
      id TEXT PRIMARY KEY, jadwal_id TEXT NOT NULL, guru_id TEXT NOT NULL, mapel_id TEXT NOT NULL,
      rombel_id TEXT NOT NULL, tanggal TEXT NOT NULL, waktu_masuk TEXT NOT NULL, waktu_selesai TEXT,
      status TEXT DEFAULT 'aktif', tenant_id TEXT NOT NULL
    );
    CREATE TABLE sesi_kelas_guru_new (id TEXT PRIMARY KEY);
    INSERT INTO sesi_kelas_guru (id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,tenant_id)
      VALUES ('x1','j1','g1','m1','r1','2026-09-02','07:15','t1');
  `)
  assert.equal(migrateClassSessionScheduleSource(db), true)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='sesi_kelas_guru_new'").get().c, 0)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sesi_kelas_guru').get().c, 1)
  db.close()
})

test('migrasi menolak skema yang kehilangan kolom wajib tanpa merusak data', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE sesi_kelas_guru (
      id TEXT PRIMARY KEY, jadwal_id TEXT NOT NULL, guru_id TEXT NOT NULL, mapel_id TEXT NOT NULL,
      rombel_id TEXT NOT NULL, tanggal TEXT NOT NULL, waktu_masuk TEXT NOT NULL
    );
    INSERT INTO sesi_kelas_guru (id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk)
      VALUES ('w1','j1','g1','m1','r1','2026-09-03','07:00');
  `)
  assert.throws(() => migrateClassSessionScheduleSource(db), /kolom wajib hilang: tenant_id/)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sesi_kelas_guru').get().c, 1)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='sesi_kelas_guru_new'").get().c, 0)
  db.close()
})

test('database separuh-migrasi (ada jadwal_source, minus menit_terlambat) diperbaiki', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE sesi_kelas_guru (
      id TEXT PRIMARY KEY, jadwal_id TEXT NOT NULL, jadwal_source TEXT DEFAULT 'reguler',
      guru_id TEXT NOT NULL, mapel_id TEXT NOT NULL, rombel_id TEXT NOT NULL, tanggal TEXT NOT NULL,
      waktu_masuk TEXT NOT NULL, waktu_selesai TEXT, status TEXT DEFAULT 'aktif',
      tenant_id TEXT NOT NULL, created_at TEXT, updated_at TEXT
    );
    INSERT INTO sesi_kelas_guru (id,jadwal_id,jadwal_source,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,status,tenant_id)
      VALUES ('s1','j1','ujian','g1','m1','r1','2026-09-10','07:00','selesai','t1');
  `)
  // Guard lama menganggap ini "sudah migrasi" dan tidak pernah memperbaikinya.
  assert.equal(migrateClassSessionScheduleSource(db), true)
  const kolom = db.prepare("PRAGMA table_info('sesi_kelas_guru')").all().map(row => row.name)
  assert.ok(kolom.includes('menit_terlambat'), 'kolom yang kurang harus ditambahkan')
  assert.deepEqual(db.prepare('SELECT id,jadwal_source,menit_terlambat FROM sesi_kelas_guru').all(), [
    { id: 's1', jadwal_source: 'ujian', menit_terlambat: 0 },
  ], 'nilai lama (termasuk jadwal_source ujian) harus ikut tersalin')
  assert.equal(migrateClassSessionScheduleSource(db), false)
  db.close()
})

test('perbaikan index saja tidak menulis ulang tabel', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE sesi_kelas_guru (
      id TEXT PRIMARY KEY, jadwal_id TEXT NOT NULL, jadwal_source TEXT DEFAULT 'reguler',
      guru_id TEXT NOT NULL, mapel_id TEXT NOT NULL, rombel_id TEXT NOT NULL, tanggal TEXT NOT NULL,
      waktu_masuk TEXT NOT NULL, waktu_selesai TEXT, status TEXT DEFAULT 'aktif',
      menit_terlambat INTEGER DEFAULT 0, tenant_id TEXT NOT NULL, created_at TEXT, updated_at TEXT
    );
    INSERT INTO sesi_kelas_guru (id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,tenant_id)
      VALUES ('s1','j1','g1','m1','r1','2026-09-11','07:00','t1');
  `)
  const rootpageSebelum = db.prepare("SELECT rootpage FROM sqlite_master WHERE type='table' AND name='sesi_kelas_guru'").get().rootpage
  assert.equal(migrateClassSessionScheduleSource(db), true)
  assert.equal(
    db.prepare("SELECT rootpage FROM sqlite_master WHERE type='table' AND name='sesi_kelas_guru'").get().rootpage,
    rootpageSebelum,
    'rootpage berubah berarti tabel ditulis ulang padahal hanya index yang perlu diperbaiki'
  )
  db.close()
})

test('index bernama sama tapi definisinya salah diperbaiki, bukan dibiarkan', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE sesi_kelas_guru (
      id TEXT PRIMARY KEY, jadwal_id TEXT NOT NULL, jadwal_source TEXT DEFAULT 'reguler',
      guru_id TEXT NOT NULL, mapel_id TEXT NOT NULL, rombel_id TEXT NOT NULL, tanggal TEXT NOT NULL,
      waktu_masuk TEXT NOT NULL, waktu_selesai TEXT, status TEXT DEFAULT 'aktif',
      menit_terlambat INTEGER DEFAULT 0, tenant_id TEXT NOT NULL, created_at TEXT, updated_at TEXT
    );
    CREATE INDEX idx_sesi_kelas_jadwal_tanggal ON sesi_kelas_guru(tanggal);
  `)
  assert.equal(migrateClassSessionScheduleSource(db), true)
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_sesi_kelas_jadwal_tanggal'").get().sql
  assert.match(sql, /^CREATE UNIQUE INDEX/)
  assert.match(sql, /tenant_id,jadwal_id,tanggal/)
  db.close()
})
