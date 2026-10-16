// Absensi manual bisa DIEDIT — uji perilaku overwrite.
//
// Akar masalah yang dikeluhkan: baris absensi yang sudah ada tidak bisa diubah karena
// writeDailyAttendanceSession memakai first-writer-wins (skip). Perbaikan: input manual
// memakai overwrite=true, sementara scan QR/RFID TETAP first-writer-wins supaya scan
// tidak menimpa 'sakit' yang sudah diinput manual.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Database = require('better-sqlite3')
const { writeDailyAttendanceSession } = require('../server/attendance-rules.cjs')

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE absensi_siswa (
    id TEXT PRIMARY KEY, siswa_id TEXT NOT NULL, rombel_id TEXT, tanggal TEXT NOT NULL,
    status TEXT NOT NULL, metode TEXT DEFAULT 'manual', keterangan TEXT,
    waktu_absen TEXT, waktu_masuk TEXT, waktu_pulang TEXT,
    status_pulang TEXT DEFAULT '', keterangan_pulang TEXT DEFAULT '',
    tenant_id TEXT DEFAULT 'default', UNIQUE(tenant_id,siswa_id,tanggal))`)
  return db
}

const base = {
  tenantId: 't1', siswaId: 's1', rombelId: 'r1', tanggal: '2026-09-11',
  status: 'sakit', waktu: '07:01', metode: 'manual', keterangan: 'demam',
}

test('overwrite: manual bisa mengubah status hadir -> sakit pada baris yang sama', () => {
  const db = makeDb()
  const awal = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a1', status: 'hadir', metode: 'manual' })
  assert.equal(awal.already, false)

  const ubah = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a2', status: 'sakit', metode: 'manual', overwrite: true })
  assert.equal(ubah.already, false, 'edit manual harus tersimpan, bukan dilewati')
  assert.equal(ubah.status, 'sakit')

  const row = db.prepare('SELECT * FROM absensi_siswa').get()
  assert.equal(row.status, 'sakit')
  assert.equal(db.prepare('SELECT count(*) n FROM absensi_siswa').get().n, 1, 'tetap satu baris, tidak menambah')
})

test('overwrite: nilai sama tidak membuat duplikat atau notifikasi ganda (already=true)', () => {
  const db = makeDb()
  writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a1', status: 'hadir' })
  const sama = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a2', status: 'hadir', overwrite: true })
  assert.equal(sama.already, true)
  assert.equal(db.prepare('SELECT count(*) n FROM absensi_siswa').get().n, 1)
})

test('tanpa overwrite, scan QR tetap tidak menimpa status manual (first-writer-wins)', () => {
  const db = makeDb()
  writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a1', status: 'sakit', metode: 'manual' })
  const qr = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a2', status: 'hadir', metode: 'qr' })
  assert.equal(qr.already, true)
  assert.equal(qr.status, 'sakit')
})

test('overwrite pada sesi pulang tidak merusak status masuk yang sudah ada', () => {
  const db = makeDb()
  writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a1', status: 'hadir', waktu: '07:00' })
  writeDailyAttendanceSession(db, { ...base, jenis: 'pulang', id: 'a2', status: 'izin', waktu: '12:00' })
  const ubahPulang = writeDailyAttendanceSession(db, { ...base, jenis: 'pulang', id: 'a3', status: 'sakit', waktu: '12:10', overwrite: true })
  assert.equal(ubahPulang.already, false)
  const row = db.prepare('SELECT * FROM absensi_siswa').get()
  assert.equal(row.status, 'hadir', 'masuk tidak tersentuh')
  assert.equal(row.status_pulang, 'sakit')
})

// --- Pemasangan di route -------------------------------------------------

test('route manual mengirim overwrite=true, scan QR/RFID/alat tetap first-writer-wins', () => {
  const idx = fs.readFileSync('server/index.cjs', 'utf8')
  // Dua jalur manual (single + bulk) harus menimpa.
  const singleManual = idx.slice(idx.indexOf("app.post('/api/absensi-siswa', STAFF"), idx.indexOf("app.post('/api/absensi-siswa/bulk'"))
  const bulkManual = idx.slice(idx.indexOf("app.post('/api/absensi-siswa/bulk'"), idx.indexOf("app.post('/api/absensi-siswa/bulk-range'"))
  assert.match(singleManual, /overwrite: true/)
  assert.match(bulkManual, /overwrite: true/)

  // Jalur scan tidak menyertakan overwrite:true — default false tetap berlaku.
  const qrScan = idx.slice(idx.indexOf("app.post('/api/absensi-siswa/qr-scan'"), idx.indexOf("app.post('/api/absensi-siswa/rfid-scan'"))
  const rfidScan = idx.slice(idx.indexOf("app.post('/api/absensi-siswa/rfid-scan'"), idx.indexOf("app.post('/api/external/v1/absensi/scan'"))
  const deviceScan = idx.slice(idx.indexOf("app.post('/api/external/v1/absensi/scan'"), idx.indexOf('// ==================== ABSENSI GURU'))
  assert.doesNotMatch(qrScan, /overwrite: true/)
  assert.doesNotMatch(rfidScan, /overwrite: true/)
  assert.doesNotMatch(deviceScan, /overwrite: true/)
})