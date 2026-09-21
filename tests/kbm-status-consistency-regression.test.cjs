const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')

function routeBody(start, end) {
  const from = server.indexOf(start)
  assert.notEqual(from, -1, `route tidak ditemukan: ${start}`)
  const to = end ? server.indexOf(end, from) : server.length
  return server.slice(from, to === -1 ? server.length : to)
}

// ========================================================================
// FIXED: assertKbmActive() sekarang terima jenis='ujian' dan 'kegiatan_lain'
// ========================================================================

test('FIXED: assertKbmActive() terima ujian dan kegiatan_lain, hanya tolak libur', () => {
  const from = server.indexOf('function assertKbmActive')
  assert.notEqual(from, -1, 'assertKbmActive function tidak ditemukan')
  const to = server.indexOf('function', from + 10) // next function after this one
  const fn = to === -1 ? server.slice(from) : server.slice(from, to)
  assert.match(fn, /assertKbmActive\(req, tanggal\)/)
  assert.match(fn, /isHolidayDate\(tanggal/)
  // FIXED: sekarang gunakan IN ('kbm_aktif', 'ujian', 'kegiatan_lain')
  assert.match(fn, /jenis\s+IN\s*\(\s*'kbm_aktif'\s*,\s*'ujian'\s*,\s*'kegiatan_lain'\s*\)/)
})

test('FIXED: /api/kalender-kbm/status returns aktif=true saat ujian atau kegiatan_lain', () => {
  const endpoint = routeBody("app.get('/api/kalender-kbm/status'", "app.post('/api/kalender-kbm'")
  assert.match(endpoint, /\/api\/kalender-kbm\/status/)
  assert.match(endpoint, /aktif:/)
  // FIXED: sekarang gunakan IN untuk terima ujian dan kegiatan_lain
  assert.match(endpoint, /jenis\s+IN\s*\(\s*'kbm_aktif'\s*,\s*'ujian'\s*,\s*'kegiatan_lain'\s*\)/)
})

test('attendance guards menggunakan assertKbmActive pada semua write path', () => {
  const qrScan = routeBody("app.post('/api/absensi-siswa/qr-scan'", "// ==================== ABSENSI GURU")
  const manual = routeBody("app.post('/api/absensi-siswa', STAFF", "app.post('/api/absensi-siswa/bulk'")
  const bulk = routeBody("app.post('/api/absensi-siswa/bulk', STAFF", "app.post('/api/absensi-siswa/bulk-range'")
  const range = routeBody("app.post('/api/absensi-siswa/bulk-range', STAFF", "function normalizeQrToken")
  
  assert.match(qrScan, /assertKbmActive\(req, tanggal\)/)
  assert.match(manual, /assertKbmActive\(req, tanggal\)/)
  assert.match(bulk, /assertKbmActive\(req, tanggal\)/)
  assert.match(range, /assertKbmActive\(req, tanggal\)/)
})

test('ceklok guru memanggil assertKbmActive', () => {
  const ceklokRoute = routeBody("app.post('/api/guru/ceklok'", "app.post('/api/guru/ceklok/")
  assert.match(ceklokRoute, /assertKbmActive|isHolidayDate|tenantIsHoliday/)
})

console.log('kbm-status-consistency GREEN tests passed')
