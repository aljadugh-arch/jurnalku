// Migrasi uniqueness rapor agar selalu tenant-scoped.
//
// SQLite tidak mengubah definisi index yang sudah ada saat CREATE INDEX
// IF NOT EXISTS dipanggil, jadi index lama yang tidak tenant-scoped harus
// diganti. Sebelumnya penggantian ini dilakukan dengan DROP + CREATE tanpa
// syarat pada SETIAP boot: index dibangun ulang walau definisinya sudah benar,
// dan DDL-nya sendiri tidak punya IF NOT EXISTS sehingga urutan pernyataan
// apa pun yang berubah akan gagal dengan "index idx_rapor_unique already exists".
// Sekarang definisi yang ada dibandingkan dulu; hanya dibangun ulang bila beda.
const DDL_RAPOR_UNIQUE =
  'CREATE UNIQUE INDEX idx_rapor_unique ON rapor(tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis)'

const normalisasi = (sql) => String(sql || '').replace(/["'`[\]\s]/g, '').toLowerCase()

function migrateRaporUniqueIndex(db) {
  const ada = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_rapor_unique'").get()
  if (ada && normalisasi(ada.sql) === normalisasi(DDL_RAPOR_UNIQUE)) return false // sudah benar, jangan rebuild

  const duplikat = db.prepare(`SELECT tenant_id,siswa_id,mapel_id,tahun_ajaran,semester,jenis,COUNT(*) AS total
    FROM rapor GROUP BY tenant_id,siswa_id,mapel_id,tahun_ajaran,semester,jenis HAVING COUNT(*)>1 LIMIT 1`).get()
  if (duplikat) throw new Error('duplikat rapor harus diselesaikan sebelum migrasi index')

  db.exec('DROP INDEX IF EXISTS idx_rapor_unique')
  db.exec(DDL_RAPOR_UNIQUE)
  return true
}

module.exports = { migrateRaporUniqueIndex, DDL_RAPOR_UNIQUE }
