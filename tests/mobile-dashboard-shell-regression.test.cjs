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

test('guru and siswa mobile heroes reserve an independent row for account actions', () => {
  for (const file of [
    'src/pages/guru/MobileGuruDashboard.tsx',
    'src/pages/siswa/MobileSiswaDashboard.tsx',
  ]) {
    const source = read(file)
    assert.match(source, /data-mobile-account-row="true"/)
    assert.match(source, /data-mobile-identity-row="true"/)
    // The two must be SEPARATE containers so a long name can never sit under the
    // account buttons. Source order is free: the reference design puts identity
    // first (left) with the actions right-aligned beside it.
    const accountIdx = source.indexOf('data-mobile-account-row="true"')
    const identityIdx = source.indexOf('data-mobile-identity-row="true"')
    assert.notStrictEqual(accountIdx, -1)
    assert.notStrictEqual(identityIdx, -1)
    assert.notStrictEqual(accountIdx, identityIdx)
    // MobileHeader must live inside the account row, not the identity row.
    const accountBlock = source.slice(accountIdx, accountIdx + 1200)
    assert.match(accountBlock, /<MobileHeader/)
  }
})

test('guru and siswa mobile dashboards use compact hero card and section spacing', () => {
  for (const file of [
    'src/pages/guru/MobileGuruDashboard.tsx',
    'src/pages/siswa/MobileSiswaDashboard.tsx',
  ]) {
    const source = read(file)
    assert.match(source, /data-mobile-compact-dashboard="true"/)
    // content column stays on the tight 12-16px gutter with a small section rhythm
    assert.match(source, /data-mobile-compact-dashboard="true" className="px-[34] [^"]*space-y-[34]/)
    // the original oversized hero padding must never come back
    assert.doesNotMatch(source, /px-5 pt-12 pb-8/)
  }
})
