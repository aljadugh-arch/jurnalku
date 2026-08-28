const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
const featureAccess = read('src/lib/featureAccess.ts')
const mobileGrid = read('src/components/MobileMenuGrid.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const bottom = read('src/components/layout/BottomNavigation.tsx')

test('semua jalur absensi dan penilaian yang terlihat dipetakan ke toggle fitur', () => {
  for (const route of [
    '/admin/absensi-siswa', '/admin/absensi-guru', '/admin/absensi-ekskul',
    '/admin/absensi-jamaah', '/admin/absensi-kokurikuler', '/admin/absensi-kegiatan',
    '/guru/absensi-siswa', '/guru/absensi-ekskul', '/guru/penilaian-harian',
    '/guru/catatan-kepribadian',
  ]) assert.match(featureAccess, new RegExp(route.replaceAll('/', '\\/')))
})

test('sidebar, bottom navigation, dan grid mobile memakai status fitur tenant yang sama', () => {
  assert.match(sidebar, /pathEnabled/)
  assert.match(bottom, /pathEnabled/)
  assert.match(mobileGrid, /useSubscriptionStore/)
  assert.match(mobileGrid, /pathEnabled/)
  assert.match(mobileGrid, /primaryGridForRole[\s\S]*filter/)
})

test('sapaan guru dan tanda tangan jurnal tetap tersedia pada bundle source utama', () => {
  const dashboard = read('src/pages/guru/GuruDashboard.tsx')
  const journal = read('src/pages/guru/GuruJurnalPage.tsx')
  assert.match(dashboard, /teacherDisplayName/)
  assert.match(dashboard, /jenis_kelamin/)
  assert.match(dashboard, /Pak/)
  assert.match(dashboard, /Ibu/)
  assert.match(journal, /Tanda Tangan Guru/)
  assert.match(journal, /signature_data/)
})
