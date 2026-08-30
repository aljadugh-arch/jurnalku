const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const server = read('server/index.cjs')
const guruJadwalPage = read('src/pages/guru/GuruJadwalPage.tsx')

test('guru dashboard excludes schedules on tenant-configured holidays', () => {
  // Dashboard must consult holiday rules before returning jadwal_hari_ini
  const dashboardIdx = server.indexOf("app.get('/api/guru/dashboard'")
  assert.ok(dashboardIdx > -1, 'dashboard route exists')
  const block = server.slice(dashboardIdx, dashboardIdx + 4000)
  assert.match(block, /tenantIsHoliday/, 'dashboard must use holiday rules')
})

test('guru jadwal-context excludes schedules on tenant-configured holidays', () => {
  const idx = server.indexOf("app.get('/api/guru/jadwal-context'")
  assert.ok(idx > -1, 'jadwal-context route exists')
  const block = server.slice(idx, idx + 3000)
  assert.match(block, /tenantIsHoliday/, 'jadwal-context must filter holidays')
})

test('Jadwal Saya page includes Minggu column so Sunday schedules are visible', () => {
  assert.match(guruJadwalPage, /['"]Minggu['"]/, 'hariList must include Minggu')
  // six-day hardcoded list is the bug
  assert.doesNotMatch(guruJadwalPage, /const hariList = \['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'\]/)
})

test('teacher class-session entry is rejected on holidays', () => {
  const idx = server.indexOf("app.post('/api/guru/sesi-kelas/masuk'")
  assert.ok(idx > -1)
  const block = server.slice(idx, idx + 2500)
  assert.match(block, /tenantIsHoliday/, 'sesi-kelas masuk must block holidays')
})
