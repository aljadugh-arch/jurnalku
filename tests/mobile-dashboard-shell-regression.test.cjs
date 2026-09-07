const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('mobile and tablet hide the global header and retain desktop header', () => {
  const layout = read('src/components/layout/DashboardLayout.tsx')
  assert.match(layout, /className="hidden lg:block"[\s\S]*<Header \/>/)
})

test('admin Lihat Semua opens the complete role menu sheet', () => {
  const dashboard = read('src/pages/admin/MobileAdminDashboard.tsx')
  const sheet = read('src/components/MobileMenuSheet.tsx')
  assert.match(dashboard, /onClick=\{\(\) => setMenuOpen\(true\)\}[\s\S]*Lihat Semua/)
  assert.match(dashboard, /<MobileMenuSheet open=\{menuOpen\}/)
  assert.match(sheet, /menuForRole\(user\?\.role\)/)
  assert.match(sheet, /flattenMenu/)
})

test('mobile dashboard header owns notification theme profile password and logout actions', () => {
  const header = read('src/components/MobileHeader.tsx')
  for (const contract of [
    /onBell/,
    /toggleDark/,
    /navigate\(base \+ '\/profile'\)/,
    /navigate\(base \+ '\/change-password'\)/,
    /logout\(\)/,
  ]) assert.match(header, contract)

  for (const file of [
    'src/pages/admin/MobileAdminDashboard.tsx',
    'src/pages/admin/MobileBendaharaDashboard.tsx',
    'src/pages/guru/MobileGuruDashboard.tsx',
    'src/pages/siswa/MobileSiswaDashboard.tsx',
  ]) assert.match(read(file), /<MobileHeader/)
})

test('mobile heroes derive color from tenant settings and dark theme', () => {
  const helper = read('src/lib/applyTheme.ts')
  assert.match(helper, /export function heroColors/)
  assert.match(helper, /settings\?\.primary_color/)
  assert.match(helper, /settings\?\.sidebar_color/)
  assert.match(helper, /dark.*shade\(fallback, -38\)/)

  for (const file of [
    'src/pages/admin/MobileAdminDashboard.tsx',
    'src/pages/admin/MobileBendaharaDashboard.tsx',
    'src/pages/guru/MobileGuruDashboard.tsx',
    'src/pages/siswa/MobileSiswaDashboard.tsx',
  ]) {
    const source = read(file)
    assert.match(source, /heroColors\(settings, dark\)/)
    assert.match(source, /linear-gradient\(135deg, \$\{hero\}/)
  }
})
