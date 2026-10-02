'use strict'
// Verifikasi perbaikan hapus kegiatan-khusus: dengan foreign_keys ON, hapus harus
// membuang baris anak (absensi_kegiatan) dulu sebelum induk (kegiatan_khusus).
const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')

test('hapus kegiatan khusus: anak absensi dibuang dulu, induk ikut terhapus (FK ON)', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE kegiatan_khusus (
      id TEXT PRIMARY KEY, nama TEXT NOT NULL, jenis TEXT DEFAULT 'kokurikuler',
      tanggal TEXT, deskripsi TEXT, tenant_id TEXT DEFAULT 'default'
    );
    CREATE TABLE absensi_kegiatan (
      id TEXT PRIMARY KEY, siswa_id TEXT NOT NULL, kegiatan_id TEXT NOT NULL,
      tanggal TEXT NOT NULL, status TEXT NOT NULL, tenant_id TEXT DEFAULT 'default',
      FOREIGN KEY (kegiatan_id) REFERENCES kegiatan_khusus(id)
    );
    INSERT INTO kegiatan_khusus (id, nama, jenis, tanggal, tenant_id) VALUES ('k1','Shalat Jamaah','insidental','2026-08-03','t1');
    INSERT INTO absensi_kegiatan (id, siswa_id, kegiatan_id, tanggal, status, tenant_id) VALUES
      ('a1','s1','k1','2026-08-03','hadir','t1'),
      ('a2','s2','k1','2026-08-03','izin','t1');
  `)

  // Urutan lama (induk dulu) HARUS gagal karena FK ON.
  assert.throws(() => db.prepare('DELETE FROM kegiatan_khusus WHERE id=?').run('k1'), /FOREIGN KEY/)

  // Urutan baru (anak dulu) HARUS sukses.
  db.prepare('DELETE FROM absensi_kegiatan WHERE kegiatan_id=? AND tenant_id=?').run('k1', 't1')
  db.prepare('DELETE FROM kegiatan_khusus WHERE id=? AND tenant_id=?').run('k1', 't1')
  assert.equal(db.prepare('SELECT COUNT(*) c FROM kegiatan_khusus').get().c, 0)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM absensi_kegiatan').get().c, 0)
  db.close()
})
