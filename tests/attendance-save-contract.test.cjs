const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
const attendancePage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'AbsensiSiswaPage.tsx'), 'utf8')
const teacherAttendancePage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'guru', 'GuruAbsensiSiswaQRPage.tsx'), 'utf8')
const settingsPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'SettingsPage.tsx'), 'utf8')
const appPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8')
const bottomNavigation = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'layout', 'BottomNavigation.tsx'), 'utf8')

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

test('absensi harian guru dibatasi backend ke guru kelas atau guru terjadwal pada jenjang RA/MI', () => {
  const jenjangGuard = routeBody('function tenantUsesClassTeacherDailyAttendance', 'function requireTeacherDailyAttendanceAccess')
  const guard = routeBody('function requireTeacherDailyAttendanceAccess', 'function teacherScheduleForDay')
  const single = routeBody("app.post('/api/absensi-siswa', STAFF", "app.post('/api/absensi-siswa/bulk'")
  const bulk = routeBody("app.post('/api/absensi-siswa/bulk', STAFF", "app.post('/api/absensi-siswa/bulk-range'")
  const qr = routeBody("app.post('/api/absensi-siswa/qr-scan', STAFF", "// ==================== ABSENSI GURU")

  assert.match(jenjangGuard, /getTenantSettings\(db, tenantId, 'jenjang'\)/)
  assert.match(jenjangGuard, /\['RA', 'MI'\]/)
  assert.match(guard, /wali_kelas_id/)
  assert.match(guard, /jenis_kegiatan='mapel'/)
  assert.match(single, /requireTeacherDailyAttendanceAccess\(req, siswa_id, tanggal\)/)
  assert.match(bulk, /requireTeacherDailyAttendanceAccess\(req, d\.siswa_id, tanggal\)/)
  assert.match(qr, /requireTeacherDailyAttendanceAccess\(req, siswa\.id, tanggal\)/)
})

test('admin RA/MI monitor-only dan konfigurasi jendela QR terpisah dari jam pulang per rombel', () => {
  const range = routeBody("app.post('/api/absensi-siswa/bulk-range', STAFF", 'function normalizeQrToken')
  const rombelClock = routeBody("app.get('/api/rombel-jam-pulang', ADMIN", "// ==================== JENIS TAGIHAN")
  assert.match(range, /requireAdminDailyAttendanceWriteAccess\(req\)/)
  assert.match(rombelClock, /requireRombelDepartureConfigJenjang\(req\)/)
  assert.match(server, /tenantUsesLegacyStudentQrWindow\(req\.tenantId\).*teacherClockCols\.concat\(legacyStudentQrCols\)/s)
  assert.match(attendancePage, /readOnly = isGuruKelasJenjang/)
  assert.match(attendancePage, /disabled=\{readOnly\}/)
  assert.match(settingsPage, /!isGuruKelasJenjang\(form\.jenjang\)/)
  assert.match(settingsPage, /isGuruKelasJenjang\(form\.jenjang\).*<JamPulangSiswa/s)
  assert.doesNotMatch(settingsPage, /isGuruKelasJenjang\(settings\.jenjang/)
})

test('halaman guru mengirim siswa dan tanggal untuk filter akses server pada baca dan scan', () => {
  assert.match(teacherAttendancePage, /api\.get\('\/absensi-siswa'.*rombel_id/s)
  assert.match(teacherAttendancePage, /api\.post\('\/absensi-siswa\/qr-scan'.*tanggal/s)
})

test('dashboard siswa juga dapat diakses wali murid tertaut', () => {
  assert.match(appPage, /path="\/siswa"[\s\S]*allowedRoles=\{\['siswa', 'wali_murid'\]\}/)
  assert.match(server, /if \(!\['siswa', 'wali_murid'\]\.includes\(req\.user\.role\)\)/)
  assert.match(server, /if \(!linked\.includes\(String\(selected\)\)\)/)
  assert.match(bottomNavigation, /role === 'siswa' \|\| role === 'wali_murid'/)
})
