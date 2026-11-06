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

test('QR permanen: dicetak sekali, tetap sah di tanggal mana pun', () => {
  const p = buatPayload({ tenantId: 't1', rombelId: 'r1' }, SECRET)
  for (const tgl of ['2026-11-05', '2027-02-14', '2030-12-31']) {
    const v = verifikasiPayload(p, { tenantId: 't1', tanggal: tgl, secret: SECRET })
    assert.equal(v.ok, true, 'harus sah pada ' + tgl)
    assert.equal(v.permanen, true)
    assert.equal(v.rombel_id, 'r1')
  }
  assert.equal(verifikasiPayload(p, { tenantId: 't2', tanggal: '2026-11-05', secret: SECRET }).ok, false, 'tenant lain ditolak')
  assert.equal(verifikasiPayload(p, { tenantId: 't1', tanggal: '2026-11-05', secret: 'lain' }).ok, false, 'tanda tangan salah ditolak')
  const palsu = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), r: 'r2' })).toString('base64url')
  assert.equal(verifikasiPayload(palsu, { tenantId: 't1', tanggal: '2026-11-05', secret: SECRET }).ok, false, 'isi diubah ditolak')
})

test('payload QR bertanggal: sah untuk tenant yang benar di hari mana pun', () => {
  const t = { tenantId: 't1', rombelId: 'r1', tanggal: '2026-11-02' }
  const p = buatPayload(t, SECRET)
  assert.equal(verifikasiPayload(p, { tenantId: 't1', tanggal: '2026-11-02', secret: SECRET }).ok, true)
  assert.equal(verifikasiPayload(p, { tenantId: 't2', tanggal: '2026-11-02', secret: SECRET }).ok, false)
  // QR cetakan lama tetap sah di hari lain: tidak ada cetak ulang harian.
  assert.equal(verifikasiPayload(p, { tenantId: 't1', tanggal: '2026-11-03', secret: SECRET }).ok, true)
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
  assert.ok(page.includes('Unduh Semua (ZIP)'), 'unduh semua sebagai ZIP')
  assert.ok(page.includes('Unduh PNG'), 'unduh per kelas')
  assert.ok(page.includes("from 'jszip'"), 'ZIP dibuat di perangkat')
  assert.ok(page.includes('toCanvas'), 'QR digambar lokal, bukan dari layanan luar')
  assert.ok(guru.includes('/guru/sesi-kelas/qr'), 'guru bisa memindai QR')
})

