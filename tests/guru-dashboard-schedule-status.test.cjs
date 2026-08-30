const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const dashboard = read('src/pages/guru/GuruDashboard.tsx')

test('dashboard derives current time in Asia/Jakarta, not browser local time', () => {
  assert.match(dashboard, /Asia\/Jakarta/, 'must compute WIB time')
  assert.doesNotMatch(dashboard, /function nowMinutes\(\)\s*\{\s*const d = new Date\(\)\s*return d\.getHours\(\)/)
})

test('finished schedule rows show Selesai instead of an actionable Masuk button', () => {
  assert.match(dashboard, /isFinished/, 'must compute per-schedule finished state')
  // Masuk must be gated on the schedule not being finished
  assert.match(dashboard, /!isFinished\(j\)/, 'Masuk button gated by isFinished')
  assert.match(dashboard, />Selesai</, 'finished label rendered')
})

test('active session for a schedule exposes Selesai Kelas on that row', () => {
  assert.match(dashboard, /sesi_kelas_aktif\?\.jadwal_id === j\.id/, 'row matches active session by jadwal_id')
  assert.match(dashboard, /finishClass/, 'row can finish the active class')
})
