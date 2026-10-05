'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const {
  PLAN_KEYS, DEFAULT_PLANS, setupSubscriptionPlans, getPlans, planFeatureMap,
  validatePlanPatch, updatePlan, computeExpiry, accessForTenant, setupSubscriptionTables,
} = require('./subscription.cjs')

function freshDb() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT, slug TEXT, plan TEXT,
    trial_ends_at TEXT, subscription_ends_at TEXT, features_json TEXT, expired_at TEXT, aktif INTEGER DEFAULT 1)`)
  db.prepare("INSERT INTO tenants(id,nama,slug,plan) VALUES('default','Platform','platform','pro')").run()
  setupSubscriptionTables(db)
  return db
}

test('setupSubscriptionPlans menyemai 4 paket trial/lite/pro/premium', () => {
  const db = freshDb()
  const plans = getPlans(db)
  assert.deepEqual(plans.map(p => p.plan).sort(), ['lite', 'premium', 'pro', 'trial'])
  assert.equal(plans.length, 4)
  assert.equal(PLAN_KEYS.length, 4)
  db.close()
})

test('harga default sesuai nilai lama (lite 50k, pro 80k) + premium baru', () => {
  const db = freshDb()
  const byPlan = Object.fromEntries(getPlans(db).map(p => [p.plan, p]))
  assert.equal(byPlan.trial.harga, 0)
  assert.equal(byPlan.lite.harga, 50000)
  assert.equal(byPlan.pro.harga, 80000)
  assert.equal(byPlan.premium.harga, 150000)
  assert.equal(byPlan.premium.masa_nilai, 1)
  db.close()
})

test('updatePlan mengubah HARGA dan tercermin di getPlans', () => {
  const db = freshDb()
  const r = updatePlan(db, 'pro', { harga: 125000 })
  assert.equal(r.error, undefined)
  assert.equal(r.plan.harga, 125000)
  assert.equal(getPlans(db).find(p => p.plan === 'pro').harga, 125000)
  db.close()
})

test('updatePlan mengubah MASA AKTIF (nilai + satuan)', () => {
  const db = freshDb()
  updatePlan(db, 'trial', { masa_nilai: 14, masa_satuan: 'hari' })
  const trial = getPlans(db).find(p => p.plan === 'trial')
  assert.equal(trial.masa_nilai, 14)
  assert.equal(trial.masa_satuan, 'hari')
  updatePlan(db, 'premium', { masa_nilai: 12, masa_satuan: 'bulan' })
  assert.equal(getPlans(db).find(p => p.plan === 'premium').masa_nilai, 12)
  db.close()
})

test('validatePlanPatch menolak harga/masa/satuan tidak valid', () => {
  assert.ok(validatePlanPatch({ harga: -1 }).error)
  assert.ok(validatePlanPatch({ harga: 'abc' }).error)
  assert.ok(validatePlanPatch({ masa_nilai: 0 }).error)
  assert.ok(validatePlanPatch({ masa_nilai: 1.5 }).error)
  assert.ok(validatePlanPatch({ masa_satuan: 'tahun' }).error)
  assert.ok(validatePlanPatch({}).error)
  assert.equal(validatePlanPatch({ harga: 99000, masa_nilai: 3, masa_satuan: 'bulan' }).error, undefined)
})

test('updatePlan menolak paket tak dikenal', () => {
  const db = freshDb()
  assert.ok(updatePlan(db, 'enterprise', { harga: 1 }).error)
  db.close()
})

test('computeExpiry: bulan dan hari', () => {
  // 31 Jan + 1 bulan -> 28/29 Feb (klip akhir bulan)
  assert.equal(computeExpiry('2026-01-31T00:00:00.000Z', 1, 'bulan').slice(0, 10), '2026-02-28')
  assert.equal(computeExpiry('2026-10-05T00:00:00.000Z', 10, 'hari').slice(0, 10), '2026-10-15')
  assert.throws(() => computeExpiry('bukan-tanggal', 1, 'bulan'))
})

test('fitur paket mengikuti DB (bisa diubah tanpa deploy)', () => {
  const db = freshDb()
  // Awalnya lite tidak boleh backup_drive.
  let map = planFeatureMap(db)
  assert.equal(map.lite.includes('backup_drive'), false)
  // Admin mengaktifkan backup_drive untuk lite.
  updatePlan(db, 'lite', { fitur: { ...Object.fromEntries(require('./subscription.cjs').FEATURE_KEYS.map(k => [k, true])) } })
  map = planFeatureMap(db)
  assert.equal(map.lite.includes('backup_drive'), true)
  // accessForTenant memakai peta dari DB.
  const acc = accessForTenant({ id: 't1', plan: 'lite', features_json: null }, new Date(), map)
  assert.equal(acc.features.backup_drive, true)
  db.close()
})

test('migrasi membangun ulang tabel kunci unlock lama (CHECK lite/pro)', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY, plan TEXT)`)
  // Tabel versi lama persis seperti DDL sebelumnya (ada CHECK).
  db.exec(`CREATE TABLE subscription_unlock_keys (
    id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, tenant_id TEXT NOT NULL,
    plan TEXT NOT NULL CHECK(plan IN ('lite','pro')),
    months INTEGER NOT NULL DEFAULT 1 CHECK(months BETWEEN 1 AND 24),
    created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TEXT, used_by TEXT)`)
  db.prepare("INSERT INTO subscription_unlock_keys(id,code_hash,tenant_id,plan,months,created_by) VALUES('k1','h1','t1','lite',1,'u1')").run()
  setupSubscriptionTables(db)
  // Data lama tetap ada, dan paket trial/premium kini bisa disimpan (>24 bulan juga).
  const row = db.prepare('SELECT * FROM subscription_unlock_keys WHERE id=?').get('k1')
  assert.equal(row.plan, 'lite')
  db.prepare("INSERT INTO subscription_unlock_keys(id,code_hash,tenant_id,plan,months,created_by) VALUES('k2','h2','t1','premium',36,'u1')").run()
  assert.equal(db.prepare('SELECT COUNT(*) c FROM subscription_unlock_keys').get().c, 2)
  db.close()
})

test('DEFAULT_PLANS konsisten dengan PLAN_KEYS', () => {
  assert.deepEqual(DEFAULT_PLANS.map(p => p.plan).sort(), [...PLAN_KEYS].sort())
  for (const p of DEFAULT_PLANS) assert.equal(['bulan', 'hari'].includes(p.masa_satuan), true)
})
