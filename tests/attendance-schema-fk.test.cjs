const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { migrateAbsensiKegiatanForeignKey } = require('../server/attendance-schema.cjs')

// Skema absensi_kegiatan seperti PRODUKSI: kegiatan_id ber-FK ke kegiatan_khusus.
function fixture() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE kegiatan_khusus (id TEXT PRIMARY KEY, nama TEXT, jenis TEXT, tenant_id TEXT);
    CREATE TABLE absensi_kegiatan (
      id TEXT PRIMARY KEY, siswa_id TEXT NOT NULL, kegiatan_id TEXT NOT NULL,
      tanggal TEXT NOT NULL, status TEXT NOT NULL, keterangan TEXT, tenant_id TEXT DEFAULT 'default',
      FOREIGN KEY (siswa_id) REFERENCES siswa(id), FOREIGN KEY (kegiatan_id) REFERENCES kegiatan_khusus(id)
    );
    CREATE INDEX idx_absensi_kegiatan_tenant ON absensi_kegiatan(tenant_id);
    CREATE TABLE jamaah_sesi (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
  `)
  db.exec(`INSERT INTO siswa VALUES ('s1','t1');`)
  db.exec(`INSERT INTO kegiatan_khusus VALUES ('k1','Upacara','insidental','t1');`)
  db.exec(`INSERT INTO absensi_kegiatan VALUES ('ak1','s1','k1','2026-09-01','hadir','','t1');`)
  return db
}

function tableSql(db, name) {
  return String(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name).sql)
}

test('migrasi melepas FK kegiatan_khusus tetapi mempertahankan FK siswa + data', () => {
  const db = fixture()
  assert.match(tableSql(db, 'absensi_kegiatan'), /REFERENCES\s+kegiatan_khusus/i)

  const changed = migrateAbsensiKegiatanForeignKey(db)
  assert.equal(changed, true)

  const sql = tableSql(db, 'absensi_kegiatan')
  assert.doesNotMatch(sql, /REFERENCES\s+kegiatan_khusus/i)
  assert.match(sql, /REFERENCES\s+siswa/i)
  // Data lama tidak hilang, index tenant dibangun ulang.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM absensi_kegiatan').get().c, 1)
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_absensi_kegiatan_tenant'").get() !== undefined, true)

  // Idempoten: jalan kedua tidak mengubah apa pun.
  assert.equal(migrateAbsensiKegiatanForeignKey(db), false)
  db.close()
})

test('setelah migrasi, absensi jamaah (kegiatan_id = id sesi jamaah) dapat disimpan', () => {
  const db = fixture()
  // Sebelum migrasi, insert jamaah ditolak FK.
  db.exec(`INSERT INTO jamaah_sesi VALUES ('j1','Dzuhur','t1');`)
  assert.throws(
    () => db.prepare('INSERT INTO absensi_kegiatan (id,siswa_id,kegiatan_id,tanggal,status,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?)').run('x','s1','j1','2026-09-01','hadir','','t1'),
    /FOREIGN KEY/i,
  )

  migrateAbsensiKegiatanForeignKey(db)

  // Sesudah migrasi, id sesi jamaah diterima; kegiatan_khusus tetap valid; siswa asing tetap ditolak.
  db.prepare('INSERT INTO absensi_kegiatan (id,siswa_id,kegiatan_id,tanggal,status,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?)').run('aj1','s1','j1','2026-09-01','hadir','','t1')
  db.prepare('INSERT INTO absensi_kegiatan (id,siswa_id,kegiatan_id,tanggal,status,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?)').run('ak2','s1','k1','2026-09-02','hadir','','t1')
  assert.equal(db.prepare('SELECT COUNT(*) c FROM absensi_kegiatan').get().c, 3)
  assert.throws(
    () => db.prepare('INSERT INTO absensi_kegiatan (id,siswa_id,kegiatan_id,tanggal,status,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?)').run('bad','tidak-ada','j1','2026-09-01','hadir','','t1'),
    /FOREIGN KEY/i,
  )
  db.close()
})
