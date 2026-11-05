'use strict'
// Broadcast WhatsApp dengan lampiran gambar:
//  - unggah gambar -> dikompres WebP, path /uploads/broadcast/...
//  - antrean WA menyimpan media_path/media_type
//  - broadcast_log menyimpan media_path
//  - worker mengirim { image: { url }, caption } dan jatuh ke teks bila media gagal
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')
const sharp = require('sharp')

const root = path.join(__dirname, '..')
const SECRET = 'k'.repeat(40)

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-bc-${process.pid}-${Date.now()}.db`)
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jk-media-'))
  const port = 50100 + Math.floor(Math.random() * 300)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: SECRET, NODE_ENV: 'test', MEDIA_ROOT: mediaRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 60000
  while (Date.now() < batas && !/running/i.test(out)) await new Promise(r => setTimeout(r, 150))
  if (!/running/i.test(out)) { try { proc.kill('SIGKILL') } catch { /* abaikan */ } assert.fail('server gagal start: ' + out.slice(-400)) }
  return { proc, port, dbFile, mediaRoot }
}

async function siapkan() {
  const { proc, port, dbFile, mediaRoot } = await boot()
  const base = `http://127.0.0.1:${port}`
  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama_lembaga: 'Uji Broadcast', nama: 'Admin', email: `bc-${crypto.randomBytes(3).toString('hex')}@uji.id`, password: 'rahasia-uji-123', no_hp: '081200000010', domain_type: 'subdomain', slug: `bc-${crypto.randomBytes(3).toString('hex')}` }),
  }).then(r => r.json())
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  db.prepare("INSERT INTO siswa(id,tenant_id,nama,nis,jenis_kelamin,no_hp,status) VALUES(?,?,?,?,?,?,'aktif')")
    .run(crypto.randomUUID(), tenantId, 'Siswa Uji', '9001', 'L', '081200009999')
  // Gateway harus aktif agar pesan masuk antrean (bukan langsung gagal).
  db.prepare('DELETE FROM wa_gateway_config WHERE tenant_id=?').run(tenantId)
  db.prepare("INSERT INTO wa_gateway_config(id,provider,enabled,tenant_id) VALUES(?,'baileys',1,?)").run('wa_' + tenantId, tenantId)
  return { proc, base, db, tenantId, mediaRoot, token: reg.token }
}

test('unggah gambar: dikompres ke WebP dan ditolak bila bukan gambar', async (t) => {
  const s = await siapkan()
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 20, g: 120, b: 200 } } }).png().toBuffer()
  const fd = new FormData()
  fd.append('gambar', new Blob([png], { type: 'image/png' }), 'uji.png')
  const r = await fetch(s.base + '/api/broadcast/upload', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` }, body: fd })
  assert.equal(r.status, 200)
  const isi = await r.json()
  assert.match(isi.path, /^\/uploads\/broadcast\/.+\.webp$/)
  assert.equal(isi.type, 'image/webp')
  const berkas = path.join(s.mediaRoot, isi.path.replace(/^\/?uploads\//, ''))
  assert.ok(fs.existsSync(berkas), 'berkas tersimpan di MEDIA_ROOT')

  const fd2 = new FormData()
  fd2.append('gambar', new Blob([Buffer.from('bukan gambar')], { type: 'text/plain' }), 'a.txt')
  const r2 = await fetch(s.base + '/api/broadcast/upload', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` }, body: fd2 })
  assert.ok(r2.status === 400 || r2.status === 500, 'file non-gambar harus ditolak, dapat ' + r2.status)
  s.db.close()
})

test('broadcast dengan gambar: media tersimpan di log dan antrean', async (t) => {
  const s = await siapkan()
  t.after(() => { try { s.proc.kill('SIGKILL') } catch { /* abaikan */ } })

  const png = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer()
  const fd = new FormData()
  fd.append('gambar', new Blob([png], { type: 'image/png' }), 'b.png')
  const up = await fetch(s.base + '/api/broadcast/upload', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` }, body: fd }).then(x => x.json())

  const r = await fetch(s.base + '/api/broadcast/quick', {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kategori: 'semua_siswa', pesan: 'Pengumuman bergambar', media_path: up.path }),
  })
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()).slice(0, 160))

  const log = s.db.prepare('SELECT media_path FROM broadcast_log ORDER BY created_at DESC LIMIT 1').get()
  assert.equal(log.media_path, up.path)

  await new Promise(res => setTimeout(res, 400))
  const antre = s.db.prepare('SELECT media_path, media_type, message FROM wa_queue ORDER BY created_at DESC LIMIT 1').get()
  assert.equal(antre.media_path, up.path)
  assert.equal(antre.media_type, 'image/webp')
  assert.equal(antre.message, 'Pengumuman bergambar')

  // Path lampiran di luar folder broadcast ditolak.
  const bad = await fetch(s.base + '/api/broadcast/quick', {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kategori: 'semua_siswa', pesan: 'x', media_path: '/uploads/signatures/a.webp' }),
  })
  assert.equal(bad.status, 400)
  s.db.close()
})

test('worker mengirim gambar dengan caption dan punya fallback teks', () => {
  const worker = fs.readFileSync(path.join(root, 'server/wa-worker.mjs'), 'utf8')
  assert.match(worker, /image: \{ url: file \}, caption/, 'gambar dikirim dengan caption')
  assert.match(worker, /document: \{ url: file \}/, 'dokumen didukung')
  assert.match(worker, /media gagal, kirim teks saja/, 'fallback ke teks bila media gagal')
})
