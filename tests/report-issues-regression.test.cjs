const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const server = read('server/index.cjs')
const subscription = read('server/subscription.cjs')
const featureAccess = read('src/lib/featureAccess.ts')
const featureSettings = read('src/components/FeatureSettings.tsx')
const absensi = read('src/pages/admin/AbsensiSiswaPage.tsx')
const settingsStore = read('src/stores/settingsStore.ts')
const serviceWorker = read('public/sw.js')
const rombel = read('src/pages/admin/RombelPage.tsx')
const modal = read('src/components/ui/Modal.tsx')

test('route siswa statis didahulukan dari route id dinamis', () => {
  const dynamic = server.lastIndexOf("app.get('/api/siswa/:id'")
  for (const route of ["app.get('/api/siswa/qr-identifiers'", "app.get('/api/siswa/dashboard'", "app.get('/api/siswa/portal'"]) {
    assert.ok(server.indexOf(route) >= 0, route)
    assert.ok(server.indexOf(route) < dynamic, `${route} harus sebelum /:id`)
  }
})

test('REST API adalah feature yang dapat dinonaktifkan', () => {
  assert.match(subscription, /['\"]rest_api['\"]/)
  assert.match(subscription, /rest_api:\s*\[['\"]\/api\/external['\"]\]/)
  assert.match(featureSettings, /rest_api/)
  assert.match(featureAccess, /rest_api.*developer-api/)
})

test('QR attendance punya unique constraint dan duplicate guard berbasis ref', () => {
  assert.match(server, /idx_absensi_siswa_unique/)
  assert.match(server, /ON CONFLICT|SQLITE_CONSTRAINT/)
  assert.match(absensi, /scanBusyRef/)
  assert.match(absensi, /lastQrRef/)
  assert.match(absensi, /qrRef\.current\?\.stop\(\)/)
})

test('modal memakai layer di atas navigasi', () => {
  assert.match(modal, /z-\[100\]/)
  assert.match(rombel, /z-\[100\]/)
})

test('settings cache dipersist dan service worker tidak cache navigasi arbitrary', () => {
  assert.match(settingsStore, /persist/)
  assert.match(settingsStore, /jurnalku_settings/)
  assert.match(serviceWorker, /request\.mode === 'navigate'/)
  assert.match(serviceWorker, /request\.destination === 'script'/)
})
