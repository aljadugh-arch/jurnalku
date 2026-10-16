// Matriks prioritas absensi (permintaan user):
//   "prioritas absensi hasil scan QR kecuali untuk edit sakit, ijin atau alpha"
//
// Aturan yang diuji:
//   - Scan QR/RFID/alat = acuan 'hadir'; tidak pernah menimpa apa pun yang terisi.
//   - Edit manual ke sakit/izin/alpha SELALU menang, termasuk atas hasil scan.
//   - Edit manual ke 'hadir' hanya boleh mengoreksi catatan manual, bukan hasil scan.
//   - Nilai sama dengan tersimpan = no-op (tidak memicu notif WA ganda).

const test = require('node:test')
const assert = require('node:assert/strict')
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

const base = { tenantId: 't1', siswaId: 's1', rombelId: 'r1', tanggal: '2026-10-16', waktu: '07:00' }
const row = (db) => db.prepare('SELECT * FROM absensi_siswa').get()

test('scan QR mengisi baris kosong, tapi tidak menimpa apa pun yang sudah terisi', () => {
  const db = makeDb()
  const kosong = writeDailyAttendanceSession(db, { ...base, id: 'a1', status: 'hadir', metode: 'qr', jenis: 'masuk', sumber: 'scan' })
  assert.equal(kosong.already, false)

  db.prepare("UPDATE absensi_siswa SET status='sakit', metode='manual'").run()
  const scanLagi = writeDailyAttendanceSession(db, { ...base, id: 'a2', status: 'hadir', metode: 'qr', jenis: 'masuk', sumber: 'scan' })
  assert.equal(scanLagi.already, true, 'scan tidak boleh menimpa catatan sakit')
  assert.equal(row(db).status, 'sakit')
})

test('edit manual sakit/izin/alpha menang atas hasil scan QR', () => {
  for (const status of ['sakit', 'izin', 'alpha']) {
    const db = makeDb()
    writeDailyAttendanceSession(db, { ...base, id: 'q1', status: 'hadir', metode: 'qr', jenis: 'masuk', sumber: 'scan' })
    const koreksi = writeDailyAttendanceSession(db, { ...base, id: 'm1', status, metode: 'manual', jenis: 'masuk', sumber: 'manual' })
    assert.equal(koreksi.already, false, `koreksi manual ke ${status} harus tersimpan`)
    assert.equal(row(db).status, status)
  }
})

test('edit manual ke hadir tidak menimpa catatan hasil scan, tapi boleh mengoreksi catatan manual', () => {
  // Atas catatan scan -> ditolak (QR prioritas).
  const dbScan = makeDb()
  writeDailyAttendanceSession(dbScan, { ...base, id: 'q1', status: 'sakit', metode: 'qr', jenis: 'masuk', sumber: 'scan' })
  const lawanScan = writeDailyAttendanceSession(dbScan, { ...base, id: 'm1', status: 'hadir', metode: 'manual', jenis: 'masuk', sumber: 'manual' })
  assert.equal(lawanScan.already, true, 'manual hadir tidak menimpa catatan hasil scan')
  assert.equal(row(dbScan).status, 'sakit')

  // Atas catatan manual -> boleh dikoreksi (admin memperbaiki inputnya sendiri).
  const dbManual = makeDb()
  writeDailyAttendanceSession(dbManual, { ...base, id: 'm0', status: 'alpha', metode: 'manual', jenis: 'masuk', sumber: 'manual' })
  const koreksi = writeDailyAttendanceSession(dbManual, { ...base, id: 'm2', status: 'hadir', metode: 'manual', jenis: 'masuk', sumber: 'manual' })
  assert.equal(koreksi.already, false)
  assert.equal(row(dbManual).status, 'hadir')
})

test('nilai sama dengan tersimpan tidak menulis ulang (already=true, satu baris)', () => {
  const db = makeDb()
  writeDailyAttendanceSession(db, { ...base, id: 'm1', status: 'sakit', metode: 'manual', jenis: 'masuk', sumber: 'manual' })
  const ulang = writeDailyAttendanceSession(db, { ...base, id: 'm2', status: 'sakit', metode: 'manual', jenis: 'masuk', sumber: 'manual' })
  assert.equal(ulang.already, true)
  assert.equal(db.prepare('SELECT count(*) n FROM absensi_siswa').get().n, 1)
})

test('parameter lama overwrite=true tetap didukung sebagai sumber manual', () => {
  const db = makeDb()
  writeDailyAttendanceSession(db, { ...base, id: 'a1', status: 'hadir', metode: 'manual', jenis: 'masuk' })
  const ubah = writeDailyAttendanceSession(db, { ...base, id: 'a2', status: 'alpha', metode: 'manual', jenis: 'masuk', overwrite: true })
  assert.equal(ubah.already, false)
  assert.equal(row(db).status, 'alpha')
})

test('prioritas diuji independen untuk sesi pulang', () => {
  const db = makeDb()
  writeDailyAttendanceSession(db, { ...base, id: 'q1', status: 'hadir', metode: 'qr', jenis: 'pulang', sumber: 'scan' })
  const koreksi = writeDailyAttendanceSession(db, { ...base, id: 'm1', status: 'izin', metode: 'manual', jenis: 'pulang', sumber: 'manual' })
  assert.equal(koreksi.already, false)
  assert.equal(row(db).status_pulang, 'izin')

  const scanLagi = writeDailyAttendanceSession(db, { ...base, id: 'q2', status: 'hadir', metode: 'qr', jenis: 'pulang', sumber: 'scan' })
  assert.equal(scanLagi.already, true)
  assert.equal(row(db).status_pulang, 'izin')
})