'use strict'
// Pencarian "guru sekarang di kelas mana": jadwal hari ini, status berlangsung,
// kehadiran ceklok, dan penanda jurnal.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const acak = () => crypto.randomBytes(4).toString('hex')
const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
const hariIni = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
const namaHari = HARI[new Date(hariIni + 'T12:00:00Z').getUTCDay()]

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-gdk-${process.pid}-${Date.now()}.db`)
  const port = 42600 + Math.floor(Math.random() * 300)
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
  if (!/running/i.test(out)) { try { proc.kill('SIGKILL') } catch {}; assert.fail('server gagal start: ' + out.slice(-400)) }
  return { proc, port, dbFile }
}

test('cari guru: kelas berlangsung, kehadiran, dan status jurnal', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })
  const base = `http://127.0.0.1:${port}`
  const H = { 'Content-Type': 'application/json' }

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: H,
    body: JSON.stringify({ nama_lembaga: 'Uji Guru', nama: 'Admin', email: `g-${acak()}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000003', domain_type: 'subdomain', slug: `g-${acak()}` }),
  }).then(r => r.json())
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id

  const gtkId = crypto.randomUUID()
  const mapelId = crypto.randomUUID()
  const rombelId = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,jenis_kelamin,status) VALUES(?,?,?,?,'aktif')").run(gtkId, tenantId, 'Siti Rahmawati', 'P')
  db.prepare("INSERT INTO mapel(id,tenant_id,nama,kode) VALUES(?,?,?,?)").run(mapelId, tenantId, 'Matematika', 'MTK')
  db.prepare("INSERT INTO rombel(id,tenant_id,nama,tingkat,tahun_ajaran) VALUES(?,?,?,?,?)").run(rombelId, tenantId, 'VII-A', '7', '2026/2027')
  db.prepare(`INSERT INTO jadwal(id,tenant_id,gtk_id,mapel_id,rombel_id,hari,jam_mulai,jam_selesai,ruangan)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), tenantId, gtkId, mapelId, rombelId, namaHari, '00:00', '23:59', 'R-1')
  db.prepare(`INSERT INTO absensi_guru(id,gtk_id,tanggal,waktu_masuk,status,tenant_id)
    VALUES(?,?,?,?,?,?)`).run(crypto.randomUUID(), gtkId, hariIni, '06:45', 'hadir', tenantId)
  db.prepare(`INSERT INTO jurnal_mengajar(id,guru_id,mapel_id,rombel_id,tanggal,jam_ke,materi,status,tenant_id)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), gtkId, mapelId, rombelId, hariIni, '1', 'Pecahan', 'submitted', tenantId)

  const auth = { Authorization: `Bearer ${reg.token}` }
  const r = await fetch(base + '/api/monitoring/guru-di-kelas?q=Siti', { headers: auth }).then(x => x.json())
  assert.equal(r.hasil.length, 1, 'guru ditemukan lewat pencarian nama')
  const g = r.hasil[0]
  assert.equal(g.nama, 'Siti Rahmawati')
  assert.ok(g.sedang_mengajar, 'slot 00:00-23:59 selalu berlangsung')
  assert.equal(g.sedang_mengajar.rombel, 'VII-A')
  assert.equal(g.sedang_mengajar.mapel, 'Matematika')
  assert.equal(g.sedang_mengajar.status, 'berlangsung')
  assert.equal(g.sedang_mengajar.jurnal_terisi, true, 'jurnal hari ini terdeteksi')
  assert.equal(g.kehadiran.status, 'hadir')
  assert.equal(g.kehadiran.jam_masuk, '06:45')

  // Nama yang tidak ada -> hasil kosong, bukan error.
  const kosong = await fetch(base + '/api/monitoring/guru-di-kelas?q=TidakAda', { headers: auth }).then(x => x.json())
  assert.equal(kosong.hasil.length, 0)

  // Tanpa token ditolak.
  const tanpa = await fetch(base + '/api/monitoring/guru-di-kelas?q=Siti')
  assert.equal(tanpa.status, 401)
  db.close()
})

test('UI: halaman Guru di Kelas terpasang di menu', () => {
  const baca = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const app = baca('src/App.tsx')
  const page = baca('src/pages/admin/GuruDiKelasPage.tsx')
  const menu = baca('src/lib/menuItems.tsx')
  const sidebar = baca('src/components/layout/Sidebar.tsx')
  assert.ok(app.includes('path="guru-di-kelas"'), 'rute terdaftar')
  assert.ok(page.includes('/monitoring/guru-di-kelas'), 'memanggil endpoint')
  assert.ok(page.includes('Sedang di kelas'), 'menampilkan kelas berjalan')
  assert.ok(page.includes('Ketik nama guru'), 'kolom pencarian nama')
  assert.ok(menu.includes("'/admin/guru-di-kelas'"), 'item menu ada')
  assert.ok(sidebar.includes("'Guru di Kelas'"), 'masuk grup sidebar')
})
