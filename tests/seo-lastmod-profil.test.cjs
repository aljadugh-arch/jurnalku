'use strict'
// Sinyal SEO yang harus benar agar halaman benar-benar diindeks:
//  1. sitemap memuat <lastmod> (tanpa ini crawler tidak punya alasan datang lagi)
//  2. halaman profil lembaga cukup kaya (bukan 120 kata) dan memakai data nyata
//  3. canonical & robots konsisten
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-seo-${process.pid}-${Date.now()}.db`)
  const port = 51600 + Math.floor(Math.random() * 200)
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
  return { proc, port, dbFile }
}

test('sitemap memuat lastmod untuk halaman utama dan profil', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const xml = await fetch(`http://127.0.0.1:${port}/sitemap.xml`).then(r => r.text())
  assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/, 'ada lastmod')
  // Halaman utama adalah entri pertama.
  const pertama = xml.split('<url>')[1] || ''
  assert.match(pertama, /<lastmod>/, 'halaman utama punya lastmod')
})

test('profil lembaga diperkaya data nyata, bukan sekadar identitas', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const base = `http://127.0.0.1:${port}`

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_lembaga: 'Madrasah Uji SEO', nama: 'Admin', email: `seo-${crypto.randomBytes(3).toString('hex')}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000014', domain_type: 'subdomain', slug: `seo-${crypto.randomBytes(3).toString('hex')}`,
    }),
  }).then(r => r.json())

  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  const gtkId = crypto.randomUUID()
  const mapelId = crypto.randomUUID()
  const rombelId = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,nip,jenis_kelamin,status,status_kepegawaian) VALUES(?,?,?,?,?,'aktif','Aktif')")
    .run(gtkId, tenantId, 'Ustadz Fulan', '1980003', 'L')
  db.prepare("INSERT INTO mapel(id,nama,kode,tenant_id) VALUES(?,?,?,?)").run(mapelId, 'Nahwu', 'NHW', tenantId)
  db.prepare("INSERT INTO rombel(id,nama,tingkat,tahun_ajaran,tenant_id,wali_kelas_id) VALUES(?,?,?,?,?,?)")
    .run(rombelId, 'VII-A', '7', '2026/2027', tenantId, gtkId)
  db.prepare(`INSERT INTO jadwal(id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,tenant_id)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), mapelId, rombelId, gtkId, 'senin', '07:00', '08:30', 'VII-A', tenantId)
  db.prepare("INSERT INTO siswa(id,tenant_id,nama,nis,jenis_kelamin,rombel_id,status) VALUES(?,?,?,?,?,?,'aktif')")
    .run(crypto.randomUUID(), tenantId, 'Siswa C', '7003', 'L', rombelId)
  db.prepare("INSERT INTO kalender_kbm(id,tenant_id,judul,tanggal,jenis) VALUES(?,?,?,?,?)")
    .run(crypto.randomUUID(), tenantId, 'Ujian Tengah Semester', '2030-01-10', 'ujian')
  // Profil lembaga dipilih dari Host, jadi uji memakai domain lembaga sendiri.
  const domainUji = `uji-${crypto.randomBytes(2).toString('hex')}.test`
  db.prepare('UPDATE tenants SET domain_custom=? WHERE id=?').run(domainUji, tenantId)
  db.close()

  // Node fetch melarang override header Host, jadi gunakan X-Forwarded-Host
  // yang memang dibaca hostPermintaan() di belakang reverse proxy.
  const isi = await fetch(`${base}/profil`, { headers: { 'X-Forwarded-Host': domainUji } }).then(r => r.text())

  assert.match(isi, /<meta name="robots" content="index, follow">/)
  assert.match(isi, /EducationalOrganization/)
  assert.match(isi, /canonical/)
  assert.match(isi, /Rombongan Belajar/, 'tabel rombel ikut dirender')
  assert.match(isi, /Wali kelas/)
  assert.match(isi, /Guru Pengampu per Mata Pelajaran/)
  assert.match(isi, /Nahwu/)
  assert.match(isi, /Agenda Terdekat/)
  assert.match(isi, /Ujian Tengah Semester/)
})

test('deskripsi meta menyebut jumlahnya, bukan kalimat generik', () => {
  const fs = require('node:fs')
  const src = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
  assert.match(src, /const deskripsi = `Profil \$\{nama\}/)
  assert.match(src, /siswa aktif, \$\{nGtk\} guru dan tenaga kependidikan/)
  assert.match(src, /Data resmi lembaga yang dikelola dengan JURNALKU/)
})
