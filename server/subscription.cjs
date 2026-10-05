const crypto = require('node:crypto')

const FEATURE_KEYS = ['master_data', 'jadwal', 'absensi', 'jurnal', 'penilaian', 'keuangan', 'whatsapp', 'posting', 'modul_ajar', 'backup_drive', 'website', 'rest_api', 'cashless', 'ekantin']
const PLAN_FEATURES = {
  trial: FEATURE_KEYS,
  lite: FEATURE_KEYS.filter(key => !['backup_drive', 'website'].includes(key)),
  pro: FEATURE_KEYS,
  // 'premium' adalah nama plan legacy (dipakai sebelum sistem trial/lite/pro
  // dirapikan) — beberapa tenant lama (termasuk tenant demo) masih menyimpan
  // nilai ini di kolom plan. Kini premium juga paket kelas satu yang bisa
  // diatur (harga & masa aktif) seperti lite/pro.
  premium: FEATURE_KEYS,
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
  modul_ajar: ['/api/modul-ajar', '/api/ai-documents'],
  backup_drive: ['/api/backup', '/api/google-drive'],
  website: ['/api/tenant/domain', '/api/tenant/domain-status', '/api/tenant/verify-domain', '/api/posting/public'],
  cashless: ['/api/cashless'],
  ekantin: ['/api/kantin'],
  rest_api: ['/api/external'],
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

function accessForTenant(tenant, now = new Date(), planDefs = null) {
  const plan = ['trial', 'lite', 'pro', 'premium'].includes(tenant.plan) ? tenant.plan : 'trial'
  // Plan 'premium' adalah grandfather/legacy plan berbayar tanpa siklus trial —
  // trial_ends_at pada tenant ini adalah sisa data lama dan tidak relevan;
  // hanya subscription_ends_at (jika pernah diset eksplisit) yang berlaku.
  const expiresAt = plan === 'premium'
    ? (tenant.subscription_ends_at || null)
    : (tenant.subscription_ends_at || tenant.trial_ends_at || tenant.expired_at || null)
  const locked = tenant.id !== 'default' && !!expiresAt && new Date(expiresAt).getTime() <= now.getTime()
  // Fitur diambil dari konfigurasi paket (subscription_plans) bila tersedia,
  // sehingga admin platform bisa mengubah isi tiap paket tanpa deploy.
  const allowed = new Set((planDefs && planDefs[plan]) || PLAN_FEATURES[plan] || PLAN_FEATURES.trial)
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

// ===================== KONFIGURASI PAKET LANGGANAN =====================
// Paket (trial/lite/pro/premium) beserta HARGA dan MASA AKTIF-nya disimpan di
// DB agar admin platform bisa mengubahnya sendiri tanpa deploy. Tabel bersifat
// global (satu konfigurasi untuk seluruh platform), bukan per-tenant.
const PLAN_KEYS = ['trial', 'lite', 'pro', 'premium']
const MASA_SATUAN = ['bulan', 'hari']
const DEFAULT_PLANS = [
  { plan: 'trial', label: 'Trial', harga: 0, masa_nilai: 1, masa_satuan: 'bulan', aktif: 1, urutan: 0 },
  { plan: 'lite', label: 'Lite', harga: 50000, masa_nilai: 1, masa_satuan: 'bulan', aktif: 1, urutan: 1 },
  { plan: 'pro', label: 'Pro', harga: 80000, masa_nilai: 1, masa_satuan: 'bulan', aktif: 1, urutan: 2 },
  { plan: 'premium', label: 'Premium', harga: 150000, masa_nilai: 1, masa_satuan: 'bulan', aktif: 1, urutan: 3 },
]

function setupSubscriptionPlans(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS subscription_plans (
    plan TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    harga INTEGER NOT NULL DEFAULT 0,
    masa_nilai INTEGER NOT NULL DEFAULT 1,
    masa_satuan TEXT NOT NULL DEFAULT 'bulan',
    aktif INTEGER NOT NULL DEFAULT 1,
    fitur_json TEXT,
    urutan INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  const ins = db.prepare(`INSERT OR IGNORE INTO subscription_plans(plan,label,harga,masa_nilai,masa_satuan,aktif,fitur_json,urutan)
    VALUES(?,?,?,?,?,?,?,?)`)
  for (const p of DEFAULT_PLANS) {
    ins.run(p.plan, p.label, p.harga, p.masa_nilai, p.masa_satuan, p.aktif, JSON.stringify(PLAN_FEATURES[p.plan] || FEATURE_KEYS), p.urutan)
  }
}

// Daftar fitur yang diizinkan untuk sebuah baris paket.
function planFeatures(row) {
  const fallback = PLAN_FEATURES[row.plan] || FEATURE_KEYS
  const parsed = parseFeatures(row.fitur_json)
  const keys = Object.keys(parsed).filter(k => FEATURE_KEYS.includes(k) && parsed[k] !== false)
  return keys.length ? keys : fallback
}

function getPlans(db) {
  return db.prepare('SELECT * FROM subscription_plans ORDER BY urutan, plan').all()
    .map(row => ({ ...row, aktif: row.aktif ? 1 : 0, fitur: planFeatures(row), fitur_json: undefined }))
}

// Peta plan -> daftar fitur, dipakai accessForTenant agar fitur mengikuti DB.
function planFeatureMap(db) {
  const map = {}
  for (const row of db.prepare('SELECT plan, fitur_json FROM subscription_plans').all()) map[row.plan] = planFeatures(row)
  return map
}

// Validasi patch paket. Mengembalikan { error } atau { values }.
function validatePlanPatch(input = {}) {
  const values = {}
  if (input.label !== undefined) {
    const label = String(input.label).trim()
    if (!label || label.length > 60) return { error: 'Nama paket wajib 1-60 karakter' }
    values.label = label
  }
  if (input.harga !== undefined) {
    const harga = Number(input.harga)
    if (!Number.isFinite(harga) || harga < 0 || harga > 999999999) return { error: 'Harga harus angka 0 - 999.999.999' }
    values.harga = Math.round(harga)
  }
  if (input.masa_nilai !== undefined) {
    const masa = Number(input.masa_nilai)
    if (!Number.isInteger(masa) || masa < 1 || masa > 3650) return { error: 'Masa aktif harus bulat 1 - 3650' }
    values.masa_nilai = masa
  }
  if (input.masa_satuan !== undefined) {
    const satuan = String(input.masa_satuan)
    if (!MASA_SATUAN.includes(satuan)) return { error: "Satuan masa harus 'bulan' atau 'hari'" }
    values.masa_satuan = satuan
  }
  if (input.aktif !== undefined) values.aktif = input.aktif ? 1 : 0
  if (input.urutan !== undefined) {
    const urutan = Number(input.urutan)
    if (!Number.isInteger(urutan) || urutan < 0 || urutan > 99) return { error: 'Urutan harus bulat 0 - 99' }
    values.urutan = urutan
  }
  if (input.fitur !== undefined) {
    if (!input.fitur || typeof input.fitur !== 'object' || Array.isArray(input.fitur)) return { error: 'Fitur harus berupa objek' }
    const fitur = {}
    for (const key of FEATURE_KEYS) if (input.fitur[key] !== undefined) fitur[key] = input.fitur[key] !== false
    values.fitur_json = JSON.stringify(fitur)
  }
  if (!Object.keys(values).length) return { error: 'Tidak ada perubahan yang dikirim' }
  return { values }
}

function updatePlan(db, plan, patch) {
  if (!PLAN_KEYS.includes(plan)) return { error: 'Paket tidak dikenal' }
  const check = validatePlanPatch(patch)
  if (check.error) return { error: check.error }
  const cols = Object.keys(check.values)
  db.prepare(`UPDATE subscription_plans SET ${cols.map(c => `${c}=?`).join(', ')}, updated_at=datetime('now') WHERE plan=?`)
    .run(...cols.map(c => check.values[c]), plan)
  const row = db.prepare('SELECT * FROM subscription_plans WHERE plan=?').get(plan)
  return { plan: { ...row, aktif: row.aktif ? 1 : 0, fitur: planFeatures(row), fitur_json: undefined } }
}

// Hitung tanggal berakhir dari titik mulai + nilai/satuan masa aktif.
function computeExpiry(fromIso, masaNilai, masaSatuan) {
  const base = new Date(fromIso)
  if (Number.isNaN(base.getTime())) throw new Error('Tanggal tidak valid')
  if (masaSatuan === 'hari') {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + Number(masaNilai))
    return d.toISOString()
  }
  return addMonthsIso(base, Number(masaNilai))
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
    plan TEXT NOT NULL,
    months INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TEXT,
    used_by TEXT
  ); CREATE INDEX IF NOT EXISTS idx_unlock_tenant ON subscription_unlock_keys(tenant_id, used_at);`)
  // Migrasi: tabel lama membatasi plan ke ('lite','pro') dan months 1-24 lewat
  // CHECK constraint, sehingga paket trial/premium & durasi panjang gagal.
  // Bangun ulang tabel bila constraint lama masih terpasang.
  const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='subscription_unlock_keys'").get()?.sql || ''
  if (ddl.includes("CHECK(plan IN ('lite','pro'))") || ddl.includes('CHECK(months BETWEEN 1 AND 24)')) {
    db.exec(`PRAGMA foreign_keys=OFF;
      ALTER TABLE subscription_unlock_keys RENAME TO subscription_unlock_keys_legacy;
      CREATE TABLE subscription_unlock_keys (
        id TEXT PRIMARY KEY,
        code_hash TEXT UNIQUE NOT NULL,
        tenant_id TEXT NOT NULL,
        plan TEXT NOT NULL,
        months INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        used_at TEXT,
        used_by TEXT
      );
      INSERT INTO subscription_unlock_keys SELECT id,code_hash,tenant_id,plan,months,created_by,created_at,used_at,used_by FROM subscription_unlock_keys_legacy;
      DROP TABLE subscription_unlock_keys_legacy;
      CREATE INDEX IF NOT EXISTS idx_unlock_tenant ON subscription_unlock_keys(tenant_id, used_at);
      PRAGMA foreign_keys=ON;`)
  }
  setupSubscriptionPlans(db)
}

module.exports = {
  FEATURE_KEYS, PLAN_FEATURES, PLAN_KEYS, MASA_SATUAN, DEFAULT_PLANS,
  addMonthsIso, computeExpiry, accessForTenant, featureForPath, normalizeFeatureSelection,
  generateUnlockCode, hashUnlockCode, setupSubscriptionTables,
  setupSubscriptionPlans, getPlans, planFeatureMap, planFeatures, validatePlanPatch, updatePlan,
}
