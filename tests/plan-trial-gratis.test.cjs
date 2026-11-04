'use strict'
// Aturan paket:
//   - Trial 1 bulan, TANPA batas jumlah siswa.
//   - Setelah trial habis:
//       siswa <= 100 -> otomatis lanjut Gratis 6 bulan (batas 100)
//       siswa > 100  -> terkunci, harus memilih Lite/Pro/Premium
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
  const dbFile = path.join(os.tmpdir(), `jk-plan-${process.pid}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}.db`)
  const port = 49100 + Math.floor(Math.random() * 300)
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

async function tenant(jumlahSiswa, plan = 'trial') {
  const { proc, port, dbFile } = await boot()
  const base = `http://127.0.0.1:${port}`
  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama_lembaga: 'Uji Plan', nama: 'Admin', email: `plan-${crypto.randomBytes(3).toString('hex')}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000009', domain_type: 'subdomain', slug: `plan-${crypto.randomBytes(3).toString('hex')}` }),
  }).then(r => r.json())
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  const rombelId = crypto.randomUUID()
  db.prepare('INSERT INTO rombel(id,tenant_id,nama,tingkat,tahun_ajaran) VALUES(?,?,?,?,?)').run(rombelId, tenantId, 'X-1', '10', '2026/2027')
  const ins = db.prepare("INSERT INTO siswa(id,tenant_id,nama,nis,jenis_kelamin,rombel_id,status) VALUES(?,?,?,?,?,?,'aktif')")
  for (let i = 1; i <= jumlahSiswa; i++) ins.run(crypto.randomUUID(), tenantId, `Siswa ${i}`, String(i).padStart(4, '0'), 'L', rombelId)
  db.prepare("UPDATE tenants SET plan=?, trial_ends_at=datetime('now','-1 day'), subscription_ends_at=NULL WHERE id=?").run(plan, tenantId)
  return { proc, base, db, tenantId, token: reg.token }
}

test('trial TIDAK dibatasi jumlah siswa', async (t) => {
  const s = await tenant(150)
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const { kuotaTenant } = require('../server/kuota.cjs')
  const k = kuotaTenant(s.db, s.tenantId, 'siswa')
  assert.equal(k.sisa, Infinity, 'trial tidak boleh punya sisa kuota berhingga')
  s.db.close()
})

test('trial habis + siswa <=100 -> otomatis lanjut Gratis 6 bulan', async (t) => {
  const s = await tenant(50)
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const r = await fetch(s.base + '/api/siswa', { headers: { Authorization: `Bearer ${s.token}` } })
  assert.equal(r.status, 200, 'tidak boleh terkunci karena masih <=100 siswa')

  const t2 = s.db.prepare('SELECT plan, subscription_ends_at FROM tenants WHERE id=?').get(s.tenantId)
  assert.equal(t2.plan, 'gratis')
  const sisaHari = (new Date(t2.subscription_ends_at).getTime() - Date.now()) / 86400000
  assert.ok(sisaHari > 170 && sisaHari < 190, `masa gratis harus ~6 bulan, dapat ${sisaHari.toFixed(0)} hari`)

  const { kuotaTenant } = require('../server/kuota.cjs')
  assert.equal(kuotaTenant(s.db, s.tenantId, 'siswa').batas, 100, 'paket gratis dibatasi 100')
  s.db.close()
})

test('trial habis + siswa >100 -> terkunci, harus pilih paket', async (t) => {
  const s = await tenant(150)
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const r = await fetch(s.base + '/api/siswa', { headers: { Authorization: `Bearer ${s.token}` } })
  assert.equal(r.status, 402, 'harus terkunci')
  const isi = await r.json()
  assert.match(isi.error, /Pilih paket Lite, Pro, atau Premium/i)
  assert.equal(s.db.prepare('SELECT plan FROM tenants WHERE id=?').get(s.tenantId).plan, 'trial', 'tidak boleh otomatis jadi gratis')
  s.db.close()
})

test('paket gratis habis masa -> pesan menyebut lanjut berlangganan', async (t) => {
  const s = await tenant(50, 'gratis')
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const r = await fetch(s.base + '/api/siswa', { headers: { Authorization: `Bearer ${s.token}` } })
  assert.equal(r.status, 402)
  assert.match((await r.json()).error, /Masa gratis 6 bulan berakhir/i)
  s.db.close()
})
