const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('admin jadwal page exposes today all rombel view and API route', () => {
  const page = read('src/pages/admin/JadwalPage.tsx')
  const server = read('server/index.cjs')
  assert.match(page, /Jadwal Hari Ini Semua Rombel/)
  assert.match(page, /jadwal\/hari-ini/)
  assert.match(server, /app\.get\('\/api\/jadwal\/hari-ini'/)
})

test('production navigation contract keeps updated features reachable', () => {
  const app = read('src/App.tsx')
  const sidebar = read('src/components/layout/Sidebar.tsx')
  const bottom = read('src/components/layout/BottomNavigation.tsx')
  const menus = read('src/lib/menuItems.tsx')

  assert.doesNotMatch(read('src/components/layout/Header.tsx'), /<Bell|aria-label="Notifikasi"|\/notifications/)
  for (const marker of [
    'DeveloperApiPage',
    'BackupRestorePage',
    'CatatanKepribadianPage',
    'KantinMenuPage',
    'path="posting"',
    'path="catatan-kepribadian"',
    'path="backup-restore"',
    'path="developer-api"',
  ]) assert.match(app, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')))

  for (const marker of [
    'REST API Developer',
    'Backup & Restore',
    'Catatan Kepribadian',
    'E-Kantin & Cashless',
    'Notifikasi Otomatis',
  ]) {
    assert.match(sidebar, new RegExp(marker))
    assert.match(menus, new RegExp(marker))
  }
  assert.match(bottom, /REST API/)
  assert.match(bottom, /Backup/)
})
