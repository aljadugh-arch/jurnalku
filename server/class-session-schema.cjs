// Migrasi tabel sesi_kelas_guru (jadwal ujian masuk ke sumber jadwal).
//
// Tiga cacat pada versi sebelumnya, semuanya sudah diperbaiki di sini:
//  1. INSERT ... SELECT selalu menyebut seluruh kolom, sehingga database lama
//     yang belum punya kolom baru (mis. `menit_terlambat`) SELALU gagal dengan
//     "no such column" — dan kegagalan itu ditelan pemanggil, jadi migrasi tak
//     pernah selesai dan index tenant-scoped tak pernah terpasang.
//  2. Guard "sudah migrasi" hanya melihat ada/tidaknya kolom jadwal_source,
//     jadi database separuh-migrasi (punya jadwal_source, minus kolom lain)
//     tidak pernah diperbaiki.
//  3. DDL index tanpa IF NOT EXISTS → "index ... already exists" begitu urutan
//     pernyataan berubah; sebaliknya IF NOT EXISTS buta terhadap index bernama
//     sama dengan definisi berbeda, yang lalu diam-diam dibiarkan.
const KOLOM_TUJUAN = [
  { nama: 'id', wajib: true },
  { nama: 'jadwal_id', wajib: true },
  { nama: 'guru_id', wajib: true },
  { nama: 'mapel_id', wajib: true },
  { nama: 'rombel_id', wajib: true },
  { nama: 'tanggal', wajib: true },
  { nama: 'waktu_masuk', wajib: true },
  { nama: 'waktu_selesai', default: null },
  { nama: 'status', default: 'aktif' },
  { nama: 'menit_terlambat', default: 0 },
  { nama: 'tenant_id', wajib: true },
  { nama: 'created_at', raw: "datetime('now')" },
  { nama: 'updated_at', default: null },
  { nama: 'jadwal_source', default: 'reguler' },
]

const INDEX_TUJUAN = [
  {
    nama: 'idx_sesi_kelas_jadwal_tanggal',
    ddl: 'CREATE UNIQUE INDEX idx_sesi_kelas_jadwal_tanggal ON sesi_kelas_guru(tenant_id,jadwal_id,tanggal)',
  },
  {
    nama: 'idx_sesi_kelas_tenant_tanggal',
    ddl: 'CREATE INDEX idx_sesi_kelas_tenant_tanggal ON sesi_kelas_guru(tenant_id,tanggal,status)',
  },
]

const normalisasi = (sql) => String(sql || '').replace(/["'`[\]\s]/g, '').toLowerCase()

function tableExists(db, tableName) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName)
}

// Bentuk tabel tujuan: seluruh kolom ada DAN tidak ada lagi foreign key
// jadwal_id → jadwal (itulah inti migrasi jadwal ujian).
function tabelSudahTujuan(db) {
  if (!tableExists(db, 'sesi_kelas_guru')) return false
  const kolom = new Set(db.prepare("PRAGMA table_info('sesi_kelas_guru')").all().map(row => row.name))
  if (!KOLOM_TUJUAN.every(k => kolom.has(k.nama))) return false
  const fkLama = db.prepare("PRAGMA foreign_key_list('sesi_kelas_guru')").all()
    .some(row => row.from === 'jadwal_id' && row.table === 'jadwal')
  return !fkLama
}

// Index dirapikan terpisah dari penulisan ulang tabel: index yang hilang atau
// definisinya berbeda cukup di-drop/recreate, tanpa menyentuh baris data.
function perbaikiIndex(db) {
  let berubah = false
  const ada = new Map(db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='sesi_kelas_guru'")
    .all().map(row => [row.name, row.sql]))
  for (const t of INDEX_TUJUAN) {
    const sekarang = ada.get(t.nama)
    if (sekarang && normalisasi(sekarang) === normalisasi(t.ddl)) continue
    if (sekarang) db.exec('DROP INDEX IF EXISTS ' + t.nama)
    db.exec(t.ddl)
    berubah = true
  }
  return berubah
}

// Daftar kolom INSERT dan ekspresi SELECT yang aman untuk skema lama: kolom
// yang tidak ada diganti literal default supaya migrasi tetap berjalan dan
// baris lama tidak hilang.
function rencanaSalinKolom(kolomAsal) {
  const ada = new Set(kolomAsal)
  const kurang = KOLOM_TUJUAN.filter(k => k.wajib && !ada.has(k.nama)).map(k => k.nama)
  if (kurang.length) throw new Error('kolom wajib hilang: ' + kurang.join(', '))
  const dipakai = KOLOM_TUJUAN.filter(k => ada.has(k.nama) || k.default !== undefined || k.raw !== undefined)
  return {
    kolom: dipakai.map(k => k.nama).join(','),
    ekspresi: dipakai.map(k => (ada.has(k.nama) ? k.nama : (k.raw !== undefined ? k.raw : lit(k.default)))).join(','),
  }
}

function lit(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  return "'" + String(v).replace(/'/g, "''") + "'"
}

function tulisUlangTabel(db) {
  const kolomAsal = db.prepare("PRAGMA table_info('sesi_kelas_guru')").all().map(row => row.name)
  const { kolom, ekspresi } = rencanaSalinKolom(kolomAsal)

  const foreignKeysEnabled = Number(db.pragma('foreign_keys', { simple: true })) === 1
  db.pragma('foreign_keys = OFF')
  try {
    db.exec(`
      BEGIN;
      -- Sisa percobaan migrasi sebelumnya tidak boleh menggagalkan CREATE TABLE.
      DROP TABLE IF EXISTS sesi_kelas_guru_new;
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
        (${kolom})
      SELECT ${ekspresi}
      FROM sesi_kelas_guru;
      DROP TABLE sesi_kelas_guru;
      ALTER TABLE sesi_kelas_guru_new RENAME TO sesi_kelas_guru;
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

function migrateClassSessionScheduleSource(db) {
  if (!tableExists(db, 'sesi_kelas_guru')) return false
  const tulisUlang = tabelSudahTujuan(db) ? false : tulisUlangTabel(db)
  const indexDiperbaiki = perbaikiIndex(db)
  return tulisUlang || indexDiperbaiki
}

module.exports = {
  migrateClassSessionScheduleSource,
  rencanaSalinKolom,
  tabelSudahTujuan,
  perbaikiIndex,
  KOLOM_TUJUAN,
  INDEX_TUJUAN,
}
