const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { getAttendanceOverview, studentAttendance, statusKey } = require('../server/attendance-summary.cjs')

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE absensi_siswa (id TEXT, tenant_id TEXT, siswa_id TEXT, tanggal TEXT, status TEXT, status_pulang TEXT, waktu_masuk TEXT, waktu_pulang TEXT, waktu_absen TEXT, metode TEXT, keterangan TEXT, keterangan_pulang TEXT);
    CREATE TABLE absensi_mapel (id TEXT, tenant_id TEXT, siswa_id TEXT, jadwal_id TEXT, mapel_id TEXT, guru_id TEXT, tanggal TEXT, status TEXT, keterangan TEXT);
    CREATE TABLE mapel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE jadwal (id TEXT, tenant_id TEXT, jam_mulai TEXT, jam_selesai TEXT);
    CREATE TABLE gtk (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE absensi_kegiatan (id TEXT, tenant_id TEXT, siswa_id TEXT, kegiatan_id TEXT, tanggal TEXT, status TEXT, keterangan TEXT);
    CREATE TABLE jamaah_sesi (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE kegiatan_khusus (id TEXT, tenant_id TEXT, nama TEXT, jenis TEXT);
    CREATE TABLE absensi_ekskul (id TEXT, tenant_id TEXT, siswa_id TEXT, ekskul_id TEXT, tanggal TEXT, status TEXT, keterangan TEXT);
    CREATE TABLE ekskul (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE tahfidz_kelompok (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE tahfidz_pertemuan (id TEXT, tenant_id TEXT, kelompok_id TEXT, tanggal TEXT);
    CREATE TABLE tahfidz_absensi (tenant_id TEXT, pertemuan_id TEXT, siswa_id TEXT, status TEXT, catatan TEXT);
  `)
  return db
}

function addFixtures(db) {
  const insert = (sql, rows) => { const statement = db.prepare(sql); for (const row of rows) statement.run(...row) }
  insert('INSERT INTO absensi_siswa VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
    ['qr-a', 'tenant-a', 'student-a', '2026-08-31', 'present', 'hadir', '07:00', '14:00', null, 'qr', '', ''],
    ['qr-b', 'tenant-b', 'student-a', '2026-08-31', 'alpha', 'alpha', '07:01', '14:01', null, 'qr', '', ''],
  ])
  insert('INSERT INTO mapel VALUES (?,?,?)', [['mapel', 'tenant-a', 'Matematika A'], ['mapel', 'tenant-b', 'Matematika B']])
  insert('INSERT INTO jadwal VALUES (?,?,?,?)', [['jadwal', 'tenant-a', '08:00', '09:00'], ['jadwal', 'tenant-b', '10:00', '11:00']])
  insert('INSERT INTO gtk VALUES (?,?,?)', [['guru', 'tenant-a', 'Guru A'], ['guru', 'tenant-b', 'Guru B']])
  insert('INSERT INTO absensi_mapel VALUES (?,?,?,?,?,?,?,?,?)', [
    ['mapel-a', 'tenant-a', 'student-a', 'jadwal', 'mapel', 'guru', '2026-08-31', 'ijin', ''],
    ['mapel-b', 'tenant-b', 'student-a', 'jadwal', 'mapel', 'guru', '2026-08-31', 'hadir', ''],
  ])
  insert('INSERT INTO jamaah_sesi VALUES (?,?,?)', [['jamaah', 'tenant-a', 'Dzuhur A'], ['jamaah', 'tenant-b', 'Dzuhur B']])
  insert('INSERT INTO kegiatan_khusus VALUES (?,?,?,?)', [
    ['koku', 'tenant-a', 'Proyek A', 'KOKURIKULER'], ['lain', 'tenant-a', 'Upacara A', 'insidental'],
    ['koku', 'tenant-b', 'Proyek B', 'kokurikuler'], ['lain', 'tenant-b', 'Upacara B', 'insidental'],
  ])
  insert('INSERT INTO absensi_kegiatan VALUES (?,?,?,?,?,?,?)', [
    ['jamaah-a', 'tenant-a', 'student-a', 'jamaah', '2026-08-31', 'sakit', ''],
    ['koku-a', 'tenant-a', 'student-a', 'koku', '2026-08-31', 'alpa', ''],
    ['lain-a', 'tenant-a', 'student-a', 'lain', '2026-08-31', 'HADIR', ''],
    ['jamaah-b', 'tenant-b', 'student-a', 'jamaah', '2026-08-31', 'hadir', ''],
  ])
  insert('INSERT INTO ekskul VALUES (?,?,?)', [['ekskul', 'tenant-a', 'Pramuka A'], ['ekskul', 'tenant-b', 'Pramuka B']])
  insert('INSERT INTO absensi_ekskul VALUES (?,?,?,?,?,?,?)', [
    ['ekskul-a', 'tenant-a', 'student-a', 'ekskul', '2026-08-31', 'present', ''],
    ['ekskul-b', 'tenant-b', 'student-a', 'ekskul', '2026-08-31', 'alpha', ''],
  ])
  insert('INSERT INTO tahfidz_kelompok VALUES (?,?,?)', [['kelompok', 'tenant-a', 'Tahfidz A'], ['kelompok', 'tenant-b', 'Tahfidz B']])
  insert('INSERT INTO tahfidz_pertemuan VALUES (?,?,?,?)', [['pertemuan', 'tenant-a', 'kelompok', '2026-08-31'], ['pertemuan', 'tenant-b', 'kelompok', '2026-08-31']])
  insert('INSERT INTO tahfidz_absensi VALUES (?,?,?,?,?)', [
    ['tenant-a', 'pertemuan', 'student-a', 'izin', ''], ['tenant-b', 'pertemuan', 'student-a', 'hadir', ''],
  ])
}

test('status normalization supports aliases and unknown values', () => {
  assert.deepEqual(['present', 'sick', 'ijin', 'alpa', 'custom'].map(statusKey), ['hadir', 'sakit', 'izin', 'alpha', 'lain'])
})

test('student attendance is canonical, tenant-scoped, and joined names never leak', () => {
  const db = makeDb(); addFixtures(db)
  const result = studentAttendance(db, 'tenant-a', 'student-a')
  assert.deepEqual(Object.keys(result.rekap_kehadiran), ['qr_masuk_pulang', 'mapel', 'jamaah', 'kokurikuler', 'ekskul', 'kegiatan_lain'])
  assert.deepEqual(result.rekap_kehadiran.qr_masuk_pulang, { total: 2, hadir: 2, sakit: 0, izin: 0, alpha: 0, lain: 0 })
  assert.equal(result.rekap_kehadiran.mapel.izin, 1)
  assert.equal(result.rekap_kehadiran.jamaah.sakit, 1)
  assert.equal(result.rekap_kehadiran.kokurikuler.alpha, 1)
  assert.deepEqual(result.rekap_kehadiran.ekskul, { total: 2, hadir: 1, sakit: 0, izin: 1, alpha: 0, lain: 0 })
  assert.equal(result.rekap_kehadiran.kegiatan_lain.hadir, 1)
  assert.equal(result.mapel_detail[0].mapel_nama, 'Matematika A')
  assert.equal(result.mapel_detail[0].guru_nama, 'Guru A')
  assert.equal(result.jamaah_detail[0].sesi_nama, 'Dzuhur A')
  assert.equal(result.ekskul_detail.some(row => row.ekskul_nama === 'Pramuka B' || row.ekskul_nama === 'Tahfidz B'), false)
  db.close()
})

test('admin overview counts QR masuk and pulang as separate events and isolates tenant', () => {
  const db = makeDb(); addFixtures(db)
  const result = getAttendanceOverview(db, 'tenant-a', '2026-08-31')
  assert.deepEqual(result.qr_masuk_pulang, { total: 2, hadir: 2, sakit: 0, izin: 0, alpha: 0, lain: 0 })
  assert.equal(result.mapel.izin, 1)
  assert.equal(result.jamaah.sakit, 1)
  assert.equal(result.kokurikuler.alpha, 1)
  assert.equal(result.kegiatan_lain.hadir, 1)
  assert.deepEqual(result.ekskul, { total: 2, hadir: 1, sakit: 0, izin: 1, alpha: 0, lain: 0 })
  db.close()
})

test('optional mapel and tahfidz tables return empty categories instead of throwing', () => {
  const db = makeDb()
  db.exec('DROP TABLE absensi_mapel; DROP TABLE tahfidz_absensi;')
  const student = studentAttendance(db, 'tenant-a', 'student-a')
  const overview = getAttendanceOverview(db, 'tenant-a', '2026-08-31')
  assert.equal(student.rekap_kehadiran.mapel.total, 0)
  assert.equal(student.rekap_kehadiran.ekskul.total, 0)
  assert.equal(overview.mapel.total, 0)
  assert.equal(overview.ekskul.total, 0)
  db.close()
})
