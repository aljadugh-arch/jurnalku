const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const server = read('server/index.cjs')
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
  assert.match(siswa, /onError/)
  assert.match(settings, /onError/)
  assert.match(sidebar, /onError/)
})

test('media responses disable MIME sniffing and cache successful immutable uploads', () => {
  assert.match(server, /immutable: true/)
  assert.match(server, /X-Content-Type-Options', 'nosniff'/)
})
