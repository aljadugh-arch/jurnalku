'use strict'
// Pengingat WA ke guru: sesi/jam pelajaran sudah berakhir tetapi absensi mapel
// belum diisi. Yang dijaga:
//  - hanya setelah jam selesai (tidak mendahului),
//  - maksimal 3 jam setelahnya (tidak mengirim malam),
//  - satu pesan per guru+mapel+rombel+tanggal (idempotency),
//  - dilewati bila absensi sudah terisi,
//  - hanya bila sakelar notif dinyalakan.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
const hariIni = HARI[new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getDay()]
const tanggalIni = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

test('scheduler mengingatkan hanya saat jadwal selesai dan absensi kosong', async (t) => {
  const dbFile = path.join(os.tmpdir(), `jk-notif-${process.pid}-${Date.now()}.db`)
  const port = 51200 + Math.floor(Math.random() * 200)
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
      nama_lembaga: 'Uji Notif', nama: 'Admin', email: `nt-${crypto.randomBytes(3).toString('hex')}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000013', domain_type: 'subdomain', slug: `nt-${crypto.randomBytes(3).toString('hex')}`,
    }),
  }).then(r => r.json())

  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  const gtkId = crypto.randomUUID()
  const mapelId = crypto.randomUUID()
  const rombelId = crypto.randomUUID()
  const jadwalId = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,nip,jenis_kelamin,status,status_kepegawaian,no_hp) VALUES(?,?,?,?,?,'aktif','Aktif',?)")
    .run(gtkId, tenantId, 'Guru Uji', '1980002', 'L', '081200007777')
  db.prepare("INSERT INTO mapel(id,nama,kode,tenant_id) VALUES(?,?,?,?)").run(mapelId, 'Fikih', 'FKH', tenantId)
  db.prepare("INSERT INTO rombel(id,nama,tingkat,tahun_ajaran,tenant_id) VALUES(?,?,?,?,?)").run(rombelId, 'VII-A', '7', '2026/2027', tenantId)
  db.prepare(`INSERT INTO jadwal(id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,tenant_id)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(jadwalId, mapelId, rombelId, gtkId, hariIni, '07:00', '08:30', 'VII-A', tenantId)

  const q = require('../server/wa-queue.cjs')
  const ctx = { tenantId, date: tanggalIni }

  // Sakelar mati -> tidak ada pesan.
  assert.equal(q.queueAbsensiMapelBelum(db, { ...ctx, time: '09:00' }).queued, 0)

  db.prepare("UPDATE notif_settings SET notif_absensi_mapel_belum=1 WHERE tenant_id=?").run(tenantId)

  // Belum selesai -> tidak ada pesan.
  assert.equal(q.queueAbsensiMapelBelum(db, { ...ctx, time: '08:00' }).queued, 0)

  // Sudah selesai -> satu pesan.
  const r1 = q.queueAbsensiMapelBelum(db, { ...ctx, time: '09:00' })
  assert.equal(r1.queued, 1)

  // Tick berikutnya tidak menggandakan.
  const r2 = q.queueAbsensiMapelBelum(db, { ...ctx, time: '09:05' })
  assert.equal(r2.queued, 0)

  const pesan = db.prepare("SELECT phone,message FROM wa_queue WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1").get(tenantId)
  assert.equal(pesan.phone, '6281200007777')
  assert.match(pesan.message, /Fikih/)
  assert.match(pesan.message, /VII-A/)
  assert.match(pesan.message, /08:30/)

  // Terlalu lama (lebih dari 3 jam) -> tidak dikirim untuk mapel lain.
  db.prepare("UPDATE wa_queue SET status='sent' WHERE tenant_id=?").run(tenantId)
  const mapel2 = crypto.randomUUID()
  db.prepare("INSERT INTO mapel(id,nama,kode,tenant_id) VALUES(?,?,?,?)").run(mapel2, 'Matematika', 'MTK', tenantId)
  db.prepare(`INSERT INTO jadwal(id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,tenant_id)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), mapel2, rombelId, gtkId, hariIni, '10:00', '11:30', 'VII-A', tenantId)
  assert.equal(q.queueAbsensiMapelBelum(db, { ...ctx, time: '18:00' }).queued, 0, 'di luar 3 jam tidak dikirim')

  // Bila absensi sudah ada -> tidak dikirim.
  const siswaId = crypto.randomUUID()
  db.prepare("INSERT INTO siswa(id,tenant_id,nama,nis,jenis_kelamin,rombel_id,status) VALUES(?,?,?,?,?,?,'aktif')")
    .run(siswaId, tenantId, 'Siswa B', '7002', 'P', rombelId)
  db.prepare(`INSERT INTO absensi_mapel(id,tenant_id,tanggal,mapel_id,rombel_id,siswa_id,status,jadwal_id,guru_id)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), tenantId, tanggalIni, mapel2, rombelId, siswaId, 'hadir', jadwalId, gtkId)
  assert.equal(q.queueAbsensiMapelBelum(db, { ...ctx, time: '11:45' }).queued, 0, 'sudah diisi tidak diingatkan')

  db.close()
})

test('UI pengaturan notifikasi memuat sakelar dan template baru', () => {
  const ui = fs.readFileSync(path.join(root, 'src/pages/admin/NotifSettingsPage.tsx'), 'utf8')
  assert.match(ui, /notif_absensi_mapel_belum/)
  assert.match(ui, /Pengingat Absensi Mapel/)
  assert.match(ui, /template_absensi_mapel_belum/)
})
