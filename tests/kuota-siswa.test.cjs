'use strict'
// Kuota siswa: batas dari tenants.max_siswa (default 100). Berlaku di dua pintu:
// tambah manual dan impor massal. Tes ini membuktikan keduanya benar-benar menolak.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const SECRET = 'k'.repeat(40)

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-kuota-${process.pid}-${Date.now()}.db`)
  const port = 48100 + Math.floor(Math.random() * 300)
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

async function tenantDenganKuota(kuota) {
  const { proc, port, dbFile } = await boot()
  const base = `http://127.0.0.1:${port}`
  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama_lembaga: 'Uji Kuota', nama: 'Admin', email: `kuota-${crypto.randomBytes(3).toString('hex')}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000008', domain_type: 'subdomain', slug: `kuota-${crypto.randomBytes(3).toString('hex')}` }),
  }).then(r => r.json())
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  db.prepare('UPDATE tenants SET max_siswa=? WHERE id=?').run(kuota, tenantId)
  return { proc, base, db, tenantId, token: reg.token, auth: { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' } }
}

const siswa = (nis) => ({ nama: 'Siswa ' + nis, nis, jenis_kelamin: 'L' })

test('tambah manual: siswa ke-(batas+1) ditolak 403', async (t) => {
  const s = await tenantDenganKuota(2)
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const r1 = await fetch(s.base + '/api/siswa', { method: 'POST', headers: s.auth, body: JSON.stringify(siswa('K001')) })
  assert.equal(r1.status, 200, 'siswa pertama diterima')
  const r2 = await fetch(s.base + '/api/siswa', { method: 'POST', headers: s.auth, body: JSON.stringify(siswa('K002')) })
  assert.equal(r2.status, 200, 'siswa kedua diterima (batas 2)')
  const r3 = await fetch(s.base + '/api/siswa', { method: 'POST', headers: s.auth, body: JSON.stringify(siswa('K003')) })
  assert.equal(r3.status, 403, 'siswa ketiga harus ditolak')
  const isi = await r3.json()
  assert.match(isi.error, /Kuota/i)
  assert.match(isi.error, /2\/2/)
  s.db.close()
})

test('impor massal: melebihi sisa kuota ditolak seluruhnya', async (t) => {
  const s = await tenantDenganKuota(2)
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })
  await fetch(s.base + '/api/siswa', { method: 'POST', headers: s.auth, body: JSON.stringify(siswa('M001')) })

  const impor = await fetch(s.base + '/api/siswa/bulk-import', {
    method: 'POST', headers: s.auth,
    body: JSON.stringify({ students: [siswa('M002'), siswa('M003')] }),
  })
  assert.equal(impor.status, 403)
  const isi = await impor.json()
  assert.match(isi.error, /Kuota tersisa 1/)
  const n = s.db.prepare("SELECT COUNT(*) n FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'").get(s.tenantId).n
  assert.equal(n, 1, 'tidak boleh ada siswa yang masuk sebagian')
  s.db.close()
})
