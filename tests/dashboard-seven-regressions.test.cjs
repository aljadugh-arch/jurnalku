const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const server = read('server/index.cjs')
const app = read('src/App.tsx')
const mobileGuru = read('src/pages/guru/MobileGuruDashboard.tsx')
const mobileSiswa = read('src/pages/siswa/MobileSiswaDashboard.tsx')
const settings = read('src/pages/admin/SettingsPage.tsx')
const jenjang = read('src/lib/jenjang.ts')
const header = read('src/components/layout/Header.tsx')
const mobileHeader = read('src/components/MobileHeader.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const bottomNav = read('src/components/layout/BottomNavigation.tsx')

function block(source, start, end) {
  const from = source.indexOf(start)
  assert.notEqual(from, -1, `blok tidak ditemukan: ${start}`)
  const to = source.indexOf(end, from)
  return source.slice(from, to === -1 ? source.length : to)
}

test('dashboard guru selalu mengirim foto GTK dan mobile memakai foto profil GTK', () => {
  const route = block(server, "app.get('/api/guru/dashboard'", "function clockToMinutes")
  assert.match(route, /foto:\s*gtk\.foto\s*\|\|\s*null/)
  assert.match(mobileGuru, /profilePhoto=\{data\.gtk\?\.foto\s*\|\|\s*null\}/)
})

test('dashboard guru mobile dapat menyelesaikan sesi kelas aktif', () => {
  assert.match(mobileGuru, /const finishClass = async \(\) =>/)
  assert.match(mobileGuru, /api\.post\('\/guru\/sesi-kelas\/selesai',\s*\{\s*sesi_id:\s*data\.sesi_kelas_aktif\?\.id\s*\}\)/)
  assert.match(mobileGuru, /data\.sesi_kelas_aktif[\s\S]*Selesai Kelas/)
})

test('semua pintasan siswa memiliki route dan route tak dikenal tidak memaksa login', () => {
  for (const route of ['tugas', 'tagihan', 'tabungan', 'perpustakaan', 'menu']) {
    assert.match(app, new RegExp(`<Route path=["']${route}["']`), `route siswa ${route} belum terdaftar`)
  }
  assert.match(app, /<Route path="\*" element=\{<Navigate to="\/" replace \/>\} \/>/)
  assert.doesNotMatch(mobileSiswa, /path:\s*['"]\/siswa\/[^'"]+['"][^\n]*undefined/)
})

test('settings memvalidasi dan membaca balik pintasan yang disimpan', () => {
  const route = block(server, "app.put('/api/settings'", "app.post('/api/settings/logo'")
  assert.match(route, /Array\.isArray\(dashboard_quick_menus\)/)
  assert.match(route, /status\(400\)[\s\S]*dashboard_quick_menus/)
  assert.match(route, /dashboard_quick_menus:\s*JSON\.parse\(quickMenus\)/)
  assert.match(settings, /const saved = await api\.put\('\/settings'/)
  assert.match(settings, /saved\.data\.dashboard_quick_menus/)
})

test('jenjang QR mencakup alias formal serta fallback PT dan nonformal', () => {
  for (const value of ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'MAK', 'PT', 'NF']) {
    assert.match(jenjang, new RegExp(`value: '${value}'`), `opsi jenjang ${value} hilang`)
  }
  assert.match(server, /\['RA', 'TK', 'MI', 'SD'\]\.includes\(jenjang\)/)
  assert.match(server, /\['MTs', 'SMP', 'MA', 'SMA', 'SMK', 'MAK', 'PT', 'NF'\]\.includes\(jenjang\)/)
})

test('switch role kepala-guru terlihat di header desktop, mobile, sidebar, dan bottom nav', () => {
  for (const source of [header, mobileHeader, sidebar, bottomNav]) {
    assert.match(source, /can_teach/)
    assert.match(source, /Mode Guru/)
    assert.match(source, /Mode Manajemen/)
  }
})

test('Buku Kas bendahara memiliki route, menu, CRUD tenant-aware, dan saldo berjalan', () => {
  assert.match(app, /import BukuKasPage/)
  assert.match(app, /<Route path="buku-kas" element=\{<BukuKasPage \/>\} \/>/)
  assert.match(sidebar, /Buku Kas[\s\S]*\/admin\/buku-kas/)
  assert.match(bottomNav, /Buku Kas[\s\S]*\/admin\/buku-kas/)
  const api = block(server, '// ==================== BUKU KAS', '// ==================== LAPORAN MINGGUAN')
  assert.match(api, /app\.get\('\/api\/buku-kas'/)
  assert.match(api, /app\.post\('\/api\/buku-kas'/)
  assert.match(api, /app\.put\('\/api\/buku-kas\/:id'/)
  assert.match(api, /app\.delete\('\/api\/buku-kas\/:id'/)
  assert.match(api, /WHERE t\.tenant_id=\?/)
  assert.match(api, /saldo/)
  const page = read('src/pages/admin/BukuKasPage.tsx')
  for (const label of ['NO', 'TGL', 'HARI', 'URAIAN', 'DEBET', 'KREDIT', 'SALDO']) assert.match(page, new RegExp(label))
})
