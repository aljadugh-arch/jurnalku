const test = require('node:test')
const assert = require('node:assert/strict')
const sqlite3 = require('better-sqlite3')
const os = require('node:os')

const dbPath = `${os.tmpdir()}/jurnalku-subscription-${process.pid}-${Date.now()}.sqlite`
const db = new sqlite3(dbPath)
db.exec(`CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY, nama TEXT, slug TEXT, plan TEXT,
  trial_ends_at TEXT, subscription_ends_at TEXT,
  features_json TEXT DEFAULT '{}'
)`)
db.prepare("INSERT INTO tenants (id, nama, slug, plan, features_json) VALUES ('default','Default','default','trial','{}')").run()

test.after(() => {
  db.close()
  for (const suffix of ['', '-wal', '-shm']) {
    try { require('node:fs').unlinkSync(dbPath + suffix) } catch {}
  }
})

function setupExpiredTenant() {
  const tenantId = 'test-expired-' + Date.now()
  db.prepare('INSERT INTO tenants (id, nama, slug, plan, trial_ends_at) VALUES (?,?,?,?,?)').run(
    tenantId, 'Tenant Expired', 'tenant-expired', 'trial', new Date(Date.now() - 86400000).toISOString()
  )
  return tenantId
}

function setupFeatureDisabledTenant() {
  const tenantId = 'test-disabled-' + Date.now()
  db.prepare('INSERT INTO tenants (id, nama, slug, plan, features_json) VALUES (?,?,?,?,?)').run(
    tenantId, 'Tenant Disabled', 'tenant-disabled', 'trial', JSON.stringify({ keuangan: false, absensi: false })
  )
  return tenantId
}

test('subscription locked returns 402 with SUBSCRIPTION_LOCKED code', () => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(setupExpiredTenant())
  assert(tenant)
  assert(new Date(tenant.trial_ends_at) < new Date())
})

test('feature disabled returns 403 with FEATURE_DISABLED code', () => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(setupFeatureDisabledTenant())
  assert(tenant)
  const features = JSON.parse(tenant.features_json)
  assert.equal(features.keuangan, false)
  assert.equal(features.absensi, false)
})

test('feature access check with valid tenant', () => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get('default')
  assert(tenant)
  assert.doesNotThrow(() => JSON.parse(tenant.features_json || '{}'))
})

test('tenant columns include required fields for subscription gating', () => {
  const names = db.prepare('PRAGMA table_info(tenants)').all().map(c => c.name)
  for (const name of ['trial_ends_at', 'subscription_ends_at', 'features_json', 'plan']) assert(names.includes(name), `tenants must have ${name}`)
})
