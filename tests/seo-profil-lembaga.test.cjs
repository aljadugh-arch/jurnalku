'use strict'
// Profil lembaga publik: konten unik (mapel, ekskul, berita) + structured data.
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

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-profil-${process.pid}-${Date.now()}.db`)
  const port = 45600 + Math.floor(Math.random() * 300)
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

test('profil lembaga memuat mapel, ekskul, berita, dan structured data', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const slug = 'p-' + crypto.randomBytes(3).toString('hex')
  const reg = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama_lembaga: 'MTs Uji Profil', nama: 'Admin', email: `${slug}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000008', domain_type: 'subdomain', slug }),
  }).then(r => r.json())
  const tenantId = jwt.decode(reg.token).tenant_id

  const db = new Database(dbFile)
  db.pragma('foreign_keys = OFF')
  db.prepare("INSERT INTO mapel(id,tenant_id,kode,nama) VALUES(?,?,?,?)").run(crypto.randomUUID(), tenantId, 'MTK', 'Matematika')
  db.prepare("INSERT INTO mapel(id,tenant_id,kode,nama) VALUES(?,?,?,?)").run(crypto.randomUUID(), tenantId, 'IPA', 'Ilmu Pengetahuan Alam')
  db.prepare("INSERT INTO ekskul(id,tenant_id,nama) VALUES(?,?,?)").run(crypto.randomUUID(), tenantId, 'Pramuka')
  db.prepare("INSERT INTO tahun_ajaran(id,tenant_id,nama,semester,aktif) VALUES(?,?,?,?,1)").run(crypto.randomUUID(), tenantId, '2026/2027', 'Ganjil')
  db.prepare("INSERT INTO posting(id,tenant_id,judul,isi,penulis_id,penulis_nama,created_at) VALUES(?,?,?,?,?,?,datetime('now'))")
    .run(crypto.randomUUID(), tenantId, 'Juara Olimpiade Matematika', 'Siswa MTs Uji Profil meraih juara pertama.', 'u1', 'Admin')
  db.prepare("UPDATE settings SET telepon=?, email=? WHERE tenant_id=?").run('0351-123456', 'info@uji.sch.id', tenantId)
  // Profil publik memakai domain lembaga (custom domain), bukan subdomain platform.
  db.prepare("UPDATE tenants SET domain_custom=?, domain_status='active' WHERE id=?").run('profil-uji.test', tenantId)
  db.close()

  const r = await fetch(`http://127.0.0.1:${port}/profil`, { headers: { 'X-Forwarded-Host': 'profil-uji.test' } })
  const html = await r.text()
  assert.equal(r.status, 200)
  assert.match(html, /<meta name="robots" content="index, follow"/)
  assert.match(html, /MTs Uji Profil/)
  assert.match(html, /Mata Pelajaran/, 'bagian mata pelajaran')
  assert.match(html, /Matematika/)
  assert.match(html, /Ekstrakurikuler/)
  assert.match(html, /Pramuka/)
  assert.match(html, /Juara Olimpiade Matematika/, 'berita terbaru tampil')
  assert.match(html, /2026\/2027/, 'tahun ajaran aktif')
  assert.match(html, /EducationalOrganization/)
  assert.match(html, /BreadcrumbList/)
  assert.match(html, /0351-123456/, 'telepon masuk structured data')
})
