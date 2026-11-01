'use strict'
// Bukti runtime: /api/jurnal benar-benar menyaring per rombel (ekspor per kelas).
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const acak = () => Math.random().toString(36).slice(2, 8)

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jurnalku-jr-${process.pid}-${Date.now()}.db`)
  const port = 41400 + Math.floor(Math.random() * 400)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: 'j'.repeat(40), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 60000
  while (Date.now() < batas && !out.includes('JURNALKU API Server running')) await new Promise(r => setTimeout(r, 150))
  if (!out.includes('JURNALKU API Server running')) { try { proc.kill('SIGKILL') } catch {} ; assert.fail('server gagal start:\n' + out.slice(-500)) }
  return { proc, port, dbFile }
}

test('filter rombel_id memisahkan jurnal per kelas', async (t) => {
  const { proc, port, dbFile } = await boot()
  const base = `http://127.0.0.1:${port}`
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })

  const email = `jr-${acak()}@uji.id`
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama_lembaga: 'Uji Jurnal', nama: 'Admin Jurnal', email, password: 'rahasia-uji-123', domain_type: 'subdomain', slug: `jr-${acak()}` }),
  }).then(r => r.json())
  assert.ok(reg.token)

  const db = new Database(dbFile, { timeout: 8000 })
  t.after(() => { try { db.close() } catch {} })
  const tenantId = db.prepare('SELECT tenant_id FROM users WHERE email=?').get(email).tenant_id
  assert.ok(tenantId)

  const mkRombel = (nama) => {
    const id = crypto.randomUUID()
    db.prepare("INSERT INTO rombel (id,nama,tingkat,tahun_ajaran,kapasitas,tenant_id) VALUES (?,?,?,?,?,?)")
      .run(id, nama, 'VII', '2026/2027', 30, tenantId)
    return id
  }
  const a = mkRombel('Kelas A')
  const b = mkRombel('Kelas B')
  const guru = crypto.randomUUID(), mapel = crypto.randomUUID()
  const gtkCols = new Set(db.prepare("PRAGMA table_info(gtk)").all().map(c => c.name))
  const insGtk = gtkCols.has('tenant_id')
    ? db.prepare("INSERT INTO gtk (id,nama,jenis_kelamin,tenant_id) VALUES (?,?,?,?)")
    : db.prepare("INSERT INTO gtk (id,nama,jenis_kelamin) VALUES (?,?,?)")
  gtkCols.has('tenant_id') ? insGtk.run(guru, 'Guru Uji', 'L', tenantId) : insGtk.run(guru, 'Guru Uji', 'L')
  const mapelCols = new Set(db.prepare("PRAGMA table_info(mapel)").all().map(c => c.name))
  const insMapel = mapelCols.has('tenant_id')
    ? db.prepare("INSERT INTO mapel (id,kode,nama,tenant_id) VALUES (?,?,?,?)")
    : db.prepare("INSERT INTO mapel (id,kode,nama) VALUES (?,?,?)")
  mapelCols.has('tenant_id') ? insMapel.run(mapel, 'UJI-1', 'Mapel Uji', tenantId) : insMapel.run(mapel, 'UJI-1', 'Mapel Uji')
  const ins = db.prepare(`INSERT INTO jurnal_mengajar (id,guru_id,mapel_id,rombel_id,tanggal,jam_ke,materi,status,tenant_id)
    VALUES (?,?,?,?,?,?,?,?,?)`)
  ins.run(crypto.randomUUID(), guru, mapel, a, '2026-11-02', 1, 'A1', 'submitted', tenantId)
  ins.run(crypto.randomUUID(), guru, mapel, a, '2026-11-02', 2, 'A2', 'submitted', tenantId)
  ins.run(crypto.randomUUID(), guru, mapel, b, '2026-11-02', 1, 'B1', 'submitted', tenantId)

  const auth = { Authorization: `Bearer ${reg.token}` }
  const ambil = async (q = '') => {
    const r = await fetch(`${base}/api/jurnal?limit=0${q}`, { headers: auth }).then(x => x.json())
    return Array.isArray(r) ? r : (r.rows || [])
  }
  assert.equal((await ambil()).length, 3, 'tanpa filter: 3 baris')
  assert.equal((await ambil(`&rombel_id=${a}`)).length, 2, 'Kelas A: 2 baris')
  assert.equal((await ambil(`&rombel_id=${b}`)).length, 1, 'Kelas B: 1 baris')
  assert.equal((await ambil('&rombel_id=tidak-ada')).length, 0, 'rombel asing: 0 baris')
})
