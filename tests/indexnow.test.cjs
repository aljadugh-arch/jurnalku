'use strict'
// IndexNow: kunci publik tersedia di akar host, endpoint hanya untuk superadmin.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')

const root = path.join(__dirname, '..')
const SECRET = 'k'.repeat(40)
const KEY = 'adc9a32340e681107188ff4d34c812c7'

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-now-${process.pid}-${Date.now()}.db`)
  const port = 46100 + Math.floor(Math.random() * 300)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: SECRET, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 60000
  while (Date.now() < batas && !/running/i.test(out)) await new Promise(r => setTimeout(r, 150))
  if (!/running/i.test(out)) { try { proc.kill('SIGKILL') } catch { /* abaikan */ } assert.fail('server gagal start: ' + out.slice(-400)) }
  return { proc, port }
}

test('kunci IndexNow disajikan di akar host', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const r = await fetch(`http://127.0.0.1:${port}/${KEY}.txt`, { headers: { 'X-Forwarded-Host': 'jurnalku.biz.id' } })
  assert.equal(r.status, 200)
  assert.equal((await r.text()).trim(), KEY)
})

test('endpoint IndexNow menolak non-superadmin', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const tanpa = await fetch(`http://127.0.0.1:${port}/api/seo/indexnow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.ok([401, 403].includes(tanpa.status), 'tanpa token ditolak (401/403), dapat ' + tanpa.status)

  const token = jwt.sign({ id: crypto.randomUUID(), role: 'admin', nama: 'A', email: 'a@uji.id', tenant_id: 'default' }, SECRET, { expiresIn: '1h' })
  const tolak = await fetch(`http://127.0.0.1:${port}/api/seo/indexnow`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}',
  })
  assert.equal(tolak.status, 403)
})
