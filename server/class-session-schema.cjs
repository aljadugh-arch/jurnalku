function tableExists(db, tableName) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName)
}

function hasScheduleSourceWithoutRegularForeignKey(db) {
  if (!tableExists(db, 'sesi_kelas_guru')) return false
  const columns = db.prepare("PRAGMA table_info('sesi_kelas_guru')").all()
  const foreignKeys = db.prepare("PRAGMA foreign_key_list('sesi_kelas_guru')").all()
  return columns.some(row => row.name === 'jadwal_source') &&
    !foreignKeys.some(row => row.from === 'jadwal_id' && row.table === 'jadwal')
}

function migrateClassSessionScheduleSource(db) {
  if (!tableExists(db, 'sesi_kelas_guru') || hasScheduleSourceWithoutRegularForeignKey(db)) return false

  const foreignKeysEnabled = Number(db.pragma('foreign_keys', { simple: true })) === 1
  db.pragma('foreign_keys = OFF')
  try {
    db.exec(`
      BEGIN;
      CREATE TABLE sesi_kelas_guru_new (
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
        jadwal_source TEXT DEFAULT 'reguler',
        FOREIGN KEY (guru_id) REFERENCES gtk(id),
        FOREIGN KEY (mapel_id) REFERENCES mapel(id),
        FOREIGN KEY (rombel_id) REFERENCES rombel(id)
      );
      INSERT INTO sesi_kelas_guru_new
        (id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,waktu_selesai,status,menit_terlambat,tenant_id,created_at,updated_at,jadwal_source)
      SELECT id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,waktu_selesai,status,menit_terlambat,tenant_id,created_at,updated_at,'reguler'
      FROM sesi_kelas_guru;
      DROP TABLE sesi_kelas_guru;
      ALTER TABLE sesi_kelas_guru_new RENAME TO sesi_kelas_guru;
      CREATE UNIQUE INDEX idx_sesi_kelas_jadwal_tanggal ON sesi_kelas_guru(tenant_id,jadwal_id,tanggal);
      CREATE INDEX idx_sesi_kelas_tenant_tanggal ON sesi_kelas_guru(tenant_id,tanggal,status);
      COMMIT;
    `)
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK')
    throw error
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`)
  }
  return true
}

module.exports = { migrateClassSessionScheduleSource }
