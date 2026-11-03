'use strict'
// SEO: halaman utilitas noindex, judul per pintu domain, sitemap bersih.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-seo-${process.pid}-${Date.now()}.db`)
  const port = 45100 + Math.floor(Math.random() * 300)
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

const html = async (port, path_, host) => {
  const r = await fetch(`http://127.0.0.1:${port}${path_}`, { headers: host ? { 'X-Forwarded-Host': host } : {} })
  return { status: r.status, teks: await r.text() }
}

test('halaman login/register noindex, beranda index', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const login = await html(port, '/login')
  assert.equal(login.status, 200)
  assert.match(login.teks, /<meta name="robots" content="noindex, follow"/)

  const daftar = await html(port, '/register', 'jurnalmadrasah.web.id')
  assert.match(daftar.teks, /noindex, follow/)

  const beranda = await html(port, '/', 'jurnalmadrasah.web.id')
  assert.match(beranda.teks, /<meta name="robots" content="index, follow"/)
  assert.match(beranda.teks, /<link rel="canonical" href="https:\/\/jurnalmadrasah\.web\.id\/"/)
})

test('judul beranda berbeda per pintu domain', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const madrasah = await html(port, '/', 'jurnalmadrasah.web.id')
  const sekolah = await html(port, '/', 'idjurnal.web.id')
  const umum = await html(port, '/', 'jurnalku.biz.id')
  const t1 = (madrasah.teks.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  const t2 = (sekolah.teks.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  const t3 = (umum.teks.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  assert.match(t1, /Madrasah/i, 'pintu kemenag: madrasah — dapat ' + t1)
  assert.match(t2, /Sekolah/i, 'pintu dikdasmen: sekolah — dapat ' + t2)
  assert.match(t3, /Kursus|Bimbel/i, 'pintu umum: kursus/bimbel — dapat ' + t3)
  assert.notEqual(t1, t2)
})

test('sitemap: tanpa halaman login, memuat faq & pengumuman', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const r = await fetch(`http://127.0.0.1:${port}/sitemap.xml`, { headers: { 'X-Forwarded-Host': 'jurnalku.biz.id' } })
  const xml = await r.text()
  assert.equal(r.status, 200)
  assert.doesNotMatch(xml, /\/login<\/loc>/, 'login tidak boleh ada di sitemap')
  assert.match(xml, /\/faq<\/loc>/)
  assert.match(xml, /\/pengumuman<\/loc>/)
  assert.match(xml, /\/panduan<\/loc>/)
  assert.match(xml, /\/register<\/loc>/, 'halaman daftar tetap ditawarkan')
})

test('kode: sitemap memuat profil + posting pada domain lembaga', () => {
  const src = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
  assert.match(src, /punyaLembaga\) halaman\.push\(\['\/profil'/)
  assert.match(src, /FROM posting WHERE tenant_id=\?/)
})
