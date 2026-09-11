// AI provider configuration (admin default + per-guru override) + secure encryption at rest.
// Also hosts Google OAuth (Gemini via Google account) token storage helpers.
const crypto = require('node:crypto')

const ALGO = 'aes-256-gcm'

function getEncryptionKey() {
  const secret = process.env.JWT_SECRET || process.env.AI_CONFIG_SECRET || ''
  if (!secret) throw new Error('Kunci enkripsi tidak tersedia (JWT_SECRET wajib diisi)')
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptSecret(plainText) {
  const text = String(plainText ?? '').trim()
  if (!text) return ''
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

function decryptSecret(stored) {
  const value = String(stored ?? '').trim()
  if (!value) return ''
  const parts = value.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') return ''
  try {
    const key = getEncryptionKey()
    const [, ivB64, tagB64, dataB64] = parts
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const data = Buffer.from(dataB64, 'base64')
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return ''
  }
}

function maskKey(plainKey) {
  const key = String(plainKey ?? '')
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`
}

const PROVIDER_ENDPOINTS = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  custom: '',
}

function setupAiConfigTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_config (
      tenant_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'gemini',
      api_key_encrypted TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      custom_endpoint TEXT NOT NULL DEFAULT '',
      google_oauth_enabled INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_ai_config (
      user_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      api_key_encrypted TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      google_access_token_encrypted TEXT NOT NULL DEFAULT '',
      google_refresh_token_encrypted TEXT NOT NULL DEFAULT '',
      google_token_expiry TEXT,
      google_email TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
}

// Resolves the effective AI credentials for a request: user override wins, else tenant default.
// Catatan: token OAuth Google (dari tombol "Hubungkan Akun Google") TIDAK dipakai sebagai API key
// Gemini di sini — scope OAuth sengaja dibatasi ke identitas dasar (email/profile) saja supaya
// aplikasi bisa dipublikasikan tanpa proses verifikasi Google, sehingga token itu tidak diberi izin
// memanggil Generative Language API dan akan selalu ditolak (401) jika dipaksakan. OAuth Google di
// sini murni untuk menghubungkan/menampilkan identitas akun guru, bukan sumber kredensial AI.
function resolveAiConfig(db, tenantId, userId) {
  const userCfg = userId
    ? db.prepare('SELECT * FROM user_ai_config WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId)
    : null
  if (userCfg && userCfg.api_key_encrypted) {
    return {
      source: 'user',
      provider: userCfg.provider || 'gemini',
      apiKey: decryptSecret(userCfg.api_key_encrypted),
      model: userCfg.model || '',
      endpoint: PROVIDER_ENDPOINTS[userCfg.provider] || '',
    }
  }
  const tenantCfg = db.prepare('SELECT * FROM ai_config WHERE tenant_id = ?').get(tenantId)
  if (tenantCfg && tenantCfg.api_key_encrypted) {
    return {
      source: 'tenant',
      provider: tenantCfg.provider || 'gemini',
      apiKey: decryptSecret(tenantCfg.api_key_encrypted),
      model: tenantCfg.model || '',
      endpoint: tenantCfg.provider === 'custom' ? tenantCfg.custom_endpoint : (PROVIDER_ENDPOINTS[tenantCfg.provider] || ''),
    }
  }
  return null
}

module.exports = {
  encryptSecret,
  decryptSecret,
  maskKey,
  PROVIDER_ENDPOINTS,
  setupAiConfigTables,
  resolveAiConfig,
}
