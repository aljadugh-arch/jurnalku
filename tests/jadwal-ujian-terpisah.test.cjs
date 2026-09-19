const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

test('tabel jadwal_ujian terpisah dari tabel jadwal reguler', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS jadwal_ujian/)
})

test('endpoint CRUD jadwal_ujian ada: GET, POST, PUT, DELETE', () => {
  assert.match(server, /app\.get\('\/api\/jadwal-ujian'/)
  assert.match(server, /app\.post\('\/api\/jadwal-ujian'/)
  assert.match(server, /app\.put\('\/api\/jadwal-ujian\/:id'/)
  assert.match(server, /app\.delete\('\/api\/jadwal-ujian\/:id'/)
})

test('detectJadwalConflicts tidak dipanggil dengan data jadwal_ujian (tabel terpisah, tidak pernah campur)', () => {
  const route = server.match(/app\.get\('\/api\/jadwal\/konflik'[\s\S]*?\n\}\)\n/)?.[0] || ''
  assert.doesNotMatch(route, /jadwal_ujian/)
})

test('examModeForDate helper query ke jadwal_ujian bukan filter template_id di tabel jadwal', () => {
  assert.match(server, /FROM jadwal_ujian/)
})

test('endpoint jadwal hari-ini pakai jadwal_ujian saat mode ujian aktif', () => {
  const route = server.match(/app\.get\('\/api\/jadwal\/hari-ini'[\s\S]*?\n\}\)\n/)?.[0] || ''
  assert.match(route, /jadwal_ujian|examTemplateId/)
})

test('POST jadwal_ujian mengecek bentrok hanya sesama jadwal_ujian, tidak terhadap tabel jadwal reguler', () => {
  const route = server.match(/app\.post\('\/api\/jadwal-ujian'[\s\S]*?\n\}\)\n/)?.[0] || ''
  assert.match(route, /FROM jadwal_ujian/)
  assert.doesNotMatch(route, /FROM jadwal j(?!_ujian)/)
})
