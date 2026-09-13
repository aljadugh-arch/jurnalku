const { test } = require('node:test')
const assert = require('node:assert/strict')

// Multi-canonical-domain tenant resolution: jurnal.cc.cd & jurnalmadrasah.web.id
// now share one platform/database, both usable as base for subdomain-per-tenant.

function loadTenantModule() {
  delete require.cache[require.resolve('../server/tenant.cjs')]
  return require('../server/tenant.cjs')
}

test('BASE_DOMAINS defaults include both canonical domains', () => {
  delete process.env.BASE_DOMAINS
  delete process.env.BASE_DOMAIN
  const { BASE_DOMAINS, BASE_DOMAIN } = loadTenantModule()
  assert.equal(BASE_DOMAIN, 'jurnal.cc.cd')
  assert.ok(BASE_DOMAINS.includes('jurnal.cc.cd'))
  assert.ok(BASE_DOMAINS.includes('jurnalmadrasah.web.id'))
})

test('BASE_DOMAINS respects explicit env override', () => {
  process.env.BASE_DOMAINS = 'custom1.test,custom2.test'
  const { BASE_DOMAINS } = loadTenantModule()
  assert.deepEqual(BASE_DOMAINS, ['custom1.test', 'custom2.test'])
  delete process.env.BASE_DOMAINS
})

test('tenantMiddleware resolves tenant by subdomain of ANY base domain', () => {
  delete process.env.BASE_DOMAINS
  const { tenantMiddleware } = loadTenantModule()
  const fakeTenant = { id: 't1', slug: 'mi-sunan-drajat-bektiharjo', aktif: 1 }
  const db = {
    prepare(sql) {
      return {
        get(...args) {
          if (sql.includes('WHERE slug')) {
            return args[0] === 'mi-sunan-drajat-bektiharjo' ? fakeTenant : null
          }
          if (sql.includes("id = ?") && sql.includes('default')) return { id: 'default' }
          return null
        }
      }
    }
  }
  const mw = tenantMiddleware(db)

  // subdomain under jurnalmadrasah.web.id
  let req = { path: '/api/foo', headers: { host: 'mi-sunan-drajat-bektiharjo.jurnalmadrasah.web.id' } }
  let res = {}
  let nextCalled = false
  mw(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.equal(req.tenantId, 't1')

  // same slug also resolvable under jurnal.cc.cd
  req = { path: '/api/foo', headers: { host: 'mi-sunan-drajat-bektiharjo.jurnal.cc.cd' } }
  nextCalled = false
  mw(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.equal(req.tenantId, 't1')
})

test('tenantMiddleware treats jurnalmadrasah.web.id root as canonical (not a tenant slug)', () => {
  delete process.env.BASE_DOMAINS
  const { tenantMiddleware } = loadTenantModule()
  const db = {
    prepare(sql) {
      return {
        get() {
          if (sql.includes("id = ?") ) return { id: 'default' }
          return null
        }
      }
    }
  }
  const mw = tenantMiddleware(db)
  const req = { path: '/api/foo', headers: { host: 'jurnalmadrasah.web.id' } }
  const res = {}
  let nextCalled = false
  mw(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.equal(req.tenantId, 'default')
  assert.equal(req.isRegisteredTenantHost, false)
})
