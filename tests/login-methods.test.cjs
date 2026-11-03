'use strict'
// Satu metode login sesuai pengaturan admin: bawaan hanya sandi, OTP/tautan
// ditolak di server saat dimatikan (bukan sekadar disembunyikan di UI).
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const root = path.join(__dirname, '..')
const acak = () => crypto.randomBytes(4).toString('hex')

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-login-${process.pid}-${Date.now()}.db`)
  const port = 43600 + Math.floor(Math.random() * 300)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: 'k'.repeat(40), NODE_ENV: 'test' },
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

test('metode login: bawaan sandi, OTP/tautan ditolak saat dimatikan', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const base = `http://127.0.0.1:${port}`
  const H = { 'Content-Type': 'application/json' }

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: H,
    body: JSON.stringify({ nama_lembaga: 'Uji Login', nama: 'Admin', email: `l-${acak()}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000005', domain_type: 'subdomain', slug: `l-${acak()}` }),
  }).then(r => r.json())
  const auth = { ...H, Authorization: `Bearer ${reg.token}` }
  // Permintaan tanpa token memakai tenant dari Host. Arahkan ke subdomain
  // lembaga yang baru dibuat agar pengaturannya benar-benar diuji.
  // Node fetch tidak selalu mengizinkan override Host; middleware memprioritaskan
  // X-Forwarded-Host, jadi pakai header itu untuk meniru domain lembaga.
  const tamu = { ...H, 'X-Forwarded-Host': new URL(reg.url).hostname }
  const authTamu = { ...tamu, Authorization: `Bearer ${reg.token}` }

  // 1. Bawaan: hanya sandi.
  const awal = await fetch(base + '/api/settings/metode-login', { headers: authTamu }).then(r => r.json())
  assert.deepEqual(awal.metode, ['sandi'])

  // 2. OTP & tautan ditolak di server.
  const otp = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: tamu, body: JSON.stringify({ phone: '081200000005' }) })
  assert.equal(otp.status, 403)
  assert.equal((await otp.json()).code, 'METODE_NONAKTIF')
  const tautan = await fetch(base + '/api/auth/magic/request', { method: 'POST', headers: tamu, body: JSON.stringify({ email: 'x@uji.id' }) })
  assert.equal(tautan.status, 403)

  // 3. Admin menyalakan OTP -> permintaan diterima (balasan generik).
  const put = await fetch(base + '/api/settings/metode-login', { method: 'PUT', headers: auth, body: JSON.stringify({ metode: ['sandi', 'otp'] }) })
  assert.equal(put.status, 200)
  const otp2 = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: tamu, body: JSON.stringify({ phone: '081200000005' }) })
  assert.equal(otp2.status, 200)

  // 4. Hanya sandi lagi.
  await fetch(base + '/api/settings/metode-login', { method: 'PUT', headers: auth, body: JSON.stringify({ metode: ['sandi'] }) })
  const otp3 = await fetch(base + '/api/auth/otp/request', { method: 'POST', headers: tamu, body: JSON.stringify({ phone: '081200000005' }) })
  assert.equal(otp3.status, 403)

  // 5. Tidak boleh kosong / peran biasa tidak boleh mengubah.
  const kosong = await fetch(base + '/api/settings/metode-login', { method: 'PUT', headers: auth, body: JSON.stringify({ metode: [] }) })
  assert.equal(kosong.status, 400)
  const tanpa = await fetch(base + '/api/settings/metode-login', { method: 'PUT', headers: H, body: JSON.stringify({ metode: ['otp'] }) })
  assert.equal(tanpa.status, 401)
})

test('UI: login membaca metode dari pengaturan, setting punya pilihan', () => {
  const baca = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const login = baca('src/pages/auth/LoginPage.tsx')
  const setting = baca('src/pages/admin/SettingsPage.tsx')
  assert.ok(login.includes('metode_login'), 'login membaca metode_login')
  assert.ok(login.includes('metodeAktif.length > 1'), 'tab hanya muncul bila lebih dari satu')
  assert.ok(setting.includes('/settings/metode-login'), 'admin bisa mengubah')
  assert.ok(setting.includes('Metode Login'), 'label di pengaturan')
})
