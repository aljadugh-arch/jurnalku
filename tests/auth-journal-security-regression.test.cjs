const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, '..', 'server/index.cjs'), 'utf8')

const routeBlock = (signature) => {
  const start = server.indexOf(signature)
  assert.ok(start >= 0, `route ${signature} must exist`)
  const end = server.indexOf('\napp.', start + signature.length)
  return server.slice(start, end > start ? end : server.length)
}

test('demo auth is restricted to explicit public demo hosts and default tenant', () => {
  const block = routeBlock("app.post('/api/auth/demo'")
  assert.match(block, /DEMO_HOSTS/)
  assert.match(block, /req\.hostname/)
  assert.match(block, /status\(404\)/)
  assert.match(block, /const tenantId = 'default'/)
  assert.doesNotMatch(block, /req\.tenantId \|\| 'default'/)
})

test('GTK resolver repairs stale or cross-tenant user linkage after scoped fallback', () => {
  const start = server.indexOf('function resolveGtkForUser')
  const end = server.indexOf("app.post('/api/auth/demo'", start)
  const block = server.slice(start, end)
  assert.match(block, /u\.gtk_id !== gtk\.id/)
  assert.match(block, /UPDATE users SET gtk_id = \? WHERE id = \? AND tenant_id = \?/)
})

test('journal list and supervision are reviewer-only', () => {
  assert.match(server, /app\.get\('\/api\/jurnal', JOURNAL_REVIEWER,/)
  assert.match(server, /app\.get\('\/api\/supervisi\/rekap', JOURNAL_REVIEWER,/)
})

test('journal create validates tenant-owned references and teacher ownership', () => {
  const block = routeBlock("app.post('/api/jurnal', STAFF")
  assert.match(block, /resolveGtkForUser\(req\.user\.id, req\.tenantId\)/)
  assert.match(block, /guru_id = gtk\.id/)
  assert.match(block, /FROM gtk WHERE id = \? AND tenant_id = \?/)
  assert.match(block, /FROM mapel WHERE id = \? AND tenant_id = \?/)
  assert.match(block, /FROM rombel WHERE id = \? AND tenant_id = \?/)
})

test('journal delete is reviewer-any or teacher-own, never unrestricted STAFF delete', () => {
  const block = routeBlock("app.delete('/api/jurnal/:id', STAFF")
  assert.match(block, /reviewer/)
  assert.match(block, /guru_id=\? AND tenant_id=\?/) 
  assert.match(block, /result\.changes \? 200 : 404/)
})
