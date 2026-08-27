const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('admin jadwal page exposes today all rombel view and API route', () => {
  const page = fs.readFileSync(path.join(__dirname, '../src/pages/admin/JadwalPage.tsx'), 'utf8')
  const server = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8')
  assert.match(page, /Jadwal Hari Ini Semua Rombel/)
  assert.match(page, /jadwal\/hari-ini/)
  assert.match(server, /app\.get\('\/api\/jadwal\/hari-ini'/)
})
