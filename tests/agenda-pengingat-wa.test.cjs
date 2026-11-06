'use strict'
// Pengingat WA untuk agenda pribadi. Yang dijaga:
//  - hanya agenda dengan jam dan belum selesai,
//  - dikirim saat target waktu (jam - "ingatkan sebelum") tiba, toleransi 5 menit,
//  - satu pesan per agenda per hari (idempotency),
//  - nomor diambil dari GTK atau siswa (data yang memang ada),
//  - agenda lembaga tidak dikirim lewat WA (mencegah spam ke semua pengguna),
//  - sakelar notif_agenda harus menyala.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const hariIni = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

test('pengingat agenda dikirim sekali, hanya untuk agenda berjam dan belum selesai', async (t) => {
  const dbFile = path.join(os.tmpdir(), `jk-agr-${process.pid}-${Date.now()}.db`)
  const port = 54400 + Math.floor(Math.random() * 200)
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
      nama_lembaga: 'Madrasah Agenda WA', nama: 'Admin', email: `agr-${crypto.randomBytes(3).toString('hex')}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000055', domain_type: 'subdomain', slug: `agr-${crypto.randomBytes(3).toString('hex')}`,
    }),
  })

  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id
  const gtkId = crypto.randomUUID()
  db.prepare("INSERT INTO gtk(id,tenant_id,nama,nip,jenis_kelamin,status,no_hp) VALUES(?,?,?,?,?,'aktif',?)")
    .run(gtkId, tenantId, 'Ustadz Pengingat', '1980099', 'L', '081200008888')
  db.prepare('UPDATE users SET gtk_id=? WHERE id=?').run(gtkId, userId)

  const agendaId = crypto.randomUUID()
  db.prepare(`INSERT INTO agenda_pribadi (id,tenant_id,user_id,tanggal,jam,judul,catatan,prioritas,pengingat_menit,selesai,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,0,datetime('now'))`).run(
    agendaId, tenantId, userId, hariIni, '10:00', 'Rapat kurikulum', 'bawa dokumen', 'tinggi', 15,
  )

  const q = require('../server/wa-queue.cjs')
  const ctx = { tenantId, date: hariIni }

  // Sakelar mati -> tidak ada pesan.
  assert.equal(q.queueAgendaReminders(db, { ...ctx, time: '09:45' }).queued, 0)

  db.prepare('UPDATE notif_settings SET notif_agenda=1 WHERE tenant_id=?').run(tenantId)

  // Belum waktunya (target 09:45 karena ingatkan 15 menit sebelum).
  assert.equal(q.queueAgendaReminders(db, { ...ctx, time: '09:30' }).queued, 0)

  // Tepat target -> satu pesan.
  const r1 = q.queueAgendaReminders(db, { ...ctx, time: '09:45' })
  assert.equal(r1.queued, 1)

  // Tick berikutnya tidak menggandakan.
  assert.equal(q.queueAgendaReminders(db, { ...ctx, time: '09:47' }).queued, 0)

  const pesan = db.prepare("SELECT phone,message FROM wa_queue WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1").get(tenantId)
  assert.equal(pesan.phone, '6281200008888')
  assert.match(pesan.message, /Rapat kurikulum/)
  assert.match(pesan.message, /10:00/)
  assert.match(pesan.message, /bawa dokumen/)

  // Agenda tanpa jam tidak dikirim.
  db.prepare(`INSERT INTO agenda_pribadi (id,tenant_id,user_id,tanggal,jam,judul,selesai,updated_at)
    VALUES (?,?,?,?,NULL,?,0,datetime('now'))`).run(crypto.randomUUID(), tenantId, userId, hariIni, 'Tanpa jam')
  assert.equal(q.queueAgendaReminders(db, { ...ctx, time: '10:00' }).queued, 0)

  // Agenda lembaga tidak dikirim lewat WA.
  db.prepare(`INSERT INTO agenda_lembaga (id,tenant_id,tanggal,jam,judul) VALUES (?,?,?,?,?)`)
    .run(crypto.randomUUID(), tenantId, hariIni, '10:00', 'Agenda bersama')
  const r2 = q.queueAgendaReminders(db, { ...ctx, time: '10:00' })
  assert.equal(r2.queued, 0, 'agenda lembaga tidak dikirim ke WA')

  // Agenda yang sudah selesai tidak dikirim.
  db.prepare('UPDATE agenda_pribadi SET selesai=1 WHERE id=?').run(agendaId)
  db.prepare("DELETE FROM wa_queue WHERE tenant_id=?").run(tenantId)
  assert.equal(q.queueAgendaReminders(db, { ...ctx, time: '10:00' }).queued, 0)

  db.close()
})

test('UI pengaturan memuat sakelar pengingat agenda', () => {
  const fs = require('node:fs')
  const ui = fs.readFileSync(path.join(root, 'src/pages/admin/NotifSettingsPage.tsx'), 'utf8')
  assert.match(ui, /notif_agenda/)
  assert.match(ui, /Pengingat Agenda/)
  assert.match(ui, /template_agenda/)

  const komponen = fs.readFileSync(path.join(root, 'src/components/AgendaHarian.tsx'), 'utf8')
  assert.match(komponen, /pengingat_menit: Number\(form\.ingatkan\)/)
  assert.match(komponen, /Ingatkan lewat WhatsApp/)
})
