const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
const login = read('src/pages/auth/LoginPage.tsx')
const server = read('server/index.cjs')

// PWA start_url untuk host tenant terdaftar adalah '/login' (lihat server/index.cjs
// endpoint /api/pwa/manifest). Ini berarti setiap kali PWA yang sudah terinstall
// dibuka ulang (cold start), browser membuka langsung rute /login, BUKAN '/'.
// RootRoute (untuk '/') sudah menangani redirect user yang authReady+isAuthenticated
// ke dashboard-nya, tapi LoginPage tidak pernah melakukan pengecekan yang sama.
// Akibatnya token 30 hari yang masih valid di localStorage tetap ada, checkAuth()
// tetap sukses, tapi user tetap terjebak melihat form login setiap buka ulang PWA
// -- persis seperti "logout otomatis" walau sesi sebenarnya masih hidup.
test('start_url PWA untuk host tenant terdaftar adalah /login (bukan root)', () => {
  assert.match(server, /start_url: req\.isRegisteredTenantHost \? '\/login' : '\/'/)
})

test('LoginPage mengalihkan user yang authReady dan sudah authenticated ke dashboard-nya, bukan menampilkan form login', () => {
  assert.match(login, /useAuthStore\(\)/)
  assert.match(login, /isAuthenticated/)
  assert.match(login, /authReady/)
  assert.match(login, /<Navigate/)
})
