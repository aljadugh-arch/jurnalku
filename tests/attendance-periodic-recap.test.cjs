const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { buildRekapRange, getPeriodicAttendanceRecap, deduplicateAttendance } = require('../server/attendance-periodic-recap.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE siswa (id TEXT PRIMARY KEY,nama TEXT,nis TEXT,nisn TEXT,rombel_id TEXT,status TEXT,tenant_id TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY,nama TEXT,tenant_id TEXT);
    CREATE TABLE gtk (id TEXT PRIMARY KEY,nama TEXT,nip TEXT,jabatan TEXT,status_kepegawaian TEXT,tenant_id TEXT);
    CREATE TABLE absensi_siswa (id TEXT PRIMARY KEY,siswa_id TEXT,rombel_id TEXT,tanggal TEXT,status TEXT,status_pulang TEXT,waktu_masuk TEXT,waktu_pulang TEXT,tenant_id TEXT);
    CREATE TABLE absensi_guru (id TEXT PRIMARY KEY,gtk_id TEXT,tanggal TEXT,status TEXT,waktu_masuk TEXT,waktu_pulang TEXT,tenant_id TEXT);
    CREATE TABLE jadwal (id TEXT PRIMARY KEY,gtk_id TEXT,rombel_id TEXT,mapel_id TEXT,hari TEXT,jam_mulai TEXT,jam_selesai TEXT,jenis_kegiatan TEXT,tenant_id TEXT);
    CREATE TABLE mapel (id TEXT PRIMARY KEY,nama TEXT,tenant_id TEXT);
  `)
  db.prepare("INSERT INTO rombel VALUES ('r1','1A','t1')").run()
  db.prepare("INSERT INTO siswa VALUES ('s1','Siswa Satu','001','0001','r1','aktif','t1')").run()
  db.prepare("INSERT INTO siswa VALUES ('s2','Siswa Kosong','002','0002','r1','aktif','t1')").run()
  db.prepare("INSERT INTO gtk VALUES ('g1','Guru Satu','NIP1','Guru','Tetap','t1')").run()
  db.prepare("INSERT INTO mapel VALUES ('m1','Matematika','t1')").run()
  db.prepare("INSERT INTO jadwal VALUES ('j1','g1','r1','m1','selasa','07:00','08:00','mapel','t1')").run()
  db.prepare("INSERT INTO absensi_siswa VALUES ('a1','s1','r1','2026-09-01','hadir','','07:00',NULL,'t1')").run()
  db.prepare("INSERT INTO absensi_siswa VALUES ('a2','s1','r1','2026-09-08','izin','','07:00',NULL,'t1')").run()
  db.prepare("INSERT INTO absensi_guru VALUES ('g-a1','g1','2026-09-01','hadir','06:50','12:00','t1')").run()
  return db
}

test('range harian, mingguan, bulanan, semester tervalidasi dan hierarkis', () => {
  assert.deepEqual(buildRekapRange({ mode: 'daily', tanggal: '2026-09-01' }), { mode: 'daily', from: '2026-09-01', to: '2026-09-01', label: 'Harian 2026-09-01' })
  assert.equal(buildRekapRange({ mode: 'weekly', mulai: '2026-09-01' }).to, '2026-09-07')
  assert.equal(buildRekapRange({ mode: 'monthly', bulan: '2026-09' }).to, '2026-09-30')
  assert.deepEqual(buildRekapRange({ mode: 'semester', tahun_ajaran: '2026/2027', semester: 'ganjil' }), { mode: 'semester', from: '2026-07-01', to: '2026-12-31', label: 'Semester Ganjil 2026/2027' })
})

test('rekap siswa hanya berasal dari siswa/absensi_siswa dan fallback tanggal kosong', () => {
  const db = fixture()
  const range = buildRekapRange({ mode: 'daily', tanggal: '2026-09-01' })
  const result = getPeriodicAttendanceRecap(db, 't1', 'siswa', range)
  assert.equal(result.entity_type, 'siswa')
  assert.equal(result.detail.length, 2)
  assert.equal(result.detail.some(row => row.nip), false)
  const empty = result.detail.find(row => row.id === 's2')
  assert.equal(empty.total, 0)
  assert.equal(empty.per_tanggal['2026-09-01'], '')
  assert.equal(result.detail.find(row => row.id === 's1').per_tanggal['2026-09-01'], 'H')
  assert.equal(result.schedule.length, 1)
  db.close()
})

test('rekap GTK hanya berasal dari gtk/absensi_guru dan setiap GTK membawa mapel serta jadwalnya sendiri', () => {
  const db = fixture()
  db.prepare("INSERT INTO gtk VALUES ('g2','GTK Kosong','NIP2','TU','Tetap','t1')").run()
  db.prepare("INSERT INTO mapel VALUES ('m2','Bahasa Indonesia','t1')").run()
  db.prepare("INSERT INTO jadwal VALUES ('j2','g2','r1','m2','rabu','08:00','09:00','mapel','t1')").run()
  const range = buildRekapRange({ mode: 'weekly', mulai: '2026-09-01' })
  const result = getPeriodicAttendanceRecap(db, 't1', 'gtk', range)
  assert.equal(result.entity_type, 'gtk')
  assert.equal(result.detail.length, 2)
  assert.equal(result.detail.some(row => row.nis), false)
  const guru = result.detail.find(row => row.id === 'g1')
  const gtkKosong = result.detail.find(row => row.id === 'g2')
  assert.deepEqual(guru.mapel_nama, ['Matematika'])
  assert.equal(guru.jadwal_mengajar.length, 1)
  assert.equal(guru.jadwal_mengajar[0].guru_nama, 'Guru Satu')
  assert.equal(guru.jadwal_mengajar[0].tanggal, '2026-09-01')
  assert.deepEqual(gtkKosong.mapel_nama, ['Bahasa Indonesia'])
  assert.equal(gtkKosong.jadwal_mengajar.length, 1)
  assert.equal(gtkKosong.jadwal_mengajar[0].tanggal, '2026-09-02')
  assert.equal(gtkKosong.per_tanggal['2026-09-02'], '')
  assert.equal(result.schedule.every(item => result.detail.some(row => row.id === item.gtk_id)), true)
  db.close()
})

test('UI rekap GTK memakai kolom khusus GTK, mapel, dan jadwal mengajar', () => {
  const fs = require('node:fs')
  const page = fs.readFileSync(require('node:path').join(__dirname, '../src/pages/admin/RekapAbsensiPage.tsx'), 'utf8')
  assert.match(page, /Nama GTK/)
  assert.match(page, /Mata Pelajaran/)
  assert.match(page, /Jadwal Mengajar/)
  assert.match(page, /jadwal_mengajar/)
})

test('mingguan mengakumulasi harian, bulanan mengelompokkan minggu, semester mengelompokkan bulan', () => {
  const db = fixture()
  const weekly = getPeriodicAttendanceRecap(db, 't1', 'siswa', buildRekapRange({ mode: 'weekly', mulai: '2026-09-01' }))
  assert.equal(weekly.breakdown.granularity, 'daily')
  assert.equal(weekly.breakdown.items.reduce((n, x) => n + x.summary.total, 0), weekly.summary.total)
  const monthly = getPeriodicAttendanceRecap(db, 't1', 'siswa', buildRekapRange({ mode: 'monthly', bulan: '2026-09' }))
  assert.equal(monthly.breakdown.granularity, 'weekly')
  assert.equal(monthly.breakdown.items.reduce((n, x) => n + x.summary.total, 0), monthly.summary.total)
  const semester = getPeriodicAttendanceRecap(db, 't1', 'siswa', buildRekapRange({ mode: 'semester', tahun_ajaran: '2026/2027', semester: 'ganjil' }))
  assert.equal(semester.breakdown.granularity, 'monthly')
  assert.equal(semester.breakdown.items.reduce((n, x) => n + x.summary.total, 0), semester.summary.total)
  db.close()
})

test('duplikat siswa dan GTK dibersihkan lalu dilindungi indeks unik', () => {
  const db = fixture()
  db.prepare('INSERT INTO absensi_siswa VALUES (?,?,?,?,?,?,?,?,?)').run('a-dup','s1','r1','2026-09-01','sakit','','',null,'t1')
  db.prepare('INSERT INTO absensi_guru VALUES (?,?,?,?,?,?,?)').run('g-dup','g1','2026-09-01','hadir',null,null,'t1')
  const cleaned = deduplicateAttendance(db)
  assert.equal(cleaned.absensi_siswa, 1)
  assert.equal(cleaned.absensi_guru, 1)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM absensi_siswa WHERE tenant_id='t1' AND siswa_id='s1' AND tanggal='2026-09-01'").get().c, 1)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM absensi_guru WHERE tenant_id='t1' AND gtk_id='g1' AND tanggal='2026-09-01'").get().c, 1)
  assert.throws(() => db.prepare('INSERT INTO absensi_guru VALUES (?,?,?,?,?,?,?)').run('g-again','g1','2026-09-01','hadir',null,null,'t1'))
  db.close()
})

test('UI absensi mapel tidak pernah menganggap siswa kosong sebagai hadir', () => {
  const fs = require('node:fs')
  const page = fs.readFileSync(require('node:path').join(__dirname, '../src/pages/guru/GuruAbsensiSiswaPage.tsx'), 'utf8')
  assert.doesNotMatch(page, /absensi\[s\.id\]\s*\|\|\s*['"]hadir['"]/) 
  assert.match(page, /Object\.entries\(absensi\)/)
})
