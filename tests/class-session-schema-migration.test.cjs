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
