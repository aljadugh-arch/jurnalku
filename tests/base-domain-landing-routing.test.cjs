const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
const tenant = fs.readFileSync(path.join(root, 'server/tenant.cjs'), 'utf8')

test('base domain bukan registered tenant, sedangkan subdomain tenant tetap registered', () => {
  assert.match(tenant, /registered_host: Boolean\(req\.isRegisteredTenantHost\)/)
  assert.doesNotMatch(tenant, /registered_host:[^\n]*\|\|\s*isBaseDomain/)
})

test('RootRoute menampilkan landing base domain sebelum menunggu sesi', () => {
  const rootRoute = app.match(/function RootRoute\(\)[\s\S]*?\n}\n/)?.[0] || ''
  const hostPending = rootRoute.indexOf('if (registeredHost === null)')
  const landing = rootRoute.indexOf('if (!registeredHost) return <LandingPage />')
  const session = rootRoute.indexOf('if (!authReady || (isAuthenticated && !user))')
  assert.ok(hostPending >= 0, 'guard tenant info harus ada')
  assert.ok(landing > hostPending, 'landing dipilih setelah tenant info selesai')
  assert.ok(session > landing, 'base domain harus menampilkan landing sebelum menunggu sesi')
})

test('registered tenant yang belum login diarahkan ke LoginPage', () => {
  const rootRoute = app.match(/function RootRoute\(\)[\s\S]*?\n}\n/)?.[0] || ''
  assert.match(rootRoute, /if \(!isAuthenticated\) return <Navigate to="\/login" replace \/>/)
})
