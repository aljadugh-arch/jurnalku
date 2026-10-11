// Migrasi skema absensi.
//
// `absensi_kegiatan.kegiatan_id` bersifat POLIMORFIK: menunjuk ke `kegiatan_khusus.id`
// (kokurikuler/insidental) ATAU ke `jamaah_sesi.id` (absensi jamaah). FK tunggal ke
// `kegiatan_khusus` membuat simpan absensi jamaah SELALU gagal saat `foreign_keys=ON`
// (SQLite menolak id sesi jamaah karena tidak ada di kegiatan_khusus).
//
// SQLite tidak bisa menjatuhkan satu FK saja, jadi tabel dibangun ulang tanpa FK
// `kegiatan_id` — FK `siswa_id` dan seluruh baris dipertahankan. Dijalankan di dalam
// transaksi + foreign_keys OFF agar baris lama yang mungkin yatim tidak memblokir.

function tableSql(db, table) {
  try {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)
    return row ? String(row.sql || '') : ''
  } catch {
    return ''
  }
}

function columnDefs(db, table) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  return cols.map(c => {
    const parts = [`${c.name} ${c.type || 'TEXT'}`]
    if (c.pk) parts.push('PRIMARY KEY')
    if (c.notnull && !c.pk) parts.push('NOT NULL')
    if (c.dflt_value !== null && c.dflt_value !== undefined) {
      const raw = String(c.dflt_value)
      // PRAGMA mengembalikan ekspresi apa adanya; SQLite menolak DEFAULT datetime('now')
      // tanpa tanda kurung.
      const expr = raw.includes('(') && !(raw.startsWith('(') && raw.endsWith(')')) ? `(${raw})` : raw
      parts.push(`DEFAULT ${expr}`)
    }
    return parts.join(' ')
  })
}

function migrateAbsensiKegiatanForeignKey(db) {
  const sql = tableSql(db, 'absensi_kegiatan')
  if (!sql || !/REFERENCES\s+kegiatan_khusus/i.test(sql)) return false
  const defs = columnDefs(db, 'absensi_kegiatan')
  if (!defs.length) return false
  const cols = db.prepare('PRAGMA table_info(absensi_kegiatan)').all().map(c => c.name)
  const colList = cols.join(', ')
  db.transaction(() => db.exec(`
    DROP TABLE IF EXISTS absensi_kegiatan_new;
    CREATE TABLE absensi_kegiatan_new (${[...defs, 'FOREIGN KEY (siswa_id) REFERENCES siswa(id)'].join(', ')});
    INSERT INTO absensi_kegiatan_new (${colList}) SELECT ${colList} FROM absensi_kegiatan;
    DROP TABLE absensi_kegiatan;
    ALTER TABLE absensi_kegiatan_new RENAME TO absensi_kegiatan;
    CREATE INDEX IF NOT EXISTS idx_absensi_kegiatan_tenant ON absensi_kegiatan(tenant_id);
  `))()
  return true
}

module.exports = { migrateAbsensiKegiatanForeignKey }
