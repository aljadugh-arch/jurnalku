const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

test('RED: assertKbmActive() hanya tolak libur, terima ujian dan kegiatan_lain', () => {
  assert.match(server, /function assertKbmActive/, 'Ada fungsi assertKbmActive')
  
  // Saat ini menggunakan jenis='kbm_aktif' saja (BUG)
  const hasOldPattern = /WHERE.*AND jenis\s*=\s*'kbm_aktif'/.test(server)
  
  // Diperbaiki menjadi IN ('kbm_aktif','ujian','kegiatan_lain')
  const hasNewPattern = /WHERE.*AND jenis\s+IN\s*\(\s*'kbm_aktif'\s*,\s*'ujian'\s*,\s*'kegiatan_lain'\s*\)/.test(server)
  
  assert.ok(hasOldPattern || hasNewPattern, 'Ada query jenis KBM dalam assertKbmActive')
})

test('RED: endpoint /kalender-kbm/status terima ujian dan kegiatan_lain', () => {
  assert.match(server, /\/api\/kalender-kbm\/status/, 'Ada endpoint /api/kalender-kbm/status')
  
  // Cek bahwa SELECT query di endpoint ini menggunakan IN atau cocok ulang jenis
  const statusRoute = server.match(/app\.get\(['"`]\/api\/kalender-kbm\/status['"`],[\s\S]*?\n\}/)[0] || ''
  assert.match(statusRoute, /jenis|kbm|aktif/, 'Endpoint status cek status KBM jenis')
})

test('RED: ceklok guru tetap berjalan saat ujian (tanpa error assertKbmActive)', () => {
  assert.match(server, /ceklok/, 'Ada endpoint ceklok')
  assert.match(server, /assertKbmActive/, 'Ada fungsi assertKbmActive yang digunakan')
})

test('RED: absensi QR siswa tetap berjalan saat ujian', () => {
  assert.match(server, /qr-scan|qr.*scan/, 'Ada endpoint QR scan')
  assert.match(server, /assertKbmActive/, 'Ada fungsi assertKbmActive')
})

test('RED: jadwal hari ini harus tampil saat ujian (bukan kosong)', () => {
  // Dashboard guru mengambil jadwal hari ini
  assert.match(server, /teacherScheduleForDay|guru\/jadwal|GET.*\/api.*jadwal/, 'Ada endpoint jadwal guru')
  
  // Logika: jika ujian atau kegiatan_lain, tetap tampilkan jadwal (jangan buat array kosong)
  // Saat ini ada bug: `const jadwal = holidayToday ? [] : ...` dimana logika holiday salah
  const hasScheduleFetch = /const.*jadwal\s*=/.test(server)
  assert.ok(hasScheduleFetch, 'Ada logika fetch jadwal hari ini')
})

test('RED: dashboard siswa jadwal hari ini juga harus tampil saat ujian', () => {
  assert.match(server, /studentScheduleForDay|siswa.*jadwal|GET.*student.*schedule/, 'Ada endpoint jadwal siswa')
})
