const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('mobile and tablet hide the global header and retain desktop header', () => {
  const layout = read('src/components/layout/DashboardLayout.tsx')
  assert.match(layout, /className="hidden lg:block"[\s\S]*<Header \/>/)
})

test('admin grid 4x2 membuka menu lengkap dari ubin Lainnya dan tombol Semua Menu', () => {
  const dashboard = read('src/pages/admin/MobileAdminDashboard.tsx')
  const sheet = read('src/components/MobileMenuSheet.tsx')
  // Ubin kedelapan (Lainnya) yang membuka menu lengkap; tombol judul dihapus.
  assert.match(dashboard, /data-admin-menu-more="true"[\s\S]{0,220}setMenuOpen\(true\)/)
  assert.match(dashboard, /Lainnya/)
  assert.doesNotMatch(dashboard, /Semua Menu/)
  assert.match(dashboard, /<MobileMenuSheet open=\{menuOpen\}/)
  assert.match(sheet, /flattenMenu\(menuForRole\(role\)\)/)
  assert.match(sheet, /Manajemen Data/)
})

test('header dashboard memegang aksi notifikasi, tema, profil, sandi, dan keluar', () => {
  const header = read('src/components/MobileHeader.tsx')
  for (const contract of [
    /onBell/,
    /toggleDark/,
    /navigate\(base \+ '\/profile'\)/,
    /navigate\(base \+ '\/change-password'\)/,
    /logout\(\)/,
  ]) assert.match(header, contract)

  // Dashboard admin & guru memakai header lembaga (yang menitipkan lonceng ke NotifBell);
  // dashboard bendahara & siswa tetap memakai MobileHeader dengan aksi lengkapnya.
  for (const file of [
    'src/pages/admin/MobileAdminDashboard.tsx',
    'src/pages/guru/MobileGuruDashboard.tsx',
  ]) assert.match(read(file), /<MobileDashboardHeader/)

  for (const file of [
    'src/pages/admin/MobileBendaharaDashboard.tsx',
    'src/pages/siswa/MobileSiswaDashboard.tsx',
  ]) assert.match(read(file), /<MobileHeader/)

  const dashHeader = read('src/components/MobileDashboardHeader.tsx')
  assert.match(dashHeader, /NotifBell/)
  assert.match(read('src/components/NotifBell.tsx'), /notifications\/feed/)
})

test('mobile heroes derive color from tenant settings and dark theme', () => {
  const helper = read('src/lib/applyTheme.ts')
  assert.match(helper, /export function heroColors/)
  assert.match(helper, /settings\?\.primary_color/)
  assert.match(helper, /settings\?\.sidebar_color/)
  assert.match(helper, /dark.*shade\(fallback, -38\)/)

  for (const file of [
    'src/pages/admin/MobileBendaharaDashboard.tsx',
    'src/pages/siswa/MobileSiswaDashboard.tsx',
  ]) {
    const source = read(file)
    assert.match(source, /heroColors\(settings, dark\)/)
    assert.match(source, /linear-gradient\(135deg, \$\{hero\},/)
  }

  // Dashboard admin & guru memakai header lembaga bersama yang mewarnai kotaknya dari
  // heroColors(settings, dark) — jadi tetap ikut warna aksen tenant + tema gelap.
  const dashHeader = read('src/components/MobileDashboardHeader.tsx')
  assert.match(dashHeader, /heroColors\(settings, dark\)/)

  const admin = read('src/pages/admin/MobileAdminDashboard.tsx')
  assert.match(admin, /dark:bg-gray-950/)

  // Peran pengguna memakai warna aksen tenant (text-primary, dari heroColors) —
  // kini di header bersama yang dipakai admin & guru.
  assert.match(dashHeader, /text-primary/)
})

test('guru and siswa mobile dashboards use compact hero card and section spacing', () => {
  for (const file of [
    'src/pages/guru/MobileGuruDashboard.tsx',
    'src/pages/siswa/MobileSiswaDashboard.tsx',
  ]) {
    const source = read(file)
    assert.match(source, /data-mobile-compact-dashboard="true"/)
    assert.doesNotMatch(source, /px-5 pt-12 pb-8/)
  }
})
