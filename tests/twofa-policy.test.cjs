'use strict'
// Kebijakan peringatan 2FA: mati secara bawaan, hanya superadmin yang bisa
// menyalakan, dan hanya berlaku untuk peran yang dipilih.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const SECRET = 'k'.repeat(40)
const acak = () => crypto.randomBytes(4).toString('hex')

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-2fa-pol-${process.pid}-${Date.now()}.db`)
  const port = 42100 + Math.floor(Math.random() * 300)
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
  if (!/running/i.test(out)) { try { proc.kill('SIGKILL') } catch {}; assert.fail('server gagal start: ' + out.slice(-400)) }
  return { proc, port, dbFile }
}

test('kebijakan 2FA lunak: bawaan mati, bisa dinyalakan superadmin', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })
  const base = `http://127.0.0.1:${port}`
  const H = { 'Content-Type': 'application/json' }

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: H,
    body: JSON.stringify({ nama_lembaga: 'Uji 2FA', nama: 'Admin', email: `p-${acak()}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000002', domain_type: 'subdomain', slug: `p-${acak()}` }),
  }).then(r => r.json())
  const adminAuth = { ...H, Authorization: `Bearer ${reg.token}` }

  // 1. Bawaan: mati.
  const awal = await fetch(base + '/api/auth/2fa/policy', { headers: adminAuth }).then(r => r.json())
  assert.equal(awal.aktif, false, 'peringatan mati secara bawaan')
  assert.equal(awal.berlaku_untuk_saya, false)

  // 2. Admin biasa tidak boleh mengubah.
  const tolak = await fetch(base + '/api/superadmin/2fa/policy', { method: 'POST', headers: adminAuth, body: JSON.stringify({ aktif: true, roles: ['admin'] }) })
  assert.equal(tolak.status, 403)

  // 3. Superadmin menyalakan untuk peran admin.
  const db = new Database(dbFile)
  const saId = crypto.randomUUID()
  db.prepare("INSERT INTO users(id,nama,email,password,role,tenant_id) VALUES(?,?,?,?,?,?)")
    .run(saId, 'SA', `sa-${acak()}@uji.id`, 'x', 'super_admin', 'default')
  const saToken = jwt.sign({ id: saId, role: 'super_admin', nama: 'SA', email: 'sa@uji.id', tenant_id: 'default' }, SECRET, { expiresIn: '1h' })
  const saAuth = { ...H, Authorization: `Bearer ${saToken}` }

  const nyala = await fetch(base + '/api/superadmin/2fa/policy', { method: 'POST', headers: saAuth, body: JSON.stringify({ aktif: true, roles: ['admin', 'kepala'] }) }).then(r => r.json())
  assert.equal(nyala.ok, true)

  // 4. Admin melihat peringatan berlaku untuk dirinya, tetapi 2FA-nya belum aktif.
  const sesudah = await fetch(base + '/api/auth/2fa/policy', { headers: adminAuth }).then(r => r.json())
  assert.equal(sesudah.aktif, true)
  assert.deepEqual(sesudah.roles, ['admin', 'kepala'])
  assert.equal(sesudah.berlaku_untuk_saya, true)
  assert.equal(sesudah.sudah_aktif, false)

  // 5. Aktif tanpa peran ditolak.
  const kosong = await fetch(base + '/api/superadmin/2fa/policy', { method: 'POST', headers: saAuth, body: JSON.stringify({ aktif: true, roles: [] }) })
  assert.equal(kosong.status, 400)

  // 6. Bisa dimatikan lagi (default produksi sekarang).
  const mati = await fetch(base + '/api/superadmin/2fa/policy', { method: 'POST', headers: saAuth, body: JSON.stringify({ aktif: false, roles: [] }) }).then(r => r.json())
  assert.equal(mati.ok, true)
  const akhir = await fetch(base + '/api/auth/2fa/policy', { headers: adminAuth }).then(r => r.json())
  assert.equal(akhir.aktif, false)
  db.close()
})

test('UI: banner hanya dirender dari kebijakan, bukan selalu', () => {
  const fs = require('node:fs')
  const baca = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const banner = baca('src/components/TwoFactorBanner.tsx')
  const layout = baca('src/components/layout/DashboardLayout.tsx')
  const dash = baca('src/pages/admin/SuperadminDashboard.tsx')
  assert.ok(banner.includes("/auth/2fa/policy"), 'membaca kebijakan')
  assert.ok(banner.includes('berlaku_untuk_saya'), 'hanya untuk peran terpilih')
  assert.ok(banner.includes('sudah_aktif !== true'), 'tidak tampil bila sudah aktif')
  assert.ok(layout.includes('<TwoFactorBanner />'), 'dipasang di dashboard')
  assert.ok(dash.includes('/superadmin/2fa/policy'), 'superadmin bisa menyalakan')
  assert.ok(dash.includes('Peringatan 2FA (lunak)'), 'label jelas')
})
