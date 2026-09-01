const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
const app = read('src/App.tsx')
const login = read('src/pages/auth/LoginPage.tsx')
const settings = read('src/stores/settingsStore.ts')
const server = read('server/index.cjs')

test('branding tenant dimuat sebelum login dari endpoint settings publik', () => {
  assert.match(app, /if \(!isAuthenticated\) useSettingsStore\.setState\(\{ settings: \{\} \}\)/)
  assert.match(app, /void loadSettings\(\)/)
  assert.match(login, /const logo = settings\.logo \|\| '\/logo-jurnalku-256\.png'/)
  assert.match(server, /app\.get\('\/api\/settings', \(req, res\) => \{[\s\S]*?req\.tenantId/)
})

test('settings login tidak menggunakan cache browser lama', () => {
  assert.match(settings, /api\.get\('\/settings', \{ headers: \{ 'Cache-Control': 'no-cache' \} \}\)/)
})

test('tenant favicon dan Apple icon memakai konfigurasi tenant sebelum fallback', () => {
  assert.match(server, /const configured = s\.pwa_icon \|\| s\.logo \|\| '\/logo-jurnalku-256\.png'/)
  assert.match(server, /app\.get\('\/favicon\.ico', \(req, res\) => sendTenantIcon\(req, res, 64\)\)/)
  assert.match(server, /app\.get\('\/apple-touch-icon\.png', \(req, res\) => sendTenantIcon\(req, res, 192\)\)/)
})
