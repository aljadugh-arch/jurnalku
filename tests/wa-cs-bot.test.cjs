'use strict'
// Test bot CS WhatsApp: identifikasi pengirim + jawaban per peran, dan pastikan
// data tidak bocor antar-tenant maupun antar-pengguna.
const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { handleIncoming, resolveSender, phoneVariants } = require('../server/wa-cs-bot.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (tenant_id TEXT PRIMARY KEY, nama_lembaga TEXT, alamat TEXT, telepon TEXT, email TEXT, npsn TEXT, nsm TEXT, hari_libur TEXT);
    CREATE TABLE gtk (id TEXT, tenant_id TEXT, nama TEXT, no_hp TEXT, status TEXT, jenis_kelamin TEXT);
    CREATE TABLE users (id TEXT, tenant_id TEXT, nama TEXT, role TEXT, gtk_id TEXT, siswa_id TEXT, nis TEXT, nisn TEXT);
    CREATE TABLE siswa (id TEXT, tenant_id TEXT, nama TEXT, nis TEXT, no_hp TEXT, rombel_id TEXT, status TEXT);
    CREATE TABLE rombel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE mapel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE jadwal (id TEXT, tenant_id TEXT, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT, hari TEXT, jam_mulai TEXT, jam_selesai TEXT, jenis_kegiatan TEXT DEFAULT 'mapel');
    CREATE TABLE jenis_tagihan (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE tagihan (id TEXT, siswa_id TEXT, jenis_tagihan_id TEXT, bulan TEXT, tahun TEXT, nominal REAL, status TEXT, tenant_id TEXT);
    CREATE TABLE tabungan (id TEXT, siswa_id TEXT, tanggal TEXT, tipe TEXT, nominal REAL, saldo_akhir REAL, tenant_id TEXT, created_at TEXT);
    CREATE TABLE absensi_siswa (id TEXT, siswa_id TEXT, tanggal TEXT, status TEXT, tenant_id TEXT);
    CREATE TABLE rapor (id TEXT, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT, semester TEXT, nilai_akhir INTEGER, predikat TEXT, tenant_id TEXT);
    INSERT INTO settings VALUES ('t1','MTs Uji','Jl. Uji 1','081111','uji@uji.id','123','456','[]');
    INSERT INTO rombel VALUES ('r1','t1','VII A');
    INSERT INTO mapel VALUES ('m1','t1','Matematika');
    INSERT INTO gtk VALUES ('g1','t1','Budi Guru','081234567890','aktif','L');
    INSERT INTO users VALUES ('u1','t1','Budi','guru','g1',NULL,NULL,NULL);
    INSERT INTO siswa VALUES ('s1','t1','Ani','101','089876543210','r1','aktif');
    INSERT INTO jenis_tagihan VALUES ('jt1','t1','SPP');
    INSERT INTO tagihan VALUES ('tg1','s1','jt1','10','2026',150000,'belum_bayar','t1');
    INSERT INTO tabungan VALUES ('tb1','s1','2026-09-01','masuk',100000,250000,'t1','2026-09-01 10:00:00');
    INSERT INTO absensi_siswa VALUES ('a1','s1','2026-09-30','hadir','t1');
    INSERT INTO rapor VALUES ('rp1','s1','m1','2026/2027','ganjil',85,'B','t1');
    INSERT INTO jadwal VALUES ('j1','t1','g1','m1','r1','Senin','08:00','08:40','mapel');
  `)
  return db
}

test('phoneVariants menormalisasi berbagai format nomor', () => {
  assert.deepEqual(phoneVariants('081234567890'), ['6281234567890', '081234567890'])
  assert.deepEqual(phoneVariants('+62 812-3456-7890'), ['6281234567890', '081234567890'])
  assert.deepEqual(phoneVariants('6281234567890'), ['6281234567890', '081234567890'])
  assert.deepEqual(phoneVariants(''), [])
})

test('resolveSender mengenali guru dan wali murid dari nomor WA', () => {
  const db = fixture()
  const guru = resolveSender(db, 't1', '081234567890')
  assert.equal(guru.jenis, 'gtk')
  assert.equal(guru.gtkId, 'g1')
  const wali = resolveSender(db, 't1', '089876543210')
  assert.equal(wali.jenis, 'wali')
  assert.deepEqual(wali.siswaIds, ['s1'])
  assert.equal(resolveSender(db, 't1', '080000000000'), null)
  db.close()
})

test('nomor asing hanya menerima info lembaga, tanpa data pribadi', () => {
  const db = fixture()
  const reply = handleIncoming(db, { tenantId: 't1', phone: '080000000000', text: 'halo' })
  assert.match(reply, /belum terdaftar/)
  assert.doesNotMatch(reply, /Ani/) // nama siswa tidak bocor
  db.close()
})

test('wali murid bisa tanya tagihan dan tabungan anak', () => {
  const db = fixture()
  const tagihan = handleIncoming(db, { tenantId: 't1', phone: '089876543210', text: 'tagihan' })
  assert.match(tagihan, /SPP/)
  assert.match(tagihan, /150.000/)
  const tabungan = handleIncoming(db, { tenantId: 't1', phone: '089876543210', text: 'tabungan' })
  assert.match(tabungan, /250.000/)
  db.close()
})

test('guru bisa tanya jadwal mengajarnya', () => {
  const db = fixture()
  const reply = handleIncoming(db, { tenantId: 't1', phone: '081234567890', text: 'jadwal', date: '2026-08-24' }) // Senin
  assert.match(reply, /Matematika/)
  assert.match(reply, /VII A/)
  db.close()
})

test('data tenant lain tidak bocor', () => {
  const db = fixture()
  // Siswa dari tenant lain dengan nomor sama — harus tetap 0 data dari t1.
  db.exec(`INSERT INTO siswa VALUES ('s2','t2','Rahasia','999','089876543210','r1','aktif')`)
  const reply = handleIncoming(db, { tenantId: 't1', phone: '089876543210', text: 'tagihan' })
  assert.match(reply, /Ani/) // hanya anak di t1
  assert.doesNotMatch(reply, /Rahasia/) // siswa t2 tidak bocor
  db.close()
})

test('guru bisa lihat nilai siswa di kelas/mapel yang diampunya', () => {
  const db = fixture()
  // Guru g1 mengampu Matematika di r1 (VII A); siswa s1 ada nilainya.
  db.exec(`CREATE TABLE pengajar (id TEXT, tenant_id TEXT, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT)`)
  db.prepare('INSERT INTO pengajar VALUES (?,?,?,?,?)').run('p1', 't1', 'g1', 'm1', 'r1')
  const reply = handleIncoming(db, { tenantId: 't1', phone: '081234567890', text: 'nilai VII A Matematika', date: '2026-08-24' })
  assert.match(reply, /Matematika/)
  assert.match(reply, /Ani/)
  assert.match(reply, /85/)
  db.close()
})

test('guru lihat nilai: hanya kelas/mapel yang diampu, tidak yang lain', () => {
  const db = fixture()
  db.exec(`CREATE TABLE pengajar (id TEXT, tenant_id TEXT, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT)`)
  // g1 mengampu m1 di r1 saja. Ada mapel lain m2 yang TIDAK diampu.
  db.exec(`INSERT INTO mapel VALUES ('m2','t1','Bahasa Inggris')`)
  db.prepare('INSERT INTO pengajar VALUES (?,?,?,?,?)').run('p1', 't1', 'g1', 'm1', 'r1')
  db.prepare('INSERT INTO rapor VALUES (?,?,?,?,?,?,?,?)').run('rp2', 's1', 'm2', '2026/2027', 'ganjil', 90, 'A', 't1')
  const reply = handleIncoming(db, { tenantId: 't1', phone: '081234567890', text: 'nilai', date: '2026-08-24' })
  assert.match(reply, /Matematika/)
  assert.doesNotMatch(reply, /Bahasa Inggris/) // mapel yang tidak diampu tidak muncul
  db.close()
})

test('guru lihat rekap absensi kelas yang diampunya', () => {
  const db = fixture()
  db.exec(`CREATE TABLE pengajar (id TEXT, tenant_id TEXT, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT)`)
  db.prepare('INSERT INTO pengajar VALUES (?,?,?,?,?)').run('p1', 't1', 'g1', 'm1', 'r1')
  // Tambah satu siswa lagi + absensi hari ini.
  db.exec(`INSERT INTO siswa VALUES ('s3','t1','Budi','103','089000000001','r1','aktif')`)
  db.exec(`INSERT INTO absensi_siswa VALUES ('a2','s1','2026-08-24','hadir','t1'),('a3','s3','2026-08-24','sakit','t1')`)
  const reply = handleIncoming(db, { tenantId: 't1', phone: '081234567890', text: 'absensi VII A', date: '2026-08-24' })
  assert.match(reply, /VII A/)
  assert.match(reply, /Hadir 1/)
  assert.match(reply, /Sakit 1/)
  db.close()
})
