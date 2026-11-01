'use strict'
// Bukti runtime: registrasi dengan custom domain TIDAK jatuh ke subdomain, dan
// registrasi subdomain TIDAK memasang domain_custom. Server dijalankan pada DB
// sementara supaya tidak menyentuh data produksi.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.join(__dirname, '..')

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jurnalku-reg-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const port = 40200 + Math.floor(Math.random() * 500)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: 'y'.repeat(40), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 60000
  while (Date.now() < batas && !out.includes('JURNALKKU_SENTINEL') && !out.includes('JURNALKU API Server running')) {
    await new Promise(r => setTimeout(r, 150))
  }
  if (!out.includes('JURNALKU API Server running')) {
    try { proc.kill('SIGKILL') } catch {}
    assert.fail('server gagal start:\n' + out.slice(-600))
  }
  return { proc, port, dbFile }
}

const acak = () => Math.random().toString(36).slice(2, 8)

test('registrasi: custom domain vs subdomain tidak tertukar', async (t) => {
  const { proc, port } = await boot()
  const base = `http://127.0.0.1:${port}`
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })

  // 1. Custom domain
  const domCustom = `uji-${acak()}.example.com`
  const r1 = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_lembaga: 'Lembaga Custom', nama: 'Admin Custom', email: `custom-${acak()}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000001',
      domain_type: 'custom', custom_domain: domCustom,
      tipe_institusi: 'pesantren', jenjang: 'MA',
    }),
  })
  const d1 = await r1.json()
  assert.equal(r1.status, 200, 'registrasi custom harus 200: ' + JSON.stringify(d1).slice(0, 300))
  assert.equal(d1.domain_custom, domCustom, 'domain_custom harus tersimpan')
  assert.equal(d1.url, `https://${domCustom}`, 'url harus memakai domain custom, bukan subdomain')
  assert.ok(!String(d1.url).includes('jurnalku.biz.id'), 'custom TIDAK boleh jatuh ke subdomain platform')
  // tipe & jenjang tersimpan saat registrasi (dipakai terminologi)
  assert.ok(d1.token, 'registrasi mengembalikan token')
  const s1 = await fetch(`${base}/api/settings`, { headers: { Authorization: `Bearer ${d1.token}` } }).then(r => r.json())
  assert.equal(s1.tipe_institusi, 'pesantren', 'tipe_institusi dari registrasi harus tersimpan')
  assert.equal(s1.jenjang, 'MA', 'jenjang dari registrasi harus tersimpan')

  // 2. Subdomain
  const slug = `uji-${acak()}`
  const r2 = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_lembaga: 'Lembaga Sub', nama: 'Admin Sub', email: `sub-${acak()}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000002',
      domain_type: 'subdomain', slug,
      tipe_institusi: 'perguruan_tinggi', jenjang: 'PT',
    }),
  })
  const d2 = await r2.json()
  assert.equal(r2.status, 200, 'registrasi subdomain harus 200: ' + JSON.stringify(d2).slice(0, 300))
  assert.equal(d2.domain_custom, null, 'subdomain tidak boleh punya domain_custom')
  assert.equal(d2.slug, slug)
  assert.match(String(d2.url), new RegExp(`^https://${slug}\\.`), 'url harus subdomain slug')
  assert.ok(!String(d2.url).includes(domCustom), 'subdomain tidak boleh memakai domain custom')
})
