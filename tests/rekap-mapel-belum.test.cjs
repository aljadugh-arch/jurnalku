'use strict'
// Rekap per mapel harus jujur: kelas yang dijadwalkan hari ini tetapi belum
// diabsensi tetap muncul (bertanda belum tercatat), bukan dihilangkan.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
const hariIni = HARI[new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getDay()]
const tanggalIni = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

test('jadwal hari ini yang belum diabsen tetap tampil sebagai belum tercatat', async (t) => {
  const dbFile = path.join(os.tmpdir(), `jk-rekap-${process.pid}-${Date.now()}.db`)
  const port = 50900 + Math.floor(Math.random() * 200)
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
  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_lembaga: 'Uji Rekap', nama: 'Admin', email: `rk-${crypto.randomBytes(3).toString('hex')}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000012', domain_type: 'subdomain', slug: `rk-${crypto.randomBytes(3).toString('hex')}`,
    }),
  }).then(r => r.json())

  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  const mapelId = crypto.randomUUID()
  const rombelId = crypto.randomUUID()
  db.prepare("INSERT INTO mapel(id,nama,kode,tenant_id) VALUES(?,?,?,?)").run(mapelId, 'Tahsin', 'THS', tenantId)
  db.prepare("INSERT INTO rombel(id,nama,tingkat,tahun_ajaran,tenant_id) VALUES(?,?,?,?,?)").run(rombelId, 'VII-B', '7', '2026/2027', tenantId)
  const gtkId = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,nip,jenis_kelamin,status_kepegawaian) VALUES(?,?,?,?,?,'Aktif')")
    .run(gtkId, tenantId, 'Guru Tahsin', '1980001', 'L')
  const jadwalId = crypto.randomUUID()
  db.prepare(`INSERT INTO jadwal(id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,tenant_id)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(jadwalId, mapelId, rombelId, gtkId, hariIni, '07:00', '08:30', 'VII-B', tenantId)
  db.close()

  const kosong = await fetch(`${base}/api/absensi-mapel/ringkasan?tanggal=${tanggalIni}`, { headers: { Authorization: `Bearer ${reg.token}` } }).then(r => r.json())
  assert.equal(kosong.per_mapel.length, 1, 'satu kelas terjadwal tetap tampil')
  assert.equal(kosong.per_mapel[0].tercatat, false)
  assert.equal(kosong.per_mapel[0].belum_diabsen === undefined, true, 'flag ada di root')
  assert.equal(kosong.belum_diabsen, 1)
  assert.equal(kosong.totals.catatan, 0)

  // Setelah guru mengisi absensi, baris berubah menjadi tercatat.
  const db2 = new Database(dbFile)
  const siswaId = crypto.randomUUID()
  db2.prepare("INSERT INTO siswa(id,tenant_id,nama,nis,jenis_kelamin,rombel_id,status) VALUES(?,?,?,?,?,?,'aktif')")
    .run(siswaId, tenantId, 'Siswa A', '7001', 'L', rombelId)
  db2.prepare(`INSERT INTO absensi_mapel(id,tenant_id,tanggal,mapel_id,rombel_id,siswa_id,status,jadwal_id,guru_id)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), tenantId, tanggalIni, mapelId, rombelId, siswaId, 'hadir', jadwalId, gtkId)
  db2.close()

  const terisi = await fetch(`${base}/api/absensi-mapel/ringkasan?tanggal=${tanggalIni}`, { headers: { Authorization: `Bearer ${reg.token}` } }).then(r => r.json())
  assert.equal(terisi.per_mapel.length, 1, 'tidak dobel antara tercatat dan rencana')
  assert.equal(terisi.per_mapel[0].tercatat, true)
  assert.equal(terisi.per_mapel[0].catatan, 1)
  assert.equal(terisi.belum_diabsen, 0)
})
