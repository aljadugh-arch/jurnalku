'use strict'
// Rekap presensi siswa: dua sumber, dua penyebut.
//  - Harian (gerbang): absensi_siswa, penyebut = siswa aktif.
//    Siswa tanpa catatan pada hari berjalan = "belum tercatat", bukan alpha.
//  - Per mapel: absensi_mapel, penyebut = catatan jam pelajaran.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const SECRET = 'k'.repeat(40)
const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const kemarin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })
  .format(new Date(Date.now() - 86400000))

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-pres-${process.pid}-${Date.now()}.db`)
  const port = 47100 + Math.floor(Math.random() * 300)
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

async function siapkan() {
  const { proc, port, dbFile } = await boot()
  const base = `http://127.0.0.1:${port}`
  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama_lembaga: 'Uji Presensi', nama: 'Admin', email: `pres-${crypto.randomBytes(3).toString('hex')}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000007', domain_type: 'subdomain', slug: `pres-${crypto.randomBytes(3).toString('hex')}` }),
  }).then(r => r.json())
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  const rombelId = crypto.randomUUID(), mapelId = crypto.randomUUID(), gtkId = crypto.randomUUID(), jadwalId = crypto.randomUUID()
  db.prepare('INSERT INTO rombel(id,tenant_id,nama,tingkat,tahun_ajaran) VALUES(?,?,?,?,?)').run(rombelId, tenantId, 'VII-A', '7', '2026/2027')
  db.prepare('INSERT INTO mapel(id,tenant_id,nama,kode) VALUES(?,?,?,?)').run(mapelId, tenantId, 'Matematika', 'MTK')
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,jenis_kelamin,status) VALUES(?,?,?,?,'aktif')").run(gtkId, tenantId, 'Guru A', 'L')
  db.prepare(`INSERT INTO jadwal(id,tenant_id,gtk_id,mapel_id,rombel_id,hari,jam_mulai,jam_selesai,ruangan)
    VALUES(?,?,?,?,?,?,?,?,'R1')`).run(jadwalId, tenantId, gtkId, mapelId, rombelId, 'senin', '07:30', '08:10')
  const siswa = []
  for (let i = 1; i <= 3; i++) {
    const id = crypto.randomUUID()
    db.prepare("INSERT INTO siswa(id,tenant_id,nama,nis,jenis_kelamin,rombel_id,status) VALUES(?,?,?,?,?,?,'aktif')")
      .run(id, tenantId, `Siswa ${i}`, `N${i}`, 'L', rombelId)
    siswa.push(id)
  }
  return { proc, base, db, tenantId, rombelId, mapelId, gtkId, jadwalId, siswa, token: reg.token }
}

test('hari berjalan: siswa tanpa catatan = belum tercatat, bukan alpha', async (t) => {
  const s = await siapkan()
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const ins = s.db.prepare("INSERT INTO absensi_siswa(id,tenant_id,siswa_id,tanggal,status) VALUES(?,?,?,?,?)")
  ins.run(crypto.randomUUID(), s.tenantId, s.siswa[0], hariIni, 'hadir')
  ins.run(crypto.randomUUID(), s.tenantId, s.siswa[1], hariIni, 'sakit')

  const r = await fetch(`${s.base}/api/absensi-siswa/ringkasan?tanggal=${hariIni}`, { headers: { Authorization: `Bearer ${s.token}` } }).then(x => x.json())
  assert.equal(r.totals.hadir, 1)
  assert.equal(r.totals.sakit, 1)
  assert.equal(r.totals.alpha, 0, 'alpha eksplisit tetap 0')
  assert.equal(r.totals.belum_tercatat, 1, 'satu siswa belum punya catatan')
  assert.equal(r.tertutup, false)
  s.db.close()
})

test('hari lampau: catatan dianggap final, sisa masuk alpha', async (t) => {
  const s = await siapkan()
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })
  s.db.prepare("INSERT INTO absensi_siswa(id,tenant_id,siswa_id,tanggal,status) VALUES(?,?,?,?,?)")
    .run(crypto.randomUUID(), s.tenantId, s.siswa[0], kemarin, 'hadir')

  const r = await fetch(`${s.base}/api/absensi-siswa/ringkasan?tanggal=${kemarin}`, { headers: { Authorization: `Bearer ${s.token}` } }).then(x => x.json())
  assert.equal(r.tertutup, true)
  assert.equal(r.totals.hadir, 1)
  assert.equal(r.totals.alpha, 2, 'dua siswa tanpa catatan dihitung alpha pada hari lampau')
  assert.equal(r.totals.belum_tercatat, 0)
  s.db.close()
})

test('rekap per mapel memakai penyebut catatan jam pelajaran', async (t) => {
  const s = await siapkan()
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })
  s.db.prepare(`INSERT INTO sesi_kelas_guru(id,tenant_id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,status)
    VALUES(?,?,?,?,?,?,?,?,'selesai')`).run(crypto.randomUUID(), s.tenantId, s.jadwalId, s.gtkId, s.mapelId, s.rombelId, hariIni, '07:30')
  const ins = s.db.prepare(`INSERT INTO absensi_mapel(id,tenant_id,siswa_id,rombel_id,jadwal_id,mapel_id,guru_id,tanggal,status)
    VALUES(?,?,?,?,?,?,?,?,?)`)
  ins.run(crypto.randomUUID(), s.tenantId, s.siswa[0], s.rombelId, s.jadwalId, s.mapelId, s.gtkId, hariIni, 'hadir')
  ins.run(crypto.randomUUID(), s.tenantId, s.siswa[1], s.rombelId, s.jadwalId, s.mapelId, s.gtkId, hariIni, 'hadir')
  ins.run(crypto.randomUUID(), s.tenantId, s.siswa[2], s.rombelId, s.jadwalId, s.mapelId, s.gtkId, hariIni, 'alpha')

  const r = await fetch(`${s.base}/api/absensi-mapel/ringkasan?tanggal=${hariIni}`, { headers: { Authorization: `Bearer ${s.token}` } }).then(x => x.json())
  assert.equal(r.per_mapel.length, 1)
  const baris = r.per_mapel[0]
  assert.equal(baris.catatan, 3)
  assert.equal(baris.hadir, 2)
  assert.equal(baris.alpha, 1)
  assert.equal(baris.persentase, 67)
  assert.equal(baris.sesi, 1, 'jumlah sesi kelas hari itu ikut dilaporkan')
  assert.equal(baris.siswa, 3)
  assert.equal(baris.diharapkan, 3)
  assert.equal(r.totals.catatan, 3)
  s.db.close()
})
