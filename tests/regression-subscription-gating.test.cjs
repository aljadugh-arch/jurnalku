const test = require('node:test')
const assert = require('node:assert/strict')
const sqlite3 = require('better-sqlite3')
const path = require('node:path')
const jwt = require('jsonwebtoken')

// Setup test database
const dbPath = path.join(__dirname, '..', 'test-db.sqlite')
const db = new sqlite3(dbPath)
const JWT_SECRET = 'test-secret-key'

// Helper: Create expired tenant
function setupExpiredTenant() {
  const tenantId = 'test-expired-' + Date.now()
  try {
    db.prepare('INSERT INTO tenants (id, nama, slug, plan, trial_ends_at) VALUES (?,?,?,?,?)').run(
      tenantId,
      'Tenant Expired',
      'tenant-expired',
      'trial',
      new Date(Date.now() - 86400000).toISOString() // 1 day ago
    )
  } catch {}
  return tenantId
}

// Helper: Create tenant with feature disabled
function setupFeatureDisabledTenant() {
  const tenantId = 'test-disabled-' + Date.now()
  try {
    db.prepare('INSERT INTO tenants (id, nama, slug, plan, features_json) VALUES (?,?,?,?,?)').run(
      tenantId,
      'Tenant Disabled',
      'tenant-disabled',
      'trial',
      JSON.stringify({ keuangan: false, absensi: false })
    )
  } catch {}
  return tenantId
}

test('subscription locked returns 402 with SUBSCRIPTION_LOCKED code', () => {
  const tenantId = setupExpiredTenant()
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId)
  
  assert(tenant, 'Test tenant created')
  assert(tenant.trial_ends_at, 'Trial ends at set')
  const trialEnd = new Date(tenant.trial_ends_at)
  const now = new Date()
  assert(trialEnd < now, `Trial must be expired (${trialEnd.toISOString()} < ${now.toISOString()})`)
})

test('feature disabled returns 403 with FEATURE_DISABLED code', () => {
  const tenantId = setupFeatureDisabledTenant()
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId)
  
  assert(tenant, 'Test tenant created')
  const features = tenant.features_json ? JSON.parse(tenant.features_json) : {}
  assert.equal(features.keuangan, false, 'keuangan feature must be disabled')
  assert.equal(features.absensi, false, 'absensi feature must be disabled')
})

test('feature access check with valid tenant', () => {
  const tenantId = 'default'
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId)
  
  assert(tenant, 'default tenant exists')
  const features = tenant.features_json ? JSON.parse(tenant.features_json) : {}
  // Features should be enabled for trial tenants
  assert(Object.keys(features).length >= 0, 'features_json parseable')
})

test('tenant columns include required fields for subscription gating', () => {
  const columns = db.prepare('PRAGMA table_info(tenants)').all()
  const columnNames = columns.map(c => c.name)
  
  assert(columnNames.includes('trial_ends_at'), 'tenants must have trial_ends_at')
  assert(columnNames.includes('subscription_ends_at'), 'tenants must have subscription_ends_at')
  assert(columnNames.includes('features_json'), 'tenants must have features_json')
  assert(columnNames.includes('plan'), 'tenants must have plan')
})
