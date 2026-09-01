const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
const attendancePage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'AbsensiSiswaPage.tsx'), 'utf8')

function routeBody(start, end) {
  const from = server.indexOf(start)
  assert.notEqual(from, -1, `route tidak ditemukan: ${start}`)
  const to = end ? server.indexOf(end, from) : server.length
  return server.slice(from, to === -1 ? server.length : to)
}

test('absensi masuk manual memakai aturan KBM yang sama dengan QR', () => {
  const single = routeBody("app.post('/api/absensi-siswa', STAFF", "app.post('/api/absensi-siswa/bulk'")
  const bulk = routeBody("app.post('/api/absensi-siswa/bulk', STAFF", "app.post('/api/absensi-siswa/bulk-range'")
  const qr = routeBody("app.post('/api/absensi-siswa/qr-scan', STAFF", "// ==================== ABSENSI GURU")

  assert.match(single, /assertKbmActive\(req, tanggal\)/)
  assert.match(bulk, /assertKbmActive\(req, tanggal\)/)
  assert.match(qr, /assertKbmActive\(req, tanggal\)/)
})

test('semua jalur simpan absensi scoped tenant dan memberikan respons sukses', () => {
  const single = routeBody("app.post('/api/absensi-siswa', STAFF", "app.post('/api/absensi-siswa/bulk'")
  const bulk = routeBody("app.post('/api/absensi-siswa/bulk', STAFF", "app.post('/api/absensi-siswa/bulk-range'")
  const qr = routeBody("app.post('/api/absensi-siswa/qr-scan', STAFF", "// ==================== ABSENSI GURU")

  assert.match(single, /res\.json\(/)
  assert.match(bulk, /res\.json\(/)
  assert.match(qr, /res\.json\(/)
  assert.match(single, /WHERE siswa_id = \? AND tanggal = \? AND tenant_id = \?/)
  assert.match(bulk, /WHERE siswa_id = \? AND tanggal = \? AND tenant_id = \?/)
  assert.match(qr, /WHERE siswa_id = \? AND tanggal = \? AND tenant_id = \?/)
})

test('kepala yang merangkap guru tetap dapat dihubungkan ke GTK yang sama', () => {
  const resolve = routeBody('function resolveGtkForUser', "// ==================== SETTINGS")
  const usersFromGtk = routeBody("app.post('/api/users/from-gtk', ADMIN", "// ==================== SETTINGS")
  assert.match(resolve, /gtk_id/)
  assert.match(usersFromGtk, /role = \['guru', 'kepala'\]\.includes\(it\.role\)/)
  assert.match(usersFromGtk, /INSERT INTO users .*gtk_id/)
})

test('halaman absensi menjelaskan bahwa KBM harus aktif sebelum manual atau QR', () => {
  assert.match(attendancePage, /\/kalender-kbm\/status/)
  assert.match(attendancePage, /KBM tanggal ini belum diaktifkan/)
  assert.match(attendancePage, /Simpan Absensi/)
  assert.match(attendancePage, /startQrCamera/)
})
