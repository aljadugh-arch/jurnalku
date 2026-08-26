const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const modulePath = path.join(__dirname, '..', 'server', 'backup-drive.cjs')

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-auth-'))
  const sa = path.join(dir, 'sa.json')
  const token = path.join(dir, 'token.json')
  const client = path.join(dir, 'client.json')
  const { privateKey } = require('node:crypto').generateKeyPairSync('rsa', { modulusLength: 2048 })
  fs.writeFileSync(sa, JSON.stringify({ type: 'service_account', client_email: 'sa@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' }))
  fs.writeFileSync(token, JSON.stringify({ refresh_token: 'refresh' }))
  fs.writeFileSync(client, JSON.stringify({ web: { client_id: 'client', client_secret: 'secret', token_uri: 'https://oauth2.googleapis.com/token' } }))
  return { dir, sa, token, client }
}

function loadFresh() {
  delete require.cache[require.resolve(modulePath)]
  return require(modulePath)
}

test('OAuth dapat dipilih eksplisit meskipun service-account JSON tersedia', async () => {
  const f = fixture()
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_FILE = f.sa
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = f.token
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = f.client
  try {
    const { loadAuth } = loadFresh()
    assert.equal((await loadAuth()).type, 'oauth2')
  } finally {
    delete process.env.GOOGLE_DRIVE_AUTH_MODE
    delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_FILE
    delete process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE
    delete process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE
    fs.rmSync(f.dir, { recursive: true, force: true })
  }
})

test('mode auto mencoba OAuth jika service account gagal memperoleh token', async () => {
  let calls = 0
  global.fetch = async (_url, options) => {
    calls++
    const body = String(options.body)
    if (body.includes('jwt-bearer')) return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }
    return { ok: true, status: 200, json: async () => ({ access_token: 'oauth-access' }) }
  }
  const f = fixture()
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'auto'
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_FILE = f.sa
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = f.token
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = f.client
  try {
    const { resolveWorkingAuth } = loadFresh()
    const result = await resolveWorkingAuth()
    assert.equal(result.auth.type, 'oauth2')
    assert.equal(result.token, 'oauth-access')
    assert.equal(calls, 2)
  } finally {
    delete global.fetch
    delete process.env.GOOGLE_DRIVE_AUTH_MODE
    delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_FILE
    delete process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE
    delete process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE
    fs.rmSync(f.dir, { recursive: true, force: true })
  }
})

test('JSON kredensial invalid dilaporkan tanpa mengungkap isi rahasia', async () => {
  const f = fixture()
  fs.writeFileSync(f.token, '{invalid')
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth2'
  process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE = f.token
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE = f.client
  try {
    const { loadAuth } = loadFresh()
    await assert.rejects(loadAuth(), /JSON OAuth token tidak valid/)
  } finally {
    delete process.env.GOOGLE_DRIVE_AUTH_MODE
    delete process.env.GOOGLE_DRIVE_OAUTH_TOKEN_FILE
    delete process.env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE
    fs.rmSync(f.dir, { recursive: true, force: true })
  }
})
