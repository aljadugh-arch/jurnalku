'use strict'
// Pengumuman platform: audiens unik, mode kering tidak mengantrekan,
// pengiriman nyata mengisi antrean WA per tenant, dan riwayat menghitung status.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const acak = () => crypto.randomBytes(4).toString('hex')
const SECRET = 'k'.repeat(40)

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-broadcast-${process.pid}-${Date.now()}.db`)
  const port = 41600 + Math.floor(Math.random() * 300)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: SECRET, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 60000
  while (Date.now() < batas && !out.includes('JURNAL API Server running') && !out.includes('running')) {
    await new Promise(r => setTimeout(r, 150))
  }
  if (!/running/i.test(out)) {
    try { proc.kill('SIGKILL') } catch {}
    assert.fail('server gagal start:\n' + out.slice(-500))
  }
  return { proc, port, dbFile }
}

test('pengumuman platform: audiens unik, kering, dan antrean per tenant', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })
  const base = `http://127.0.0.1:${port}`
  const headers = { 'Content-Type': 'application/json' }

  // 1. Daftar lembaga (admin otomatis) + data nomor.
  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers,
    body: JSON.stringify({
      nama_lembaga: 'Uji Broadcast', nama: 'Admin Uji',
      email: `bc-${acak()}@uji.id`, password: 'rahasia-uji-123',
      no_hp: '081200000001', domain_type: 'subdomain', slug: `bc-${acak()}`,
    }),
  }).then(r => r.json())
  assert.ok(reg.token, 'token admin')

  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users WHERE email=?').get(reg.email || db.prepare('SELECT email FROM users ORDER BY created_at DESC LIMIT 1').get().email)?.tenant_id
    || db.prepare('SELECT id FROM tenants ORDER BY created_at DESC LIMIT 1').get().id

  // Nomor sama dipakai GTK dan wali -> harus jadi SATU penerima.
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,jenis_kelamin,no_hp,status) VALUES(?,?,?,?,?,'aktif')")
    .run(crypto.randomUUID(), tenantId, 'Guru Uji', 'L', '081234567890')
  db.prepare("INSERT INTO siswa(id,tenant_id,nama,nis,jenis_kelamin,no_hp,status) VALUES(?,?,?,?,?,?,'aktif')")
    .run(crypto.randomUUID(), tenantId, 'Siswa Uji', 'NIS-1', 'L', '081234567890')

  // Super admin + token.
  const adminId = crypto.randomUUID()
  db.prepare("INSERT INTO users(id,nama,email,password,role,tenant_id) VALUES(?,?,?,?,?,?)")
    .run(adminId, 'Super Uji', `sa-${acak()}@uji.id`, 'x', 'super_admin', 'default')
  const token = jwt.sign({ id: adminId, role: 'super_admin', nama: 'Super Uji', email: 'sa@uji.id', tenant_id: 'default' }, SECRET, { expiresIn: '1h' })
  const auth = { ...headers, Authorization: `Bearer ${token}` }

  // 2. Audiens: nomor unik (dedupe) dan rincian.
  const aud = await fetch(base + '/api/superadmin/broadcast/audiens?target=' + encodeURIComponent(tenantId), { headers: auth }).then(r => r.json())
  assert.equal(aud.tenant_count, 1, 'satu lembaga dipilih')
  const baris = aud.per_tenant.find(t => t.id === tenantId)
  assert.ok(baris, 'lembaga ada di audiens')
  // 1 dari GTK + 1 dari siswa (nomor sama) + kontak lembaga (no_hp pendaftar)
  assert.equal(baris.nomor, 2, 'nomor ganda dihitung sekali, kontak lembaga ikut')

  // 3. Mode kering: tidak menulis antrean.
  const kering = await fetch(base + '/api/superadmin/broadcast', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ judul: 'Uji Kering', pesan: 'Pesan uji mode kering yang cukup panjang.', target: [tenantId], kering: true }),
  }).then(r => r.json())
  assert.equal(kering.ok, true)
  assert.equal(kering.nomor_count, 2)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM wa_queue').get().c, 0, 'mode kering tidak mengantrekan')

  // 4. Kirim sungguhan -> antrean terisi, pesan berprefix pengumuman.
  const kirim = await fetch(base + '/api/superadmin/broadcast', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ judul: 'Pemeliharaan', pesan: 'Sistem akan dipelihara Sabtu pukul 22.00 WIB.', target: [tenantId] }),
  }).then(r => r.json())
  assert.equal(kirim.ok, true)
  assert.equal(kirim.tenant_count, 1)
  assert.equal(kirim.masuk_antrean, 2)

  const antrean = db.prepare('SELECT phone, message, tenant_id, idempotency_key FROM wa_queue').all()
  assert.equal(antrean.length, 2, 'dua pesan masuk antrean')
  assert.ok(antrean.every(q => q.tenant_id === tenantId), 'antrean memakai tenant penerima')
  assert.ok(antrean[0].message.includes('PENGUMUMAN JURNALKU'))
  assert.ok(antrean[0].message.includes('Pemeliharaan'))
  assert.ok(antrean.every(q => q.idempotency_key.startsWith('broadcast:' + kirim.id + ':')))

  // 5. Riwayat menghitung status antrean.
  const riw = await fetch(base + '/api/superadmin/broadcast', { headers: auth }).then(r => r.json())
  const item = riw.find(r => r.id === kirim.id)
  assert.ok(item, 'riwayat memuat pengumuman')
  assert.equal(item.pesan_count, 2)
  assert.equal(item.menunggu, 2, 'dua pesan menunggu dikirim')

  // 6. Bukan super admin ditolak.
  const adminToken = reg.token
  const tolak = await fetch(base + '/api/superadmin/broadcast', {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ judul: 'Coba', pesan: 'Pesan yang cukup panjang untuk uji.', target: [tenantId] }),
  })
  assert.equal(tolak.status, 403)

  db.close()
})

test('UI pengumuman platform terpasang untuk superadmin', () => {
  const fs = require('node:fs')
  const baca = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const app = baca('src/App.tsx')
  const page = baca('src/pages/admin/PlatformBroadcastPage.tsx')
  const dash = baca('src/pages/admin/SuperadminDashboard.tsx')
  assert.ok(app.includes('path="broadcast-platform"'), 'rute khusus superadmin')
  assert.ok(app.includes('allowedRoles={[\'super_admin\']}><PlatformBroadcastPage'), 'dijaga peran')
  assert.ok(page.includes('/superadmin/broadcast/audiens'), 'memuat audiens')
  assert.ok(page.includes('Kirim Pengumuman'), 'tombol kirim')
  assert.ok(page.includes('Riwayat Pengumuman'), 'riwayat tampil')
  assert.ok(dash.includes('/admin/broadcast-platform'), 'tautan dari dashboard')
  // Halaman broadcast tenant tetap ada (tidak tertimpa).
  const tenantPage = baca('src/pages/admin/BroadcastPage.tsx')
  assert.ok(tenantPage.includes('templates'), 'halaman broadcast lembaga tidak berubah')
})
