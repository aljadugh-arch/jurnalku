const crypto = require('node:crypto')

const FEATURE_KEYS = ['master_data', 'jadwal', 'absensi', 'jurnal', 'penilaian', 'keuangan', 'whatsapp', 'posting', 'modul_ajar', 'backup_drive', 'website']
const PLAN_FEATURES = {
  trial: FEATURE_KEYS,
  lite: FEATURE_KEYS.filter(key => !['backup_drive', 'website'].includes(key)),
  pro: FEATURE_KEYS,
}
const FEATURE_PREFIXES = {
  master_data: ['/api/siswa', '/api/gtk', '/api/mapel', '/api/rombel', '/api/users', '/api/tahun-ajaran'],
  jadwal: ['/api/jadwal', '/api/template-jadwal', '/api/pengajar', '/api/wali-kelas', '/api/kalender-kbm', '/api/guru/jadwal', '/api/siswa/jadwal'],
  absensi: ['/api/absensi', '/api/absensi-siswa', '/api/absensi-guru', '/api/ceklok', '/api/guru/ceklok', '/api/guru/absensi-saya', '/api/ekskul', '/api/jamaah'],
  jurnal: ['/api/jurnal'],
  penilaian: ['/api/penilaian', '/api/penilaian-harian', '/api/rapor', '/api/catatan-kepribadian', '/api/supervisi'],
  keuangan: ['/api/tagihan', '/api/jenis-tagihan', '/api/tabungan', '/api/bendahara', '/api/keuangan', '/api/cashless', '/api/beasiswa'],
  whatsapp: ['/api/broadcast', '/api/wa-', '/api/notif-settings'],
  posting: ['/api/posting'],
  modul_ajar: ['/api/modul-ajar'],
  backup_drive: ['/api/backup', '/api/google-drive'],
  website: ['/api/tenant/domain', '/api/tenant/domain-status', '/api/tenant/verify-domain', '/api/posting/public'],
}

function addMonthsIso(from, months = 1) {
  const date = new Date(from)
  if (Number.isNaN(date.getTime())) throw new Error('Tanggal tidak valid')
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date.toISOString()
}

function parseFeatures(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

function accessForTenant(tenant, now = new Date()) {
  const plan = ['lite', 'pro'].includes(tenant.plan) ? tenant.plan : 'trial'
  const expiresAt = tenant.subscription_ends_at || tenant.trial_ends_at || tenant.expired_at || null
  const locked = tenant.id !== 'default' && !!expiresAt && new Date(expiresAt).getTime() <= now.getTime()
  const allowed = new Set(PLAN_FEATURES[plan] || PLAN_FEATURES.trial)
  const choices = parseFeatures(tenant.features_json)
  const features = Object.fromEntries(FEATURE_KEYS.map(key => [key, allowed.has(key) && choices[key] !== false]))
  return { plan, locked, expires_at: expiresAt, features }
}

function featureForPath(path) {
  for (const [feature, prefixes] of Object.entries(FEATURE_PREFIXES)) {
    if (prefixes.some(prefix => path === prefix || path.startsWith(prefix + '/') || (prefix.endsWith('-') && path.startsWith(prefix)))) return feature
  }
  return null
}

function normalizeFeatureSelection(input, plan) {
  const allowed = new Set(PLAN_FEATURES[plan] || PLAN_FEATURES.trial)
  return Object.fromEntries(FEATURE_KEYS.map(key => [key, allowed.has(key) && input?.[key] !== false]))
}

function generateUnlockCode() {
  return `JURNAL-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}
function hashUnlockCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex')
}

function setupSubscriptionTables(db) {
  const columns = db.prepare('PRAGMA table_info(tenants)').all()
  const add = (name, definition) => { if (!columns.some(col => col.name === name)) db.exec(`ALTER TABLE tenants ADD COLUMN ${name} ${definition}`) }
  add('trial_ends_at', 'TEXT')
  add('subscription_ends_at', 'TEXT')
  add('features_json', 'TEXT')
  // Tenant lama mendapat masa transisi/trial satu bulan sejak fitur ini pertama kali dipasang.
  db.prepare("UPDATE tenants SET trial_ends_at=datetime('now','+1 month') WHERE id!='default' AND trial_ends_at IS NULL AND subscription_ends_at IS NULL").run()
  db.prepare("UPDATE tenants SET plan='trial' WHERE plan IS NULL OR plan IN ('free','basic','enterprise')").run()
  db.exec(`CREATE TABLE IF NOT EXISTS subscription_unlock_keys (
    id TEXT PRIMARY KEY,
    code_hash TEXT UNIQUE NOT NULL,
    tenant_id TEXT NOT NULL,
    plan TEXT NOT NULL CHECK(plan IN ('lite','pro')),
    months INTEGER NOT NULL DEFAULT 1 CHECK(months BETWEEN 1 AND 24),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TEXT,
    used_by TEXT
  ); CREATE INDEX IF NOT EXISTS idx_unlock_tenant ON subscription_unlock_keys(tenant_id, used_at);`)
}

module.exports = { FEATURE_KEYS, PLAN_FEATURES, addMonthsIso, accessForTenant, featureForPath, normalizeFeatureSelection, generateUnlockCode, hashUnlockCode, setupSubscriptionTables }
