const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { getAttendanceOverview, ekskulDailySummary } = require('../server/attendance-summary.cjs')
const { getCategoryRecap } = require('../server/attendance-recap.cjs')

// Absensi ekskul dapat tercatat di DUA jalur: `absensi_ekskul` (ekskul bernama TAHFIDZ)
// dan `tahfidz_absensi` (modul tahfidz berbasis pertemuan). Keduanya menuju kategori
// "Ekstrakurikuler" — tanpa dedupe satu kejadian dihitung dua kali.
function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, nis TEXT, nisn TEXT, rombel_id TEXT, status TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE ekskul (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE absensi_ekskul (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT, ekskul_id TEXT, tanggal TEXT, status TEXT, keterangan TEXT);
    CREATE TABLE absensi_siswa (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT, tanggal TEXT, status TEXT, status_pulang TEXT);
    CREATE TABLE absensi_kegiatan (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT, kegiatan_id TEXT, tanggal TEXT, status TEXT);
    CREATE TABLE jamaah_sesi (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE kegiatan_khusus (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, jenis TEXT);
    CREATE TABLE tahfidz_kelompok (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE tahfidz_pertemuan (id TEXT PRIMARY KEY, tenant_id TEXT, kelompok_id TEXT, tanggal TEXT, materi TEXT);
    CREATE TABLE tahfidz_absensi (pertemuan_id TEXT, siswa_id TEXT, status TEXT, catatan TEXT, tenant_id TEXT, PRIMARY KEY(pertemuan_id,siswa_id,tenant_id));

    INSERT INTO rombel VALUES ('r1','t1','VII A');
    INSERT INTO siswa VALUES
      ('s1','t1','Aisyah','1001','9001','r1','aktif'),
      ('s2','t1','Bilal','1002','9002','r1','aktif');
    INSERT INTO ekskul VALUES ('e1','t1','Pramuka'),('e2','t1','TAHFIDZ');
    -- s1 ikut Pramuka DAN TAHFIDZ pada hari yang sama (dua ekskul berbeda = 2 kejadian sah).
    INSERT INTO absensi_ekskul VALUES
      ('a1','t1','s1','e2','2026-09-01','hadir',''),
      ('a2','t1','s1','e1','2026-09-01','hadir',''),
      ('a3','t1','s2','e1','2026-09-01','izin','');
    INSERT INTO tahfidz_kelompok VALUES ('k1','t1','TAHFIDZ');
    INSERT INTO tahfidz_pertemuan VALUES ('p1','t1','k1','2026-09-01','Juz 30');
    -- p1 mencatat s1 hadir tahfidz — kejadian yang SAMA dengan a1 di atas.
    INSERT INTO tahfidz_absensi VALUES ('p1','s1','hadir','', 't1');
  `)
  return db
}

test('ringkasan ekskul harian tidak menghitung kejadian tahfidz dua kali', () => {
  const db = fixture()
  // Harus 2 (s1/Pramuka + s1/TAHFIDZ), bukan 3; s2 hanya Pramuka = 1, total 3 baris
  // absensi_ekskul + 1 baris tahfidz yang duplikat.
  const sum = ekskulDailySummary(db, 't1', '2026-09-01')
  assert.equal(sum.total, 3)
  assert.equal(sum.hadir, 2)
  assert.equal(sum.izin, 1)
})

test('overview harian memakai angka ekskul yang sudah di-dedupe', () => {
  const db = fixture()
  const overview = getAttendanceOverview(db, 't1', '2026-09-01')
  assert.equal(overview.ekskul.total, 3)
  assert.equal(overview.ekskul.hadir, 2)
})

test('getCategoryRecap ekskul memakai ringkasan gabungan yang di-dedupe', () => {
  const db = fixture()
  const recap = getCategoryRecap(db, 't1', 'ekskul', '2026-09-01', '2026-09-30')
  assert.equal(recap.summary.total, 3)
  assert.equal(recap.summary.hadir, 2)
  assert.equal(recap.summary.izin, 1)
  // Detail tetap per (siswa, kegiatan) supaya baris Pramuka & TAHFIDZ terlihat terpisah.
  const s1Rows = recap.detail.filter(r => r.id === 's1' && r.total > 0)
  assert.equal(s1Rows.length, 2)
})
