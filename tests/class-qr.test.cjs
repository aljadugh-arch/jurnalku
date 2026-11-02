'use strict'
// QR ruang kelas: tanda tangan berlaku per tanggal, hanya untuk rombel guru itu,
// dan pemindaian mencatat sesi kelas tanpa GPS (cadangan saat GPS buruk).
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const Database = require('better-sqlite3')
const { buatPayload, verifikasiPayload } = require('../server/class-qr.cjs')

const root = path.join(__dirname, '..')
const SECRET = 'k'.repeat(40)
const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
const hariIni = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
const namaHari = HARI[new Date(hariIni + 'T12:00:00Z').getUTCDay()]

test('payload QR: sah hanya untuk tenant + tanggal yang sama', () => {
  const t = { tenantId: 't1', rombelId: 'r1', tanggal: '2026-11-02' }
  const p = buatPayload(t, SECRET)
  assert.equal(verifikasiPayload(p, { tenantId: 't1', tanggal: '2026-11-02', secret: SECRET }).ok, true)
  assert.equal(verifikasiPayload(p, { tenantId: 't2', tanggal: '2026-11-02', secret: SECRET }).ok, false)
  assert.equal(verifikasiPayload(p, { tenantId: 't1', tanggal: '2026-11-03', secret: SECRET }).ok, false)
  assert.equal(verifikasiPayload(p, { tenantId: 't1', tanggal: '2026-11-02', secret: 'lain' }).ok, false)
  // Diubah isinya -> tanda tangan tidak cocok.
  const palsu = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), r: 'r2' })).toString('base64url')
  assert.equal(verifikasiPayload(palsu, { tenantId: 't1', tanggal: '2026-11-02', secret: SECRET }).ok, false)
})

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-qr-${process.pid}-${Date.now()}.db`)
  const port = 43100 + Math.floor(Math.random() * 300)
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
  if (!/running/i.test(out)) { try { proc.kill('SIGKILL') } catch {}; assert.fail('server gagal start: ' + out.slice(-400)) }
  return { proc, port, dbFile }
}

test('guru memindai QR -> sesi kelas tercatat tanpa GPS', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })
  const base = `http://127.0.0.1:${port}`
  const H = { 'Content-Type': 'application/json' }

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: H,
    body: JSON.stringify({ nama_lembaga: 'Uji QR', nama: 'Admin', email: `qr-${crypto.randomBytes(3).toString('hex')}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000004', domain_type: 'subdomain', slug: `qr-${crypto.randomBytes(3).toString('hex')}` }),
  }).then(r => r.json())
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id

  const gtkId = crypto.randomUUID(), mapelId = crypto.randomUUID(), rombelId = crypto.randomUUID(), userId = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,jenis_kelamin,status) VALUES(?,?,?,?,'aktif')").run(gtkId, tenantId, 'Guru QR', 'L')
  db.prepare("INSERT INTO mapel(id,tenant_id,nama,kode) VALUES(?,?,?,?)").run(mapelId, tenantId, 'Fisika', 'FIS')
  // Lock kelas aktif dengan koordinat jauh: GPS saja akan ditolak.
  db.prepare(`INSERT INTO rombel(id,tenant_id,nama,tingkat,tahun_ajaran,geo_latitude,geo_longitude,geo_radius,geo_lock)
    VALUES(?,?,?,?,?,?,?,?,1)`).run(rombelId, tenantId, 'X-1', '10', '2026/2027', -6.2, 106.8, 50)
  db.prepare(`INSERT INTO jadwal(id,tenant_id,gtk_id,mapel_id,rombel_id,hari,jam_mulai,jam_selesai,ruangan)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), tenantId, gtkId, mapelId, rombelId, namaHari, '00:00', '23:59', 'LAB')
  db.prepare("INSERT INTO users(id,nama,email,password,role,tenant_id,gtk_id) VALUES(?,?,?,?,?,?,?)")
    .run(userId, 'Guru QR', `guru-qr-${crypto.randomBytes(3).toString('hex')}@uji.id`, 'x', 'guru', tenantId, gtkId)

  const admin = { Authorization: `Bearer ${reg.token}` }
  const qr = await fetch(base + '/api/admin/qr-kelas', { headers: admin }).then(r => r.json())
  const kelas = qr.kelas.find(k => k.id === rombelId)
  assert.ok(kelas?.payload, 'admin mendapat payload QR untuk rombel')

  const guruToken = jwt.sign({ id: userId, role: 'guru', nama: 'Guru QR', email: 'g@uji.id', tenant_id: tenantId, gtk_id: gtkId }, SECRET, { expiresIn: '1h' })
  const pindai = await fetch(base + '/api/guru/sesi-kelas/qr', {
    method: 'POST', headers: { ...H, Authorization: `Bearer ${guruToken}` },
    body: JSON.stringify({ payload: kelas.payload }),
  }).then(r => r.json())
  assert.equal(pindai.ok, true, JSON.stringify(pindai).slice(0, 120))
  assert.ok(pindai.sesi?.id)

  const sesi = db.prepare('SELECT qr_verified, waktu_masuk, status FROM sesi_kelas_guru WHERE tenant_id=? AND guru_id=?').get(tenantId, gtkId)
  assert.equal(sesi.qr_verified, 1, 'sesi ditandai hasil pindai QR')
  assert.equal(sesi.status, 'aktif')
  assert.ok(sesi.waktu_masuk)

  // Monitoring admin menampilkan bukti QR.
  const mon = await fetch(base + '/api/monitoring/guru-di-kelas?q=Guru QR', { headers: admin }).then(r => r.json())
  const baris = (mon.hasil || []).find(x => x.nama === 'Guru QR')
  assert.equal(baris?.sedang_mengajar?.sesi?.qr_verified, true, 'monitoring menandai QR')

  // Jalur GPS tetap tersedia: tanpa QR & tanpa koordinat harus ditolak geo-lock.
  db.prepare('DELETE FROM sesi_kelas_guru WHERE tenant_id=? AND guru_id=?').run(tenantId, gtkId)
  const tanpa = await fetch(base + '/api/guru/sesi-kelas/masuk', {
    method: 'POST', headers: { ...H, Authorization: `Bearer ${guruToken}` },
    body: JSON.stringify({ jadwal_id: pindai.jadwal.id }),
  })
  assert.equal(tanpa.status, 400, 'geo-lock menolak tanpa lokasi')

  // Dengan QR, jalur /masuk tidak mewajibkan GPS.
  db.prepare('DELETE FROM sesi_kelas_guru WHERE tenant_id=? AND guru_id=?').run(tenantId, gtkId)
  const viaQr = await fetch(base + '/api/guru/sesi-kelas/masuk', {
    method: 'POST', headers: { ...H, Authorization: `Bearer ${guruToken}` },
    body: JSON.stringify({ jadwal_id: pindai.jadwal.id, qr_payload: kelas.payload }),
  })
  assert.equal(viaQr.status, 200, 'QR menggantikan syarat GPS')
  const sesiQr = db.prepare('SELECT qr_verified FROM sesi_kelas_guru WHERE tenant_id=? AND guru_id=?').get(tenantId, gtkId)
  assert.equal(sesiQr.qr_verified, 1)

  // QR palsu ditolak.
  const palsu = await fetch(base + '/api/guru/sesi-kelas/qr', {
    method: 'POST', headers: { ...H, Authorization: `Bearer ${guruToken}` },
    body: JSON.stringify({ payload: 'bukan-qr' }),
  })
  assert.equal(palsu.status, 400)

  // QR rombel lain (tanda tangan sah, rombel beda) ditolak.
  const lain = buatPayload({ tenantId, rombelId: 'rombel-lain', tanggal: hariIni }, SECRET)
  const beda = await fetch(base + '/api/guru/sesi-kelas/qr', {
    method: 'POST', headers: { ...H, Authorization: `Bearer ${guruToken}` },
    body: JSON.stringify({ payload: lain }),
  })
  assert.equal(beda.status, 403)
  db.close()
})

test('UI: halaman QR kelas + tombol pindai di dashboard guru', () => {
  const baca = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const app = baca('src/App.tsx')
  const page = baca('src/pages/admin/QrKelasPage.tsx')
  const guru = baca('src/pages/guru/GuruDashboard.tsx')
  assert.ok(app.includes('path="qr-kelas"'), 'rute QR kelas')
  assert.ok(page.includes('/admin/qr-kelas'), 'memuat payload dari server')
  assert.ok(page.includes('QRCodeSVG'), 'QR dirender lokal')
  assert.ok(page.includes('window.print()'), 'bisa dicetak')
  assert.ok(guru.includes('/guru/sesi-kelas/qr'), 'guru bisa memindai QR')
})
