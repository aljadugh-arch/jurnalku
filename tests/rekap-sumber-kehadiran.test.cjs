'use strict'
// Kontrak OPSI B: rekap memisahkan kehadiran yang punya BUKTI SCAN dari yang
// hanya DINYATAKAN guru (input manual / tombol "Semua Hadir").
//
// Aturan yang dikunci:
//   1. Angka `hadir` TIDAK berubah. Ini murni keterbukaan asal data.
//   2. hadir_scan + hadir_input harus SAMA DENGAN hadir (tidak boleh ada
//      kehadiran yang tak terhitung ke salah satu).
//   3. Scan menang: kalau satu tanggal punya baris scan, dianggap terbukti scan
//      walau ada baris massal lain di tanggal yang sama.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const rec = require(path.join(AKAR, 'server', 'attendance-periodic-recap.cjs'))

test('rekap membaca kolom metode untuk memisahkan asal kehadiran', () => {
  const s = baca('server/attendance-periodic-recap.cjs')
  // Query memakai kolomMetode (defensif terhadap DB lama tanpa kolom metode),
  // yang bernilai ',a.metode' bila kolom tersedia.
  assert.ok(/kolomMetode = adaMetode \? ',a\.metode'/.test(s),
    'query harus mengambil kolom metode bila tersedia')
  assert.ok(/tableHasColumn\(db, 'absensi_siswa', 'metode'\)/.test(s),
    'harus defensif: DB lama mungkin belum punya kolom metode')
  assert.ok(/METODE_SCAN_REKAP/.test(s))
  assert.ok(/hadir_scan/.test(s) && /hadir_input/.test(s))
})

test('metode scan yang diakui: qr, rfid, device', () => {
  const s = baca('server/attendance-periodic-recap.cjs')
  assert.ok(/new Set\(\['qr', 'rfid', 'device'\]\)/.test(s))
})

