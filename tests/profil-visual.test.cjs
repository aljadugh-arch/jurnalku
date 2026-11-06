'use strict'
// Halaman profil lembaga harus tampil seperti landing page (visual), bukan
// dokumen teks: navbar, hero, kartu angka, grid kartu, tabel, dan CTA.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')

test('profil lembaga memakai tata letak visual bergaya landing page', async (t) => {
  const dbFile = path.join(os.tmpdir(), `jk-vis-${process.pid}-${Date.now()}.db`)
  const port = 53600 + Math.floor(Math.random() * 200)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: 'k'.repeat(40), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 60000
  while (Date.now() < batas && !/running/i.test(out)) await new Promise(r => setTimeout(r, 150))
  assert.match(out, /running/i, 'server start: ' + out.slice(-300))

  const base = `http://127.0.0.1:${port}`
  await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_lembaga: 'MTs Uji Visual', nama: 'Admin', email: `vis-${crypto.randomBytes(3).toString('hex')}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000098', domain_type: 'subdomain', slug: `vis-${crypto.randomBytes(3).toString('hex')}`,
    }),
  })

  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id
  const gtkId = crypto.randomUUID(), mapelId = crypto.randomUUID(), rombelId = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,nip,jenis_kelamin,status) VALUES(?,?,?,?,?,'aktif')").run(gtkId, tenantId, 'Ustadz Fulan', '1980010', 'L')
  db.prepare('INSERT INTO mapel(id,nama,kode,tenant_id) VALUES(?,?,?,?)').run(mapelId, 'Nahwu', 'NHW', tenantId)
  db.prepare('INSERT INTO rombel(id,nama,tingkat,tahun_ajaran,tenant_id,wali_kelas_id) VALUES(?,?,?,?,?,?)').run(rombelId, 'VII-A', '7', '2026/2027', tenantId, gtkId)
  db.prepare('INSERT INTO jadwal(id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,tenant_id) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), mapelId, rombelId, gtkId, 'senin', '07:00', '08:30', 'VII-A', tenantId)
  db.prepare('INSERT INTO posting(id,judul,isi,tenant_id,created_at,penulis_id,penulis_nama) VALUES(?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), 'Kegiatan Pramuka', 'Cuplikan kegiatan pramuka.', tenantId, '2026-11-01 08:00:00', userId, 'Admin')
  db.prepare('UPDATE tenants SET domain_custom=? WHERE id=?').run('visual.test', tenantId)
  db.close()

  const html = await fetch(base + '/profil', { headers: { 'X-Forwarded-Host': 'visual.test' } }).then(r => r.text())

  // Struktur visual.
  assert.match(html, /class="nav"/, 'ada navbar')
  assert.match(html, /class="hero"/, 'ada hero')
  assert.match(html, /class="brand"/, 'ada brand/logo')
  assert.match(html, /class="badge"/, 'ada badge jenjang')
  assert.match(html, /class="btn btn-primary"/, 'ada tombol utama')
  assert.match(html, /class="angka"/, 'ada kartu angka')
  assert.match(html, /class="card"/, 'ada kartu')
  assert.match(html, /class="chip"/, 'chip mapel/ekskul')
  assert.match(html, /class="berita"/, 'grid berita')
  assert.match(html, /<footer/, 'ada footer')

  // Font & tema mengikuti landing page.
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Poppins/)
  assert.match(html, /prefers-color-scheme: dark/, 'mendukung mode gelap')
  assert.match(html, /--accent:#/, 'memakai warna utama lembaga')

  // Konten nyata tetap ada (SEO).
  assert.match(html, /Nahwu/)
  assert.match(html, /Kegiatan Pramuka/)
  assert.match(html, /Rombongan Belajar/)
  assert.match(html, /Wali Kelas/)
  assert.match(html, /EducationalOrganization/)
  assert.match(html, /<link rel="canonical"/)

  // Tanpa data (lembaga baru) tetap tampil rapi, bukan halaman kosong.
  const kosong = await fetch(base + '/profil', { headers: { 'X-Forwarded-Host': 'tidak-ada.test' } }).then(r => r.text())
  assert.match(kosong, /noindex/, 'lembaga tidak dikenal tetap noindex')
})
