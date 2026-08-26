// Backup ke Google Drive (per-tenant) — modul terpisah.
// Mount: registerBackupRoutes(app, db, { requireRole, uuid })
// Routes (untuk feature-gate 'backup_drive' → prefix /api/backup, /api/google-drive):
//   POST /api/backup/run
//   GET  /api/backup/log
//   GET  /api/backup/config
//   PUT  /api/backup/config
//   GET  /api/google-drive/status
//
// Google Drive diakses lewat REST + service-account JWT ATAU OAuth2 refresh token (tanpa dependency googleapis).
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const fs = require('node:fs')

const CREDENTIAL_DIR = process.env.GOOGLE_DRIVE_CREDENTIAL_DIR || '/www/wwwroot/jurnal.cc.cd/var/credentials/google-drive'
const SA_FALLBACK = `${CREDENTIAL_DIR}/service-account.json`
const OAUTH_TOKEN_FALLBACK = `${CREDENTIAL_DIR}/oauth-token.json`
const OAUTH_CLIENT_FALLBACK = `${CREDENTIAL_DIR}/oauth-client.json`
const OAUTH_REDIRECT_URI = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || 'https://jurnal.cc.cd/api/google-drive/oauth/callback'

function setupBackupTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      drive_file_id TEXT,
      size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ok',
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_backup_log_tenant ON backup_log(tenant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS backup_config (
      tenant_id TEXT PRIMARY KEY,
      folder_id TEXT,
      auto_enabled INTEGER DEFAULT 0,
      retention_days INTEGER DEFAULT 14,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS google_drive_oauth_state (
      state TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `)
}

// --- Auth mode detection & loading ---
function credentialPaths() {
  return {
    service_account: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_FILE || SA_FALLBACK,
    oauth_token: process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE || OAUTH_TOKEN_FALLBACK,
    oauth_client: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE || OAUTH_CLIENT_FALLBACK,
  }
}

function tenantTokenPath(tenantId) {
  const safe = String(tenantId || 'tenant').replace(/[^a-z0-9_-]/gi, '_')
  return `${CREDENTIAL_DIR}/oauth-token-${safe}.json`
}

function oauthClient() {
  const data = readJsonCredential(credentialPaths().oauth_client, 'OAuth client')
  const web = data?.web || data?.installed || {}
  if (!web.client_id || !web.client_secret || !web.token_uri) throw new Error('JSON OAuth client tidak lengkap')
  return { ...web, redirect_uri: OAUTH_REDIRECT_URI }
}

function readJsonCredential(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (e) {
    if (e?.code === 'ENOENT') return null
    if (e instanceof SyntaxError) throw new Error(`JSON ${label} tidak valid`)
    throw new Error(`${label} tidak dapat dibaca`)
  }
}

function credentialMode() {
  const preferred = String(process.env.GOOGLE_DRIVE_AUTH_MODE || 'auto').toLowerCase()
  if (!['auto', 'oauth2', 'service_account'].includes(preferred)) {
    throw new Error('GOOGLE_DRIVE_AUTH_MODE harus auto, oauth2, atau service_account')
  }
  return preferred
}

function availableAuth(tenantId) {
  const paths = credentialPaths()
  if (tenantId) {
    const perTenant = tenantTokenPath(tenantId)
    if (fs.existsSync(perTenant)) paths.oauth_token = perTenant
  }
  const preferred = credentialMode()
  const auths = []
  const sa = readJsonCredential(paths.service_account, 'service account')
  if (sa) {
    if (sa.type !== 'service_account' || !sa.client_email || !sa.private_key) {
      if (preferred === 'service_account') throw new Error('JSON service account tidak lengkap')
    } else {
      auths.push({ type: 'service_account', sa })
    }
  }

  const tokenData = readJsonCredential(paths.oauth_token, 'OAuth token')
  const clientData = readJsonCredential(paths.oauth_client, 'OAuth client')
  if (tokenData || clientData) {
    const web = clientData?.web || clientData?.installed || {}
    if (!tokenData?.refresh_token || !web.client_id || !web.client_secret || !web.token_uri) {
      if (preferred === 'oauth2') throw new Error('JSON OAuth token/client tidak lengkap')
    } else {
      auths.push({
        type: 'oauth2',
        refresh_token: tokenData.refresh_token,
        client_id: web.client_id,
        client_secret: web.client_secret,
        token_uri: web.token_uri,
        scopes: tokenData.scope || 'https://www.googleapis.com/auth/drive.file',
        token_file: paths.oauth_token,
      })
    }
  }
  return auths
}

async function loadAuth(tenantId) {
  const preferred = credentialMode()
  const auths = availableAuth(tenantId)
  if (!auths.length) throw new Error('Tidak ada kredensial Google Drive yang valid. Butuh service-account JSON atau OAuth2 refresh token.')
  if (preferred === 'auto') return auths[0]
  const selected = auths.find(auth => auth.type === preferred)
  if (!selected) throw new Error(`Kredensial Google Drive mode ${preferred} tidak tersedia`)
  return selected
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Mint OAuth2 access token via service-account JWT grant (scope drive.file)
async function getAccessTokenSA(sa) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  const signature = b64url(signer.sign(sa.private_key))
  const assertion = `${signingInput}.${signature}`

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString()

  const resp = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await resp.json()
  if (!resp.ok || !data.access_token) throw new Error('gagal ambil access token (SA): ' + (data.error_description || data.error || resp.status))
  return data.access_token
}

// Mint OAuth2 access token via refresh token grant
async function getAccessTokenOAuth2(auth) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: auth.refresh_token,
    client_id: auth.client_id,
    client_secret: auth.client_secret,
    scope: auth.scopes,
  }).toString()

  const resp = await fetch(auth.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await resp.json()
  if (!resp.ok || !data.access_token) throw new Error('gagal ambil access token (OAuth2): ' + (data.error_description || data.error || resp.status))
  
  // Update token file if Google rotates the refresh token.
  if (data.refresh_token && data.refresh_token !== auth.refresh_token) {
    const tokenData = JSON.parse(fs.readFileSync(auth.token_file, 'utf8'))
    tokenData.access_token = data.access_token
    tokenData.refresh_token = data.refresh_token
    tokenData.expires_in = data.expires_in
    tokenData.token_type = data.token_type
    tokenData.scope = data.scope || auth.scopes
    tokenData.created = Math.floor(Date.now() / 1000)
    fs.writeFileSync(auth.token_file, JSON.stringify(tokenData, null, 2), { mode: 0o600 })
  }
  return data.access_token
}

// Unified getAccessToken
async function getAccessToken(auth) {
  if (auth.type === 'service_account') return getAccessTokenSA(auth.sa)
  return getAccessTokenOAuth2(auth)
}

async function resolveWorkingAuth(tenantId) {
  const preferred = String(process.env.GOOGLE_DRIVE_AUTH_MODE || 'auto').toLowerCase()
  const auths = availableAuth(tenantId)
  if (!auths.length) return { auth: await loadAuth(tenantId), token: null }
  const ordered = preferred === 'auto' ? auths : [await loadAuth(tenantId)]
  const failures = []
  for (const auth of ordered) {
    try { return { auth, token: await getAccessToken(auth) } }
    catch (e) { failures.push(`${auth.type}: ${String(e.message || e)}`) }
  }
  throw new Error(`Semua metode autentikasi Google Drive gagal (${failures.join('; ')})`)
}

// Multipart upload ke Drive (metadata + media), return file id
async function driveUpload(token, { name, folderId, buffer, mimeType }) {
  const boundary = 'bkp' + crypto.randomBytes(12).toString('hex')
  const metadata = { name, ...(folderId ? { parents: [folderId] } : {}) }
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  )
  const post = Buffer.from(`\r\n--${boundary}--\r\n`)
  const payload = Buffer.concat([pre, buffer, post])

  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: payload,
  })
  const data = await resp.json()
  if (!resp.ok || !data.id) throw new Error('upload Drive gagal: ' + (data.error?.message || resp.status))
  return data.id
}

// Export semua tabel yang punya kolom tenant_id, filter tenant → objek {table: rows[]}
function exportTenantData(db, tenantId) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
  const out = {}
  for (const { name } of tables) {
    let cols
    try { cols = db.prepare(`PRAGMA table_info(${name})`).all() } catch { continue }
    if (!cols.some(c => c.name === 'tenant_id')) continue
    try {
      out[name] = db.prepare(`SELECT * FROM ${name} WHERE tenant_id = ?`).all(tenantId)
    } catch { /* skip tabel bermasalah */ }
  }
  return out
}

function tsStamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function registerBackupRoutes(app, db, { requireRole, uuid }) {
  const kadmin = requireRole('admin', 'super_admin')

  const getConfig = (tenantId) =>
    db.prepare('SELECT tenant_id, folder_id, auto_enabled, retention_days FROM backup_config WHERE tenant_id = ?').get(tenantId)
    || { tenant_id: tenantId, folder_id: null, auto_enabled: 0, retention_days: 14 }

  app.get('/api/google-drive/oauth/start', kadmin, (req, res) => {
    try {
      const client = oauthClient()
      const state = crypto.randomBytes(32).toString('hex')
      db.prepare('DELETE FROM google_drive_oauth_state WHERE expires_at < ?').run(Math.floor(Date.now() / 1000))
      db.prepare('INSERT INTO google_drive_oauth_state (state, tenant_id, expires_at) VALUES (?,?,?)')
        .run(state, req.tenantId, Math.floor(Date.now() / 1000) + 600)
      const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: OAUTH_REDIRECT_URI, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/drive.file', state })
      res.json({ authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
    } catch (e) { res.status(500).json({ error: String(e.message || e) }) }
  })

  app.get('/api/google-drive/oauth/callback', async (req, res) => {
    const { code, state, error } = req.query || {}
    if (error) return res.status(400).send('Otorisasi Google dibatalkan. Silakan tutup halaman ini.')
    if (!code || !state) return res.status(400).send('Callback OAuth tidak lengkap.')
    const row = db.prepare('SELECT * FROM google_drive_oauth_state WHERE state = ? AND expires_at >= ?').get(String(state), Math.floor(Date.now() / 1000))
    db.prepare('DELETE FROM google_drive_oauth_state WHERE state = ?').run(String(state))
    if (!row) return res.status(400).send('State OAuth tidak valid atau sudah kedaluwarsa.')
    try {
      const client = oauthClient()
      const body = new URLSearchParams({ code: String(code), client_id: client.client_id, client_secret: client.client_secret, redirect_uri: OAUTH_REDIRECT_URI, grant_type: 'authorization_code' }).toString()
      const tokenResp = await fetch(client.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      const token = await tokenResp.json()
      if (!tokenResp.ok || !token.refresh_token) throw new Error(token.error_description || token.error || 'Google tidak mengembalikan refresh token')
      const file = tenantTokenPath(row.tenant_id)
      fs.mkdirSync(CREDENTIAL_DIR, { recursive: true, mode: 0o700 })
      fs.writeFileSync(file, JSON.stringify({ ...token, created: Math.floor(Date.now() / 1000) }, null, 2), { mode: 0o600 })
      res.send('Google Drive berhasil terhubung ke tenant ini. Anda dapat menutup halaman ini.')
    } catch (e) { res.status(502).send(`Koneksi Google Drive gagal: ${String(e.message || e)}`) }
  })

  // Status koneksi Google Drive
  app.get('/api/google-drive/status', kadmin, async (req, res) => {
    try {
      const { auth, token } = await resolveWorkingAuth(req.tenantId)
      const cfg = getConfig(req.tenantId)
      const folderId = cfg.folder_id || process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || null
      let folder_ok = false
      try {
        if (folderId) {
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true&fields=id,name`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          folder_ok = r.ok
        } else {
          folder_ok = true // token OK, folder pakai default nanti
        }
        const email = auth.type === 'service_account' ? auth.sa.client_email : `oauth2:${auth.client_id}`
        return res.json({ connected: true, email, folder_id: folderId, folder_ok, auth_type: auth.type })
      } catch (e) {
        const email = auth.type === 'service_account' ? auth.sa.client_email : `oauth2:${auth.client_id}`
        return res.json({ connected: false, email, folder_id: folderId, folder_ok: false, error: String(e.message || e), auth_type: auth.type })
      }
    } catch (e) {
      return res.json({ connected: false, error: String(e.message || e) })
    }
  })

  // Jalankan backup sekarang
  app.post('/api/backup/run', kadmin, async (req, res) => {
    const id = uuid()
    const tenant = db.prepare('SELECT slug FROM tenants WHERE id = ?').get(req.tenantId)
    const slug = (tenant?.slug || req.tenantId || 'tenant').replace(/[^a-z0-9_-]/gi, '_')
    const filename = `jurnal-${slug}-${tsStamp()}.json.gz`
    try {
      const { token } = await resolveWorkingAuth(req.tenantId)
      const cfg = getConfig(req.tenantId)
      const folderId = cfg.folder_id || process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || null

      const data = exportTenantData(db, req.tenantId)
      const json = JSON.stringify({ tenant_id: req.tenantId, slug, exported_at: new Date().toISOString(), data })
      const gz = zlib.gzipSync(Buffer.from(json, 'utf8'))

      const driveFileId = await driveUpload(token, { name: filename, folderId, buffer: gz, mimeType: 'application/gzip' })

      db.prepare('INSERT INTO backup_log (id, tenant_id, filename, drive_file_id, size, status) VALUES (?,?,?,?,?,?)')
        .run(id, req.tenantId, filename, driveFileId, gz.length, 'ok')
      res.json({ id, drive_file_id: driveFileId, size: gz.length, filename })
    } catch (e) {
      const msg = String(e.message || e)
      try {
        db.prepare('INSERT INTO backup_log (id, tenant_id, filename, drive_file_id, size, status, error) VALUES (?,?,?,?,?,?,?)')
          .run(id, req.tenantId, filename, null, 0, 'error', msg)
      } catch {}
      res.status(500).json({ error: 'Backup gagal: ' + msg })
    }
  })

  // Riwayat backup
  app.get('/api/backup/log', kadmin, (req, res) => {
    res.json(db.prepare('SELECT * FROM backup_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50').all(req.tenantId))
  })

  // Config
  app.get('/api/backup/config', kadmin, (req, res) => {
    res.json(getConfig(req.tenantId))
  })

  app.put('/api/backup/config', kadmin, (req, res) => {
    const { folder_id, auto_enabled, retention_days } = req.body || {}
    const rd = Number(retention_days)
    if (retention_days !== undefined && (!Number.isInteger(rd) || rd < 1 || rd > 365)) {
      return res.status(400).json({ error: 'retention_days harus 1–365' })
    }
    const cur = getConfig(req.tenantId)
    db.prepare(`INSERT INTO backup_config (tenant_id, folder_id, auto_enabled, retention_days, updated_at)
                VALUES (?,?,?,?,datetime('now'))
                ON CONFLICT(tenant_id) DO UPDATE SET folder_id=excluded.folder_id, auto_enabled=excluded.auto_enabled, retention_days=excluded.retention_days, updated_at=datetime('now')`)
      .run(
        req.tenantId,
        folder_id !== undefined ? (folder_id || null) : (cur.folder_id || null),
        auto_enabled !== undefined ? (auto_enabled ? 1 : 0) : (cur.auto_enabled || 0),
        retention_days !== undefined ? rd : (cur.retention_days || 14),
      )
    res.json(getConfig(req.tenantId))
  })
}

module.exports = { setupBackupTables, registerBackupRoutes, loadAuth, resolveWorkingAuth }