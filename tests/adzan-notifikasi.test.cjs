const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { setupWA, queueAdzanReminders, penerimaAdzan } = require('../server/wa-queue.cjs')
const { hitungJadwalSholat } = require('../server/jadwal-sholat.cjs')

// Kota & koordinat tetap supaya waktu sholatnya bisa dihitung ulang di tes.
const LAT = -7.2575
const LNG = 112.7521
const TZ = 7
const TANGGAL = '2026-10-06' // Selasa
const WAKTU = hitungJadwalSholat({ tanggal: TANGGAL, lat: LAT, lng: LNG, tz: TZ })

function fixture({ aktif = 1, target = 'gtk', menitAwal = 0, dipilih = 'subuh,dzuhur,ashar,maghrib,isya', hariLibur = '[]', kalenderLibur = false } = {}) {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (id TEXT, tenant_id TEXT, nama_lembaga TEXT, hari_libur TEXT,
      kota_sholat TEXT, lat_sholat REAL, lng_sholat REAL, tz_sholat INTEGER);
    CREATE TABLE kalender_kbm (tenant_id TEXT, tanggal TEXT, jenis TEXT);
    CREATE TABLE notif_settings (tenant_id TEXT PRIMARY KEY, notif_adzan INTEGER, adzan_waktu TEXT,
      adzan_menit_awal INTEGER, adzan_target TEXT, template_adzan TEXT, adzan_suara INTEGER, adzan_suara_url TEXT);
    CREATE TABLE gtk (id TEXT, tenant_id TEXT, nama TEXT, no_hp TEXT, jenis_kelamin TEXT, status TEXT);
    CREATE TABLE users (id TEXT, tenant_id TEXT, gtk_id TEXT, role TEXT);
  `)
  setupWA(db)
  db.prepare('INSERT INTO settings VALUES (?,?,?,?,?,?,?,?)')
    .run('main_t1', 't1', 'MTs Uji', hariLibur, 'Surabaya', LAT, LNG, TZ)
  if (kalenderLibur) db.prepare('INSERT INTO kalender_kbm VALUES (?,?,?)').run('t1', TANGGAL, 'libur')
  db.prepare('INSERT INTO notif_settings VALUES (?,?,?,?,?,?,?,?)')
    .run('t1', aktif, dipilih, menitAwal, target, '', 1, '')
  // Dua guru ber-nomor, satu tanpa nomor.
  db.prepare('INSERT INTO gtk VALUES (?,?,?,?,?,?)').run('g1', 't1', 'Budi Santoso', '081234567890', 'L', 'aktif')
  db.prepare('INSERT INTO gtk VALUES (?,?,?,?,?,?)').run('g2', 't1', 'Siti Aminah', '081298765432', 'P', 'aktif')
  db.prepare('INSERT INTO gtk VALUES (?,?,?,?,?,?)').run('g3', 't1', 'Tanpa Nomor', '', 'L', 'aktif')
  db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('u1', 't1', 'g1', 'admin')
  db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('u2', 't1', 'g2', 'guru')
  return db
}

const jumlahAntre = db => db.prepare('SELECT COUNT(*) AS c FROM wa_queue').get().c

test('adzan: nonaktif tidak mengantre apa pun', () => {
  const db = fixture({ aktif: 0 })
  const r = queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.dzuhur })
  assert.equal(r.queued, 0)
  assert.equal(r.reason, 'disabled')
  assert.equal(jumlahAntre(db), 0)
})

test('adzan: tepat waktu mengantre ke semua GTK ber-nomor HP', () => {
  const db = fixture()
  const r = queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.maghrib })
  assert.equal(r.queued, 2)          // g1 + g2
  assert.equal(r.missing, 1)         // g3 tanpa nomor
  assert.equal(jumlahAntre(db), 2)
  const pesan = db.prepare('SELECT message FROM wa_queue').get().message
  assert.match(pesan, /Maghrib/)
  assert.match(pesan, /Surabaya/)
  assert.match(pesan, /MTs Uji/)
  assert.match(pesan, new RegExp(WAKTU.maghrib.replace(':', ':')))
})

test('adzan: idempoten — panggilan kedua tidak menggandakan', () => {
  const db = fixture()
  assert.equal(queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.ashar }).queued, 2)
  assert.equal(queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.ashar }).queued, 0)
  assert.equal(jumlahAntre(db), 2)
})

test('adzan: di luar jendela waktu tidak mengantre', () => {
  const db = fixture()
  const lewat = s => { const [h, m] = WAKTU.subuh.split(':').map(Number); const t = h * 60 + m + s; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
  // Lebih dari 5 menit sebelum dan sesudah Subuh.
  assert.equal(queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: lewat(-30) }).queued, 0)
  assert.equal(queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: lewat(30) }).queued, 0)
  assert.equal(jumlahAntre(db), 0)
})

test('adzan: TETAP terkirim pada hari libur (beda dari notifikasi lain)', () => {
  // Waktu sholat tidak mengenal hari libur sekolah.
  const hariLibur = new Date(`${TANGGAL}T12:00:00Z`).getUTCDay()
  const namaHari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][hariLibur]
  const db = fixture({ hariLibur: JSON.stringify([namaHari]), kalenderLibur: true })
  const r = queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.isya })
  assert.equal(r.queued, 2)
  assert.equal(jumlahAntre(db), 2)
})

test('adzan: hanya waktu yang dipilih yang diproses', () => {
  const db = fixture({ dipilih: 'subuh,maghrib' })
  assert.equal(queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.dzuhur }).queued, 0)
  assert.equal(queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.maghrib }).queued, 2)
})

test('adzan: menit_awal menggeser waktu kirim', () => {
  const db = fixture({ menitAwal: 10 })
  // Sepuluh menit sebelum Maghrib: kirim. Tepat saat Maghrib: sudah di luar jendela.
  const [h, m] = WAKTU.maghrib.split(':').map(Number)
  const t = h * 60 + m - 10
  const sebelum = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  assert.equal(queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: sebelum }).queued, 2)
})

test('adzan: target admin hanya menjangkau GTK yang punya akun staf', () => {
  const db = fixture({ target: 'admin' })
  const penerima = penerimaAdzan(db, 't1', { adzan_target: 'admin' })
  assert.deepEqual(penerima.map(x => x.id), ['g1'])
  assert.equal(queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.dzuhur }).queued, 1)
})

test('adzan: kirim-uji memaksa satu waktu dan mengabaikan jam', () => {
  const db = fixture({ aktif: 0 })
  const r = queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: '00:01', force: true, paksaWaktu: 'subuh' })
  assert.equal(r.queued, 2)
  const pesan = db.prepare('SELECT message FROM wa_queue').get().message
  assert.match(pesan, /Subuh/)
})

test('adzan: koordinat tidak valid tidak membuat server error', () => {
  const db = fixture()
  db.prepare('UPDATE settings SET lat_sholat=999 WHERE tenant_id=?').run('t1')
  const r = queueAdzanReminders(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.dzuhur })
  assert.equal(r.queued, 0)
  assert.equal(jumlahAntre(db), 0)
})
