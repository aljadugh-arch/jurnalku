const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { dateRange, writeDailyAttendanceSession } = require('../server/attendance-rules.cjs')

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE absensi_siswa (
    id TEXT PRIMARY KEY,
    siswa_id TEXT NOT NULL,
    rombel_id TEXT,
    tanggal TEXT NOT NULL,
    status TEXT NOT NULL,
    metode TEXT DEFAULT 'manual',
    keterangan TEXT,
    waktu_absen TEXT,
    waktu_masuk TEXT,
    waktu_pulang TEXT,
    status_pulang TEXT DEFAULT '',
    keterangan_pulang TEXT DEFAULT '',
    tenant_id TEXT DEFAULT 'default',
    UNIQUE(tenant_id,siswa_id,tanggal)
  )`)
  return db
}

const base = {
  tenantId: 't1', siswaId: 's1', rombelId: 'r1', tanggal: '2026-09-11',
  status: 'sakit', waktu: '07:01', metode: 'manual', keterangan: 'demam',
}

test('dateRange preserves date-only values without Jakarta UTC shift', () => {
  assert.deepEqual(dateRange('2026-09-11', '2026-09-11'), ['2026-09-11'])
  assert.deepEqual(dateRange('2026-01-31', '2026-02-02'), ['2026-01-31', '2026-02-01', '2026-02-02'])
  assert.deepEqual(dateRange('2026-02-30', '2026-03-01'), [])
})

test('first writer wins for every non-empty masuk status', () => {
  const db = makeDb()
  const first = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a1' })
  const second = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a2', status: 'hadir', metode: 'qr' })
  assert.equal(first.already, false)
  assert.equal(second.already, true)
  assert.equal(second.status, 'sakit')
  const row = db.prepare('SELECT * FROM absensi_siswa').get()
  assert.equal(row.status, 'sakit')
  assert.equal(row.metode, 'manual')
  assert.equal(db.prepare('SELECT count(*) n FROM absensi_siswa').get().n, 1)
})

test('pulang-first leaves masuk empty and later masuk can be recorded', () => {
  const db = makeDb()
  const pulang = writeDailyAttendanceSession(db, { ...base, jenis: 'pulang', id: 'a1', status: 'izin', waktu: '12:00' })
  let row = db.prepare('SELECT * FROM absensi_siswa').get()
  assert.equal(pulang.already, false)
  assert.equal(row.status, '')
  assert.equal(row.status_pulang, 'izin')

  const masuk = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'a2', status: 'hadir', waktu: '07:00' })
  row = db.prepare('SELECT * FROM absensi_siswa').get()
  assert.equal(masuk.already, false)
  assert.equal(row.status, 'hadir')
  assert.equal(row.status_pulang, 'izin')
})

test('first writer wins independently for pulang', () => {
  const db = makeDb()
  writeDailyAttendanceSession(db, { ...base, jenis: 'pulang', id: 'a1', status: 'sakit', waktu: '11:00' })
  const duplicate = writeDailyAttendanceSession(db, { ...base, jenis: 'pulang', id: 'a2', status: 'hadir', waktu: '12:00', metode: 'qr' })
  assert.equal(duplicate.already, true)
  assert.equal(duplicate.status, 'sakit')
  const row = db.prepare('SELECT * FROM absensi_siswa').get()
  assert.equal(row.status_pulang, 'sakit')
  assert.equal(row.waktu_pulang, '11:00')
})

test('admin manual absen lebih dulu membuat scan QR guru melaporkan sudah tercatat, dan sebaliknya', () => {
  const db = makeDb()
  // Skenario 1: admin absen manual duluan, guru scan QR belakangan.
  const adminFirst = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'admin-1', status: 'hadir', metode: 'manual' })
  const guruQrAfter = writeDailyAttendanceSession(db, { ...base, jenis: 'masuk', id: 'guru-qr-1', status: 'hadir', metode: 'qr' })
  assert.equal(adminFirst.already, false)
  assert.equal(guruQrAfter.already, true)
  assert.equal(db.prepare('SELECT count(*) n FROM absensi_siswa').get().n, 1)

  // Skenario 2: guru scan QR duluan (siswa lain), admin absen manual belakangan.
  const guruQrFirst = writeDailyAttendanceSession(db, { ...base, siswaId: 's2', jenis: 'masuk', id: 'guru-qr-2', status: 'hadir', metode: 'qr' })
  const adminAfter = writeDailyAttendanceSession(db, { ...base, siswaId: 's2', jenis: 'masuk', id: 'admin-2', status: 'sakit', metode: 'manual' })
  assert.equal(guruQrFirst.already, false)
  assert.equal(adminAfter.already, true)
  assert.equal(adminAfter.status, 'hadir')
})
