const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { setupBackupTables, registerBackupRoutes } = require('../server/backup-drive.cjs')

function makeApp() {
  const routes = new Map()
  return {
    routes,
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)) },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)) },
    put(path, ...handlers) { routes.set(`PUT ${path}`, handlers.at(-1)) },
  }
}

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, nama TEXT, aktif INTEGER DEFAULT 1);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, nama TEXT, nis TEXT, nisn TEXT, nik TEXT, tenant_id TEXT);
    INSERT INTO tenants (id,slug,aktif) VALUES ('good','good',1),('bad','bad',1);
  `)
  setupBackupTables(db)
  return db
}

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return data } }
}

function installFetch(uploadPlan = ['ok']) {
  const calls = []
  let uploads = 0
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' })
    if (String(url).includes('oauth2.googleapis.com/token')) return jsonResponse({ access_token: 'test-token' })
    if (String(url).includes('/upload/drive/')) {
      const plan = uploadPlan[Math.min(uploads, uploadPlan.length - 1)]
      uploads++
      return plan === 'ok' ? jsonResponse({ id: `drive-${uploads}` }) : jsonResponse({ error: { message: 'forced' } }, 500)
    }
    if (String(url).includes('/drive/v3/files/') && options.method === 'DELETE') return jsonResponse({}, 204)
    throw new Error(`Unexpected fetch ${options.method || 'GET'} ${url}`)
  }
  return { calls, get uploads() { return uploads } }
}

function scheduler(db, now, fetchState) {
  const app = makeApp()
  let sequence = 0
  const result = registerBackupRoutes(app, db, {
    requireRole: () => (_req, _res, next) => next(), uuid: () => `uuid-${++sequence}`, mediaRoot: '/tmp/none',
    now: () => new Date(now), resolveAuth: async () => ({ token: 'test-token', auth: { type: 'test' } }),
  })
  return { ...result, app, fetchState }
}

function enable(db, tenant, schedule = '23:00', timezone = 'Asia/Jakarta', retention = 14) {
  db.prepare(`INSERT INTO backup_config (tenant_id,auto_enabled,retention_days,schedule_time,timezone)
              VALUES (?,?,?,?,?)`).run(tenant, 1, retention, schedule, timezone)
}

const oldEnv = { ...process.env }
test.afterEach(() => { process.env = { ...oldEnv }; delete global.fetch })

test('automatic backup runs once when current local time is due', async () => {
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = '/tmp/jurnalku-backup-oauth-client.json'
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = '/tmp/jurnalku-backup-oauth-token.json'
  require('node:fs').writeFileSync(process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE, JSON.stringify({ installed: { client_id:'id', client_secret:'secret', token_uri:'https://oauth2.googleapis.com/token' } }))
  require('node:fs').writeFileSync(process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE, JSON.stringify({ refresh_token:'refresh' }))
  const db = makeDb(); db.prepare("DELETE FROM tenants WHERE id='bad'").run(); enable(db, 'good')
  const f = installFetch()
  const s = scheduler(db, '2026-09-11T16:00:15.000Z', f)
  await s.automaticBackupTick()
  await s.automaticBackupTick()
  assert.equal(f.uploads, 1, JSON.stringify(db.prepare("SELECT * FROM backup_log").all()))
  assert.equal(db.prepare("SELECT status FROM backup_log WHERE tenant_id='good'").get().status, 'ok')
  assert.equal(db.prepare("SELECT last_run_key FROM backup_config WHERE tenant_id='good'").get().last_run_key, '2026-09-11')
})

test('before scheduled time does not run', async () => {
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = '/tmp/jurnalku-backup-oauth-client.json'
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = '/tmp/jurnalku-backup-oauth-token.json'
  const db = makeDb(); db.prepare("DELETE FROM tenants WHERE id='bad'").run(); enable(db, 'good', '23:00')
  const f = installFetch(); const s = scheduler(db, '2026-09-11T15:59:00.000Z', f)
  await s.automaticBackupTick()
  assert.equal(f.uploads, 0)
})

test('schedule change on the same local date does not create a second backup', async () => {
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = '/tmp/jurnalku-backup-oauth-client.json'
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = '/tmp/jurnalku-backup-oauth-token.json'
  const db = makeDb(); db.prepare("DELETE FROM tenants WHERE id='bad'").run(); enable(db, 'good', '22:00')
  const f = installFetch(); const s = scheduler(db, '2026-09-11T16:00:00.000Z', f)
  await s.automaticBackupTick()
  db.prepare("UPDATE backup_config SET schedule_time='23:00' WHERE tenant_id='good'").run()
  await s.automaticBackupTick()
  assert.equal(f.uploads, 1)
})

test('startup after scheduled time catches up exactly once that day', async () => {
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = '/tmp/jurnalku-backup-oauth-client.json'
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = '/tmp/jurnalku-backup-oauth-token.json'
  const db = makeDb(); db.prepare("DELETE FROM tenants WHERE id='bad'").run(); enable(db, 'good', '23:00')
  const f = installFetch(); const s = scheduler(db, '2026-09-11T16:17:00.000Z', f)
  await s.automaticBackupTick(); await s.automaticBackupTick()
  assert.equal(f.uploads, 1)
})

test('failure clears claim so a later tick retries', async () => {
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = '/tmp/jurnalku-backup-oauth-client.json'
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = '/tmp/jurnalku-backup-oauth-token.json'
  const db = makeDb(); db.prepare("DELETE FROM tenants WHERE id='bad'").run(); enable(db, 'good')
  const f = installFetch(['fail','ok']); const s = scheduler(db, '2026-09-11T16:00:00.000Z', f)
  await s.automaticBackupTick(); await s.automaticBackupTick()
  assert.equal(f.uploads, 2)
  assert.equal(db.prepare("SELECT last_run_key FROM backup_config WHERE tenant_id='good'").get().last_run_key, '2026-09-11')
})

test('invalid timezone for one tenant does not block another tenant', async () => {
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = '/tmp/jurnalku-backup-oauth-client.json'
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = '/tmp/jurnalku-backup-oauth-token.json'
  const db = makeDb(); enable(db, 'bad', '23:00', 'Invalid/Zone'); enable(db, 'good')
  const f = installFetch(); const s = scheduler(db, '2026-09-11T16:00:00.000Z', f)
  await s.automaticBackupTick()
  assert.equal(f.uploads, 1)
  assert.equal(db.prepare("SELECT status FROM backup_log WHERE tenant_id='bad'").get().status, 'error')
})

test('retention trashes expired Drive backups and removes their logs', async () => {
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = '/tmp/jurnalku-backup-oauth-client.json'
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = '/tmp/jurnalku-backup-oauth-token.json'
  const db = makeDb(); db.prepare("DELETE FROM tenants WHERE id='bad'").run(); enable(db, 'good', '23:00', 'Asia/Jakarta', 1)
  db.prepare("INSERT INTO backup_log(id,tenant_id,filename,drive_file_id,status,created_at) VALUES('old','good','old.gz','old-drive','ok','2026-09-01 00:00:00')").run()
  const f = installFetch(); const s = scheduler(db, '2026-09-11T16:00:00.000Z', f)
  await s.automaticBackupTick()
  assert.ok(f.calls.some(c => c.method === 'DELETE' && c.url.includes('/old-drive')))
  assert.equal(db.prepare("SELECT count(*) n FROM backup_log WHERE id='old'").get().n, 0)
})
