const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
const attendancePage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'AbsensiSiswaPage.tsx'), 'utf8')
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'guru', 'GuruDashboard.tsx'), 'utf8')

function routeBody(start, end) {
  const from = server.indexOf(start)
  assert.notEqual(from, -1, `route tidak ditemukan: ${start}`)
  const to = end ? server.indexOf(end, from) : server.length
  return server.slice(from, to === -1 ? server.length : to)
}

test('absensi manual hanya mengirim siswa yang sudah dipilih, tanpa fallback alpha', () => {
  assert.match(attendancePage, /Object\.entries\(absensi\)/)
  assert.doesNotMatch(attendancePage, /status:\s*absensi\[s\.id\]\s*\|\|\s*'alpha'/)
  assert.match(attendancePage, /Pilih status kehadiran/)
})

test('API bulk manual memvalidasi status dan siswa tenant sebelum upsert masuk atau pulang', () => {
  const bulk = routeBody("app.post('/api/absensi-siswa/bulk', STAFF", "app.post('/api/absensi-siswa/bulk-range'")
  assert.match(bulk, /validAttendanceStatuses/)
  assert.match(bulk, /studentExists/)
  assert.match(bulk, /status_pulang=\?/)
  assert.match(bulk, /status=\?/)
})

test('dashboard guru menggabungkan jadwal mapel dan ekstrakurikuler hari ini', () => {
  const helper = routeBody('function teacherScheduleForDay', "app.get('/api/guru/dashboard'")
  const api = routeBody("app.get('/api/guru/dashboard'", 'function clockToMinutes')
  assert.match(api, /teacherScheduleForDay/)
  assert.match(helper, /FROM ekskul e/)
  assert.match(helper, /'ekskul' jenis_kegiatan/)
  assert.match(helper, /e\.pembina_id=\? AND e\.tenant_id=\? AND lower\(e\.hari\)=\?/)
})

test('halaman dashboard tidak membuka jurnal atau kelas untuk jadwal ekstrakurikuler', () => {
  assert.match(dashboard, /isAcademicSchedule/)
  assert.match(dashboard, /\/guru\/absensi-ekskul/)
  assert.match(dashboard, /Ekstrakurikuler|Peminatan/)
})
