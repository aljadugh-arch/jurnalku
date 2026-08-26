const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
const bottomNavigation = read('src/components/layout/BottomNavigation.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const menuItems = read('src/lib/menuItems.tsx')
const iconMenuGrid = read('src/components/IconMenuGrid.tsx')
const settings = read('src/pages/admin/SettingsPage.tsx')
const main = read('src/main.tsx')
const indexHtml = read('index.html')
const serviceWorker = read('public/sw.js')
const guruNotes = read('src/pages/guru/GuruCatatanKepribadianPage.tsx')
const server = read('server/index.cjs')

test('bottom navbar admin dan kepala berisi empat menu utama lalu Lainnya', () => {
  const adminItems = bottomNavigation.match(/\n  return \[\n([\s\S]*?)\n  \]\n}\n\nfunction isActive/)?.[1] || ''
  const kepalaItems = bottomNavigation.match(/if \(role === 'kepala'\) \{\n    return \[\n([\s\S]*?)\n    \]\n  }/)?.[1] || ''
  const expectedOrder = [
    "label: 'Home', path: '/admin'",
    "label: 'Kalender', path: '/admin/kalender-kbm'",
    "label: 'Presensi', path: '/admin/absensi-siswa'",
    '[ceklokStaff]',
    "label: 'Posting', path: '/admin/posting'",
  ]
  for (const roleItems of [adminItems, kepalaItems]) {
    for (let index = 1; index < expectedOrder.length; index++) {
      assert.ok(roleItems.indexOf(expectedOrder[index - 1]) < roleItems.indexOf(expectedOrder[index]))
    }
  }
  assert.match(bottomNavigation, /const primary = items\.slice\(0, 4\)/)
  assert.match(bottomNavigation, /<span className="leading-none">Lainnya<\/span>/)
})

test('posting tersedia di menu Lainnya admin/kepala dan navigasi guru', () => {
  assert.match(bottomNavigation, /label: 'Posting', path: '\/admin\/posting'/)
  assert.match(bottomNavigation, /label: 'Posting', path: '\/guru\/posting'/)
  assert.match(menuItems, /label: 'Posting'.*path: '\/admin\/posting'/)
  assert.match(menuItems, /label: 'Posting'.*path: '\/guru\/posting'/)
})

test('wali kelas tidak lagi diduplikasi di kelompok jadwal atau navigasi mobile admin', () => {
  const sidebarSchedule = sidebar.match(/label: 'Jadwal Pelajaran'[\s\S]*?children: \[([\s\S]*?)\]/)?.[1] || ''
  const librarySchedule = menuItems.match(/label: 'Jadwal Pelajaran'[\s\S]*?children: \[([\s\S]*?)\]/)?.[1] || ''
  assert.doesNotMatch(sidebarSchedule, /Wali Kelas|\/admin\/wali-kelas/)
  assert.doesNotMatch(librarySchedule, /Wali Kelas|\/admin\/wali-kelas/)
  assert.doesNotMatch(sidebar, /path: '\/admin\/wali-kelas'/)
  assert.doesNotMatch(menuItems, /path: '\/admin\/wali-kelas'/)
  assert.doesNotMatch(bottomNavigation, /label: 'Wali Kelas', path: '\/admin\/wali-kelas'/)
  assert.doesNotMatch(iconMenuGrid, /label: 'Wali Kelas'|\/admin\/wali-kelas/)
})

test('regenerate manifest memakai base URL API dengan benar dan manifest memakai URL stabil', () => {
  assert.match(settings, /api\.post\('\/settings\/pwa-manifest'/)
  assert.doesNotMatch(settings, /api\.post\('\/api\/settings\/pwa-manifest'/)
  assert.match(indexHtml, /rel="manifest" href="\/api\/pwa\/manifest"/)
  assert.doesNotMatch(indexHtml, /navigator\.serviceWorker\.register/)
  assert.match(main, /linkEl\.href = '\/api\/pwa\/manifest'/)
  assert.match(main, /navigator\.serviceWorker\.register\('\/sw\.js'\)/)
  assert.match(main, /navigator\.serviceWorker\.getRegistrations\(\)/)
  assert.match(main, /registration\.unregister\(\)/)
  assert.match(main, /linkEl\.removeAttribute\('href'\)/)
  assert.doesNotMatch(main, /URL\.createObjectURL/)
  assert.doesNotMatch(serviceWorker, /manifest\.webmanifest/)
  assert.match(serviceWorker, /pathname === '\/api\/pwa\/manifest'\) return/)
  assert.match(bottomNavigation, /item\.external \? \(/)
  assert.match(bottomNavigation, /<Link[\s\S]*to=\{item\.path\}/)
})

test('backend menyimpan status PWA dan menyajikan manifest tenant dengan benar', () => {
  assert.match(server, /\['pwa_enabled','INTEGER DEFAULT 0'\]/)
  assert.match(server, /pwa_enabled=excluded\.pwa_enabled/)
  assert.match(server, /SELECT pwa_enabled,pwa_name,pwa_icon,nama_lembaga,logo,primary_color,pwa_bg_color,pwa_theme_color FROM settings/)
  assert.match(server, /s\.pwa_enabled === 0.*status\(404\)/)
  assert.match(server, /application\/manifest\+json/)
  assert.match(server, /req\.body\.pwa_icon === undefined/)
  assert.match(settings, /api\.put\('\/settings\/pwa'/)
})

test('pencarian siswa catatan guru difilter lokal tanpa request balapan per ketikan', () => {
  assert.match(guruNotes, /const filteredSiswa = useMemo\(\(\) =>/)
  assert.match(guruNotes, /filteredSiswa\.map/)
  assert.doesNotMatch(guruNotes, /onChange=\{e => \{ setSiswaSearch\(e\.target\.value\); fetchSiswa\(e\.target\.value\) \}\}/)
})