test('hadir_scan + hadir_input = hadir (tidak ada yang hilang)', () => {
  // Uji logika murni: bangun data palsu lewat fungsi yang sama.
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE siswa (id TEXT, nama TEXT, nis TEXT, nisn TEXT, rombel_id TEXT, status TEXT, tenant_id TEXT);
    CREATE TABLE rombel (id TEXT, nama TEXT, tenant_id TEXT);
    CREATE TABLE absensi_siswa (id TEXT, siswa_id TEXT, rombel_id TEXT, tanggal TEXT, status TEXT,
      status_pulang TEXT, metode TEXT, waktu_masuk TEXT, waktu_pulang TEXT, tenant_id TEXT);
    CREATE TABLE jadwal (id TEXT, gtk_id TEXT, rombel_id TEXT, mapel_id TEXT, hari TEXT,
      jam_mulai TEXT, jam_selesai TEXT, jenis_kegiatan TEXT, tenant_id TEXT);
    CREATE TABLE gtk (id TEXT, nama TEXT, nip TEXT, jabatan TEXT, tenant_id TEXT);
    CREATE TABLE mapel (id TEXT, nama TEXT, tenant_id TEXT);
    CREATE TABLE absensi_guru (id TEXT, gtk_id TEXT, tanggal TEXT, status TEXT, waktu_masuk TEXT, waktu_pulang TEXT, tenant_id TEXT);
    CREATE TABLE sesi_kelas_guru (id TEXT, guru_id TEXT, rombel_id TEXT, tanggal TEXT, waktu_masuk TEXT, status TEXT, tenant_id TEXT);
    CREATE TABLE kalender_kbm (id TEXT, tanggal TEXT, jenis TEXT, tenant_id TEXT);
  `)
  const T = 't1'
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('r1', 'VII-A', T)
  db.prepare('INSERT INTO siswa VALUES (?,?,?,?,?,?,?)').run('s1', 'Siswa Satu', '001', '', 'r1', 'aktif', T)

  // Tiga hari: dua lewat scan, satu lewat input massal.
  db.prepare("INSERT INTO absensi_siswa VALUES ('a1','s1','r1','2026-10-01','hadir','','qr',  '07:00','',?)").run(T)
  db.prepare("INSERT INTO absensi_siswa VALUES ('a2','s1','r1','2026-10-02','hadir','','rfid','07:05','',?)").run(T)
  db.prepare("INSERT INTO absensi_siswa VALUES ('a3','s1','r1','2026-10-03','hadir','','batch-range','','',?)").run(T)

  const out = rec.getPeriodicAttendanceRecap(db, T, 'siswa', {
    mode: 'rentang', from: '2026-10-01', to: '2026-10-03', label: 'Uji',
  })
  const row = out.detail[0]
  assert.strictEqual(row.hadir, 3, 'total hadir harus 3')
  assert.strictEqual(row.hadir_scan, 2, 'dua hari lewat scan')
  assert.strictEqual(row.hadir_input, 1, 'satu hari lewat input massal')
  assert.strictEqual(row.hadir_scan + row.hadir_input, row.hadir,
    'jumlah scan + input harus sama dengan hadir — tidak boleh ada yang hilang')
  assert.strictEqual(out.summary.hadir_scan + out.summary.hadir_input, out.summary.hadir)
  db.close()
})

test('scan menang bila satu tanggal punya baris scan dan massal', () => {
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE siswa (id TEXT, nama TEXT, nis TEXT, nisn TEXT, rombel_id TEXT, status TEXT, tenant_id TEXT);
    CREATE TABLE rombel (id TEXT, nama TEXT, tenant_id TEXT);
    CREATE TABLE absensi_siswa (id TEXT, siswa_id TEXT, rombel_id TEXT, tanggal TEXT, status TEXT,
      status_pulang TEXT, metode TEXT, waktu_masuk TEXT, waktu_pulang TEXT, tenant_id TEXT);
    CREATE TABLE jadwal (id TEXT, gtk_id TEXT, rombel_id TEXT, mapel_id TEXT, hari TEXT,
      jam_mulai TEXT, jam_selesai TEXT, jenis_kegiatan TEXT, tenant_id TEXT);
    CREATE TABLE gtk (id TEXT, nama TEXT, nip TEXT, jabatan TEXT, tenant_id TEXT);
    CREATE TABLE mapel (id TEXT, nama TEXT, tenant_id TEXT);
    CREATE TABLE absensi_guru (id TEXT, gtk_id TEXT, tanggal TEXT, status TEXT, waktu_masuk TEXT, waktu_pulang TEXT, tenant_id TEXT);
    CREATE TABLE sesi_kelas_guru (id TEXT, guru_id TEXT, rombel_id TEXT, tanggal TEXT, waktu_masuk TEXT, status TEXT, tenant_id TEXT);
    CREATE TABLE kalender_kbm (id TEXT, tanggal TEXT, jenis TEXT, tenant_id TEXT);
  `)
  const T = 't1'
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('r1', 'VII-A', T)
  db.prepare('INSERT INTO siswa VALUES (?,?,?,?,?,?,?)').run('s1', 'Siswa Satu', '001', '', 'r1', 'aktif', T)
  // Tanggal sama: satu baris massal, satu baris scan (data lama yang dobel).
  db.prepare("INSERT INTO absensi_siswa VALUES ('a1','s1','r1','2026-10-01','hadir','','batch-range','','',?)").run(T)
  db.prepare("INSERT INTO absensi_siswa VALUES ('a2','s1','r1','2026-10-01','hadir','','qr','07:00','',?)").run(T)

  const out = rec.getPeriodicAttendanceRecap(db, T, 'siswa', {
    mode: 'rentang', from: '2026-10-01', to: '2026-10-01', label: 'Uji',
  })
  const row = out.detail[0]
  assert.strictEqual(row.hadir, 1, 'satu hari tetap dihitung sekali')
  assert.strictEqual(row.hadir_scan, 1, 'kehadiran itu dianggap punya bukti scan')
  assert.strictEqual(row.hadir_input, 0)
  db.close()
})

test('UI menampilkan kolom Scan dan Input', () => {
  const s = baca('src/pages/admin/RekapAbsensiPage.tsx')
  assert.ok(/hadir_scan/.test(s) && /hadir_input/.test(s))
  assert.ok(/>Scan</.test(s) && />Input</.test(s))
})
