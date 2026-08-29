const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const server = read('server/index.cjs')
const tenant = read('server/tenant.cjs')
const siswa = read('src/pages/admin/DataSiswaPage.tsx')
const settings = read('src/pages/admin/SettingsPage.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')

test('uploads use a configurable persistent root and missing media never falls through to SPA HTML', () => {
  assert.match(server, /process\.env\.MEDIA_ROOT/)
  assert.match(server, /fs\.mkdirSync\(UPLOAD_DIR, \{ recursive: true \}\)/)
  assert.match(server, /app\.use\('\/uploads', express\.static\(UPLOAD_DIR/)
  assert.match(server, /app\.use\('\/uploads', \(_req, res\) => res\.status\(404\)/)
})

test('profile, GTK, student, and tenant branding images use validated collision-safe uploads', () => {
  assert.match(server, /const imageUpload = multer/)
  assert.match(server, /fileSize: 5 \* 1024 \* 1024/)
  assert.match(server, /\^image\\\/\(png\|jpeg\|webp\)\$/)
  assert.match(server, /crypto\.randomBytes\(16\)/)
  for (const route of ['/api/auth/avatar', '/api/settings/logo', '/api/settings/background', '/api/siswa/:id/foto', '/api/gtk/:id/foto']) {
    assert.ok(server.includes(`app.post('${route}'`), `missing ${route}`)
    const routeSource = server.slice(server.indexOf(`app.post('${route}'`), server.indexOf(`app.post('${route}'`) + 160)
    assert.match(routeSource, /imageUpload\.single/)
  }
})

test('database is only updated when the target tenant record exists', () => {
  const siswaRoute = server.match(/app\.post\('\/api\/siswa\/:id\/foto'[\s\S]*?\n}\)\n/)?.[0] || ''
  const gtkRoute = server.match(/app\.post\('\/api\/gtk\/:id\/foto'[\s\S]*?\n}\)\n/)?.[0] || ''
  assert.match(siswaRoute, /\.run\(foto, req\.params\.id, req\.tenantId\)\.changes/)
  assert.match(gtkRoute, /\.run\(foto, req\.params\.id, req\.tenantId\)\.changes/)
  assert.match(siswaRoute, /404/)
  assert.match(gtkRoute, /404/)
})

test('favicon is a real tenant image and broken student or branding images have fallbacks', () => {
  assert.match(server, /app\.get\('\/favicon\.ico'/)
  assert.match(server, /sendTenantIcon/)
  assert.match(server, /ORDER BY updated_at DESC, id DESC LIMIT 1/)
  assert.match(server, /if \(!\['masuk', 'pulang'\]\.includes\(type\)\)/)
  assert.match(server, /Asset not found/)
  assert.match(server, /Cache-Control', 'public, max-age=31536000, immutable'/)
  assert.match(siswa, /onError/)
  assert.match(settings, /onError/)
  assert.match(sidebar, /onError/)
  assert.match(tenant, /\['\/favicon\.ico', '\/apple-touch-icon\.png'\]/)
  assert.doesNotMatch(tenant, /host !== BASE_DOMAIN && host !== 'localhost'/)
})

test('media responses disable MIME sniffing and cache successful immutable uploads', () => {
  assert.match(server, /immutable: true/)
  assert.match(server, /X-Content-Type-Options', 'nosniff'/)
})

test('student partial updates preserve omitted fields and validate rombel within the tenant', () => {
  const route = server.match(/app\.put\('\/api\/siswa\/:id'[\s\S]*?\n}\)\n/)?.[0] || ''
  assert.match(route, /SELECT \* FROM siswa WHERE id[= ]+\? AND tenant_id[= ]+\?/)

  assert.match(route, /Object\.prototype\.hasOwnProperty\.call\(body, field\)/)
  assert.match(route, /updates\.includes\('rombel_id'\)/)
  assert.match(route, /SELECT id FROM rombel WHERE id[= ]+\? AND tenant_id[= ]+\?/)
  assert.match(route, /UPDATE siswa SET/)
  assert.match(server, /app\.get\('\/api\/siswa\/:id', authMiddleware/)
  assert.match(server, /app\.get\('\/api\/rombel\/:id\/siswa', ADMIN/)
  assert.match(server, /app\.put\('\/api\/siswa\/:id', ADMIN/)
})

test('foundation picker and cross-tenant lists have matching scoped contracts', () => {
  const fs = require('fs')
  const path = require('path')
  const tenant = fs.readFileSync(path.join(__dirname, '..', 'server', 'tenant.cjs'), 'utf8')
  const picker = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'FoundationTenantPicker.tsx'), 'utf8')
  const siswaPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
  const gtkPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'DataGTKPage.tsx'), 'utf8')
  assert.match(tenant, /app\.get\('\/api\/foundations\/tenants', authMiddleware/)
  assert.match(tenant, /app\.get\('\/api\/foundation\/students', authMiddleware/)
  assert.match(tenant, /app\.get\('\/api\/foundation\/gtk', authMiddleware/)
  assert.match(picker, /onClick=\{\(\) => handleSelect\(null\)\}/)
  assert.match(picker, />\{placeholder\}<\/span>/)
  assert.doesNotMatch(siswaPage, /api\.post\(foundationTenantId \? '\/foundation\/students'/)
  assert.doesNotMatch(gtkPage, /api\.post\(foundationTenantId \? '\/foundation\/gtk'/)
  for (const page of [siswaPage, gtkPage]) {
    assert.match(page, /const isLocalTenant = !foundationTenantId/)
    assert.match(page, /\{isLocalTenant && <button[\s\S]*?setShowImport\(true\)[\s\S]*?<\/button>\}/)
    assert.match(page, /\{isLocalTenant && <button[\s\S]*?setShowModal\(true\)[\s\S]*?<\/button>\}/)
    assert.match(page, /\{isLocalTenant && showModal && \(/)
    assert.match(page, /\{isLocalTenant && showImport && \(/)
  }
  assert.match(siswaPage, /\{isLocalTenant && <label[\s\S]*?handleFoto\(s\.id/)
  assert.match(siswaPage, /\{isLocalTenant && <>[\s\S]*?handleEdit\(selectedSiswa\)[\s\S]*?handleDelete\(selectedSiswa\.id/)
  assert.match(gtkPage, /\{isLocalTenant && <div[\s\S]*?handleEdit\(selected\)[\s\S]*?handleDelete\(selected\.id/)
})

test('admin report actions use the registered report endpoints', () => {
  const fs = require('fs')
  const path = require('path')
  const raporPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'RaporPage.tsx'), 'utf8')
  assert.match(server, /app\.post\('\/api\/rapor\/generate', STAFF/)
  assert.match(server, /app\.post\('\/api\/rapor\/sync-rdm', ADMIN/)
  assert.match(raporPage, /api\.post\('\/rapor\/generate'/)
  assert.match(raporPage, /api\.post\('\/rapor\/sync-rdm'/)
  assert.doesNotMatch(raporPage, /api\.get\('\/rapor\/(generate|sync-rdm)'/)
})

test('Excel import modal does not expose a fake readonly foundation picker or unused API contract', () => {
  const fs = require('fs')
  const path = require('path')
  const component = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ImportExcel.tsx'), 'utf8')
  assert.doesNotMatch(component, /apiEndpoint/)
  assert.doesNotMatch(component, /onSelectTenant=\{\(\) => \{\}\}/)
})

test('cashless landing links to implemented admin modules instead of showing a placeholder', () => {
  const fs = require('fs')
  const path = require('path')
  const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'CashlessPage.tsx'), 'utf8')
  for (const route of ['/admin/cashless-topup', '/admin/cashless-bank-config', '/admin/kantin-menu', '/admin/kantin-orders', '/admin/kantin-scanner']) {
    assert.match(page, new RegExp(route.replaceAll('/', '\\/')))
  }
  assert.doesNotMatch(page, /Fitur Sedang Dikembangkan/)
})

test('rombel create and update normalize empty wali kelas and validate tenant ownership', () => {
  const create = server.match(/app\.post\('\/api\/rombel'[\s\S]*?\n}\)\n/)?.[0] || ''
  const update = server.match(/app\.put\('\/api\/rombel\/:id'[\s\S]*?\n}\)\n/)?.[0] || ''
  for (const route of [create, update]) {
    assert.match(route, /wali_kelas_id \|\| null/)
    assert.match(route, /SELECT id FROM gtk WHERE id=\? AND tenant_id=\?/)
  }
})

test('student delete is atomic and supports an explicit tenant-scoped cascade', () => {
  const route = server.match(/app\.delete\('\/api\/siswa\/:id'[\s\S]*?\n}\)\n/)?.[0] || ''
  assert.match(route, /db\.transaction\(/)
  assert.match(route, /req\.query\.force/)
  assert.match(route, /DELETE FROM users WHERE siswa_id = \? AND tenant_id = \? AND role = \?/)
  assert.match(route, /DELETE FROM .* WHERE siswa_id=\? AND tenant_id=\?/)
})