test('pindai setelah jam pelajaran berakhir: tercatat, tetapi tidak "aktif"', async (t) => {
  // Kasus nyata (4 Nov 2026): guru memindai pukul 08:22 untuk jadwal 07:30-08:10.
  // Server menerima (masa tenggang 60 menit), membuat sesi 'aktif', lalu dashboard
  // langsung menutupnya karena jam sudah lewat — guru melihat tombol seolah tidak
  // berubah. Sekarang sesi disimpan sebagai 'selesai' dan klien diberi tahu.
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })
  const base = `http://127.0.0.1:${port}`
  const H = { 'Content-Type': 'application/json' }

  const jjmm = (offsetMenit) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(Date.now() + offsetMenit * 60000))
  const selesai = jjmm(-30)
  const mulai = jjmm(-90)

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: H,
    body: JSON.stringify({ nama_lembaga: 'Uji QR Lewat', nama: 'Admin', email: `qrl-${crypto.randomBytes(3).toString('hex')}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000005', domain_type: 'subdomain', slug: `qrl-${crypto.randomBytes(3).toString('hex')}` }),
  }).then(r => r.json())
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id

  const gtkId = crypto.randomUUID(), mapelId = crypto.randomUUID(), rombelId = crypto.randomUUID(), userId = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,jenis_kelamin,status) VALUES(?,?,?,?,'aktif')").run(gtkId, tenantId, 'Guru Lewat', 'L')
  db.prepare("INSERT INTO mapel(id,tenant_id,nama,kode) VALUES(?,?,?,?)").run(mapelId, tenantId, 'Kimia', 'KIM')
  db.prepare('INSERT INTO rombel(id,tenant_id,nama,tingkat,tahun_ajaran) VALUES(?,?,?,?,?)').run(rombelId, tenantId, 'XI-1', '11', '2026/2027')
  db.prepare(`INSERT INTO jadwal(id,tenant_id,gtk_id,mapel_id,rombel_id,hari,jam_mulai,jam_selesai,ruangan)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), tenantId, gtkId, mapelId, rombelId, namaHari, mulai, selesai, 'R1')
  db.prepare('INSERT INTO users(id,nama,email,password,role,tenant_id,gtk_id) VALUES(?,?,?,?,?,?,?)')
    .run(userId, 'Guru Lewat', `guru-lewat-${crypto.randomBytes(3).toString('hex')}@uji.id`, 'x', 'guru', tenantId, gtkId)

  const admin = { Authorization: `Bearer ${reg.token}` }
  const qr = await fetch(base + '/api/admin/qr-kelas', { headers: admin }).then(r => r.json())
  const kelas = qr.kelas.find(k => k.id === rombelId)

  const guruToken = jwt.sign({ id: userId, role: 'guru', nama: 'Guru Lewat', email: 'gl@uji.id', tenant_id: tenantId, gtk_id: gtkId }, SECRET, { expiresIn: '1h' })
  const pindai = await fetch(base + '/api/guru/sesi-kelas/qr', {
    method: 'POST', headers: { ...H, Authorization: `Bearer ${guruToken}` },
    body: JSON.stringify({ payload: kelas.payload }),
  }).then(r => r.json())

  assert.equal(pindai.ok, true, JSON.stringify(pindai).slice(0, 160))
  assert.equal(pindai.setelah_selesai, true, 'klien harus tahu kelas sudah berakhir')
  assert.ok(pindai.pesan, 'ada pesan yang bisa ditampilkan')
  const sesi = db.prepare('SELECT status, waktu_selesai FROM sesi_kelas_guru WHERE tenant_id=? AND guru_id=?').get(tenantId, gtkId)
  assert.equal(sesi.status, 'selesai', 'tidak boleh dibiarkan aktif setelah jam berakhir')
  assert.equal(sesi.waktu_selesai, selesai)
  db.close()
})

test('pemindai QR responsif: detektor native, stop tidak memblokir', () => {
  const baca = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const modal = baca('src/components/ScanQrKelasModal.tsx')
  assert.ok(modal.includes('useBarCodeDetectorIfSupported: true'),
    'harus memakai BarcodeDetector bawaan browser bila tersedia')
  assert.ok(/fps:\s*15/.test(modal), 'fps 15 agar QR terbaca dalam sedikit frame')
  assert.ok(modal.includes('disableFlip: true'), 'QR statis tidak perlu upaya mirroring')
  assert.ok(/diam\(qr\.stop\(\)\)/.test(modal), 'stop() dijalankan tanpa ditunggu')
  assert.ok(!/await\s*\(qr\.stop as any\)\(\)/.test(modal), 'stop() tidak boleh menahan validasi')
  const guru = baca('src/pages/guru/GuruDashboard.tsx')
  assert.ok(/setQrOpen\(false\)\s*\n\s*const idToast = toast\.loading/.test(guru),
    'kamera harus ditutup sebelum menunggu jaringan')
})

