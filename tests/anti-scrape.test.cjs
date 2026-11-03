'use strict'
// Anti-scraping: token demo berumur pendek & dibatasi, paginasi wajib (maks 500
// baris sekali tarik), dan batas ekspor per akun.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const SECRET = 'k'.repeat(40)
const acak = () => crypto.randomBytes(4).toString('hex')

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-scrape-${process.pid}-${Date.now()}.db`)
  const port = 44600 + Math.floor(Math.random() * 300)
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
  return { proc, port, dbFile }
}

test('token demo berumur 60 menit dan dibatasi per jam', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const base = `http://127.0.0.1:${port}`
  const H = { 'Content-Type': 'application/json', 'X-Forwarded-Host': 'jurnal.cc.cd' }

  const r = await fetch(base + '/api/auth/demo', { method: 'POST', headers: H, body: JSON.stringify({ role: 'admin' }) })
  assert.equal(r.status, 200)
  const d = await r.json()
  const isi = jwt.decode(d.token)
  assert.equal(isi.exp - isi.iat, 60 * 60, 'token demo berlaku 60 menit, bukan 30 hari')

  // Permintaan melebihi batas (30/jam) ditolak.
  let terakhir = 0
  for (let i = 0; i < 30; i++) {
    const x = await fetch(base + '/api/auth/demo', { method: 'POST', headers: H, body: JSON.stringify({ role: 'admin' }) })
    terakhir = x.status
  }
  assert.equal(terakhir, 429, 'permintaan demo melebihi batas harus 429')
})

test('paginasi: limit=0 dibatasi 500 baris dan menyatakan has_more', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const base = `http://127.0.0.1:${port}`
  const H = { 'Content-Type': 'application/json' }

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: H,
    body: JSON.stringify({ nama_lembaga: 'Uji Scrape', nama: 'Admin', email: `s-${acak()}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000007', domain_type: 'subdomain', slug: `s-${acak()}` }),
  }).then(r => r.json())
  const auth = { ...H, Authorization: `Bearer ${reg.token}` }
  const tenantId = jwt.decode(reg.token).tenant_id

  // 650 baris jurnal -> permintaan limit=0 hanya boleh mengembalikan 500.
  const db = new Database(dbFile)
  db.pragma('foreign_keys = OFF')
  const ins = db.prepare(`INSERT INTO jurnal_mengajar(id,guru_id,mapel_id,rombel_id,tanggal,jam_ke,materi,status,tenant_id)
    VALUES(?,?,?,?,?,?,?,?,?)`)
  const tx = db.transaction(() => {
    for (let i = 0; i < 650; i++) {
      ins.run(crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), '2026-11-03', String((i % 8) + 1), `Materi ${i}`, 'submitted', tenantId)
    }
  })
  tx()
  db.close()

  const r = await fetch(base + '/api/jurnal?limit=0', { headers: auth })
  const body = await r.json()
  assert.ok(Array.isArray(body.rows), 'respons berisi rows')
  assert.equal(body.rows.length, 500, 'maksimal 500 baris sekali tarik')
  assert.equal(body.limit, 500)
  assert.equal(body.has_more, true, 'klien diberi tahu masih ada sisa')
  assert.equal(body.total, 650)
})

test('UI ekspor memaginasi 500 baris per permintaan', () => {
  const s = fs.readFileSync(path.join(root, 'src/pages/admin/JurnalPage.tsx'), 'utf8')
  assert.ok(s.includes('limit: 500'), 'meminta 500 per halaman')
  assert.ok(s.includes('has_more'), 'mengikuti has_more dari server')
  assert.ok(s.includes('halaman >= 40'), 'ada batas atas halaman')
  assert.ok(!/limit: 0/.test(s), 'tidak lagi memakai limit=0')
})
