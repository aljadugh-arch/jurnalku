const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')

test('admin QR forwards selected date', () => {
  const src = read('src/pages/admin/AbsensiSiswaPage.tsx')
  assert.match(src, /qr-scan.*tanggal/)
})

test('daily attendance exposes already response for manual writes', () => {
  const src = read('server/index.cjs')
  assert.match(src, /already: true/)
  assert.match(src, /writeDailyAttendanceSession\(db/)
  assert.match(src, /idx_absensi_siswa_unique/)
})

test('automatic backup has configurable schedule fields', () => {
  const backend = read('server/backup-drive.cjs')
  assert.match(backend, /schedule_time/)
  assert.match(backend, /last_run_key/)
})

test('library menu is present on desktop and mobile/tablet paths', () => {
  const files = ['src/lib/menuItems.tsx', 'src/components/layout/Sidebar.tsx', 'src/components/layout/BottomNavigation.tsx']
  const combined = files.map(read).join('\n')
  assert.match(combined, /perpustakaan/)
})

test('normal login token duration is configurable', () => {
  const src = read('server/index.cjs')
  assert.match(src, /JWT_EXPIRES_IN/)
  assert.match(src, /expiresIn: JWT_EXPIRES_IN/)
})