test('JTM 2: satu pindai QR menandai kedua jam, jurnal & absensi cukup sekali', async (t) => {
  // Uji ini membuat jadwal relatif terhadap "sekarang". Lewat pukul 22:50 WIB,
  // jjmm(+30/+70) menembus tengah malam: string jam membungkus ke "00:xx" dan
  // blok aktif tidak lagi cocok — hasilnya gagal palsu, bukan bug nyata.
  const sekarangWib = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false })
  const [h, m] = sekarangWib.split(':').map(Number)
  if (h * 60 + m > 22 * 60 + 50) {
    t.skip('mendekati tengah malam; jendela QR aktif tidak dapat diuji dengan jam relatif')
    return
  }
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })
  const base = `http://127.0.0.1:${port}`
  const H = { 'Content-Type': 'application/json' }
  const jjmm = (offsetMenit) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(Date.now() + offsetMenit * 60000))

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: H,
    body: JSON.stringify({ nama_lembaga: 'Uji JTM', nama: 'Admin', email: `jtm-${crypto.randomBytes(3).toString('hex')}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000006', domain_type: 'subdomain', slug: `jtm-${crypto.randomBytes(3).toString('hex')}` }),
  }).then(r => r.json())
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id

  const gtkId = crypto.randomUUID(), mapelId = crypto.randomUUID(), rombelId = crypto.randomUUID(), userId = crypto.randomUUID()
  const jamKe1 = crypto.randomUUID(), jamKe2 = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,jenis_kelamin,status) VALUES(?,?,?,?,'aktif')").run(gtkId, tenantId, 'Guru JTM', 'L')
  db.prepare("INSERT INTO mapel(id,tenant_id,nama,kode) VALUES(?,?,?,?)").run(mapelId, tenantId, 'Biologi', 'BIO')
  db.prepare('INSERT INTO rombel(id,tenant_id,nama,tingkat,tahun_ajaran) VALUES(?,?,?,?,?)').run(rombelId, tenantId, 'XII-1', '12', '2026/2027')
  const insJadwal = db.prepare(`INSERT INTO jadwal(id,tenant_id,gtk_id,mapel_id,rombel_id,hari,jam_mulai,jam_selesai,ruangan)
    VALUES(?,?,?,?,?,?,?,?,?)`)
  insJadwal.run(jamKe1, tenantId, gtkId, mapelId, rombelId, namaHari, jjmm(-10), jjmm(30), 'R1')
  insJadwal.run(jamKe2, tenantId, gtkId, mapelId, rombelId, namaHari, jjmm(30), jjmm(70), 'R1')
  db.prepare('INSERT INTO users(id,nama,email,password,role,tenant_id,gtk_id) VALUES(?,?,?,?,?,?,?)')
    .run(userId, 'Guru JTM', `guru-jtm-${crypto.randomBytes(3).toString('hex')}@uji.id`, 'x', 'guru', tenantId, gtkId)

  const qr = await fetch(base + '/api/admin/qr-kelas', { headers: { Authorization: `Bearer ${reg.token}` } }).then(r => r.json())
  const kelas = qr.kelas.find(k => k.id === rombelId)
  const guruToken = jwt.sign({ id: userId, role: 'guru', nama: 'Guru JTM', email: 'gj@uji.id', tenant_id: tenantId, gtk_id: gtkId }, SECRET, { expiresIn: '1h' })

  const pindai = await fetch(base + '/api/guru/sesi-kelas/qr', {
    method: 'POST', headers: { ...H, Authorization: `Bearer ${guruToken}` },
    body: JSON.stringify({ payload: kelas.payload }),
  }).then(r => r.json())

  assert.equal(pindai.ok, true, JSON.stringify(pindai).slice(0, 160))
  assert.equal(pindai.blok.jumlah_jam, 2, 'blok JTM 2 dikenali')
  assert.equal(pindai.jadwal.id, jamKe1, 'kunci jurnal/absensi = jam pertama')
  const sesi = db.prepare('SELECT jadwal_id,status FROM sesi_kelas_guru WHERE tenant_id=? AND guru_id=? ORDER BY jadwal_id').all(tenantId, gtkId)
  assert.equal(sesi.length, 2, 'kedua jam tercatat dalam satu pindai')
  // Status mengikuti jam dinding: lewat 23:59 kedua jam bisa tercatat sebagai
  // 'selesai' bila kini sudah melewati jam selesai (lewatSelesai). Yang dijamin
  // kontraknya adalah kedua jam tercatat SEKALI dan berstatus SAMA — bukan
  // status spesifik yang bergantung pada jam berapa tes dijalankan.
  assert.equal(new Set(sesi.map(x => x.status)).size, 1, 'kedua jam berstatus sama')

  // Absensi mapel dari jam KEDUA harus menulis ke jam pertama (satu absensi).
  const { blokDariId } = require('../server/jadwal-block.cjs')
  assert.equal(blokDariId(db, tenantId, jamKe2).blok[0].id, jamKe1)
  db.close()
})
