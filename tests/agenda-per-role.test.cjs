'use strict'
// Agenda pribadi per pengguna (semua peran) + agenda lembaga dari admin.
// Yang dijaga:
//  - setiap peran bisa menulis agenda sendiri,
//  - agenda pengguna A tidak terlihat pengguna B,
//  - agenda lembaga terlihat semua pengguna, status selesai per pengguna,
//  - validasi tanggal/judul, pemilik saja yang boleh ubah/hapus,
//  - agenda lembaga hanya dibuat/dihapus admin.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const hariIni = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-agenda-${process.pid}-${Date.now()}.db`)
  const port = 54000 + Math.floor(Math.random() * 200)
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

// Login mewajibkan CAPTCHA self-hosted (HMAC atas jawaban + timestamp),
// jadi uji membuat token yang sah sendiri.
const SECRET = 'k'.repeat(40)
function captcha(jawaban = '7') {
  const ts = Date.now()
  const sig = crypto.createHmac('sha256', SECRET).update(`${jawaban}.${ts}`).digest('hex')
  return { captchaToken: `${ts}.${sig}`, captchaJawaban: jawaban }
}

const panggil = (base, jalur, { metode = 'GET', token, body, host } = {}) =>
  fetch(base + jalur, {
    method: metode,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(host ? { 'X-Forwarded-Host': host } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

test('agenda: tiap peran menulis sendiri, tidak saling melihat', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const base = `http://127.0.0.1:${port}`

  const reg = await panggil(base, '/api/auth/register', {
    metode: 'POST',
    body: {
      nama_lembaga: 'Madrasah Agenda', nama: 'Admin', email: `ag-${crypto.randomBytes(3).toString('hex')}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000077', domain_type: 'subdomain', slug: `ag-${crypto.randomBytes(3).toString('hex')}`,
    },
  }).then(r => r.json())
  const adminToken = reg.token

  // Buat akun guru & siswa di lembaga yang sama.
  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  // Login meresolusi tenant dari Host; pasang domain uji lalu kirim header itu.
  const domainUji = `agenda-${crypto.randomBytes(2).toString('hex')}.test`
  db.prepare('UPDATE tenants SET domain_custom=? WHERE id=?').run(domainUji, tenantId)
  const bcrypt = require('bcryptjs')
  const buatUser = (peran, nama) => {
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO users(id,tenant_id,nama,email,password,role) VALUES(?,?,?,?,?,?)')
      .run(id, tenantId, nama, `${peran}-${id.slice(0, 6)}@uji.id`, bcrypt.hashSync('rahasia-uji-123', 4), peran)
    return { id, email: `${peran}-${id.slice(0, 6)}@uji.id` }
  }
  const guru = buatUser('guru', 'Guru Agenda')
  const siswa = buatUser('siswa', 'Siswa Agenda')
  db.close()

  const masuk = async (email) => (await panggil(base, '/api/auth/login', {
    metode: 'POST', host: domainUji, body: { email, password: 'rahasia-uji-123', ...captcha() },
  }).then(r => r.json())).token

  const guruToken = await masuk(guru.email)
  const siswaToken = await masuk(siswa.email)
  assert.ok(guruToken && siswaToken, 'login guru & siswa berhasil')

  // Guru menulis agenda sendiri.
  const tulisGuru = await panggil(base, '/api/agenda', {
    metode: 'POST', token: guruToken,
    body: { tanggal: hariIni, jam: '09:00', judul: 'Kumpulkan tugas VII-A', prioritas: 'tinggi', catatan: 'bawa kartu' },
  })
  assert.equal(tulisGuru.status, 201)

  // Siswa menulis agenda sendiri.
  assert.equal((await panggil(base, '/api/agenda', {
    metode: 'POST', token: siswaToken,
    body: { tanggal: hariIni, judul: 'Ulangan Matematika' },
  })).status, 201)

  const agendaGuru = await panggil(base, `/api/agenda?dari=${hariIni}&sampai=${hariIni}`, { token: guruToken }).then(r => r.json())
  assert.equal(agendaGuru.agenda.length, 1)
  assert.equal(agendaGuru.agenda[0].judul, 'Kumpulkan tugas VII-A')
  assert.equal(agendaGuru.agenda[0].prioritas, 'tinggi')
  assert.equal(agendaGuru.belum_selesai, 1)

  const agendaSiswa = await panggil(base, `/api/agenda?dari=${hariIni}&sampai=${hariIni}`, { token: siswaToken }).then(r => r.json())
  assert.equal(agendaSiswa.agenda.length, 1)
  assert.equal(agendaSiswa.agenda[0].judul, 'Ulangan Matematika', 'tidak melihat agenda guru')

  // Tandai selesai.
  const idGuru = agendaGuru.agenda[0].id
  assert.equal((await panggil(base, `/api/agenda/${idGuru}`, { metode: 'PATCH', token: guruToken, body: { selesai: true } })).status, 200)
  const sesudah = await panggil(base, `/api/agenda?dari=${hariIni}&sampai=${hariIni}`, { token: guruToken }).then(r => r.json())
  assert.equal(sesudah.agenda[0].selesai, true)
  assert.equal(sesudah.belum_selesai, 0)

  // Siswa tidak boleh mengubah agenda guru.
  assert.equal((await panggil(base, `/api/agenda/${idGuru}`, { metode: 'PATCH', token: siswaToken, body: { judul: 'dibajak' } })).status, 404)
  assert.equal((await panggil(base, `/api/agenda/${idGuru}`, { metode: 'DELETE', token: siswaToken })).status, 404)

  // Validasi.
  assert.equal((await panggil(base, '/api/agenda', { metode: 'POST', token: guruToken, body: { tanggal: '2026-13-45', judul: 'x' } })).status, 400)
  assert.equal((await panggil(base, '/api/agenda', { metode: 'POST', token: guruToken, body: { tanggal: hariIni, judul: '   ' } })).status, 400)

  // Agenda lembaga: admin boleh, guru tidak.
  assert.equal((await panggil(base, '/api/agenda-lembaga', {
    metode: 'POST', token: guruToken, body: { tanggal: hariIni, judul: 'Rapat guru' },
  })).status, 403)
  const bersama = await panggil(base, '/api/agenda-lembaga', {
    metode: 'POST', token: adminToken, body: { tanggal: hariIni, judul: 'Rapat dewan guru', jam: '13:00' },
  })
  assert.equal(bersama.status, 201)

  const lihatGuru = await panggil(base, `/api/agenda?dari=${hariIni}&sampai=${hariIni}`, { token: guruToken }).then(r => r.json())
  const itemBersama = lihatGuru.agenda.find(a => a.judul === 'Rapat dewan guru')
  assert.ok(itemBersama, 'guru melihat agenda lembaga')
  assert.equal(itemBersama.bersama, true)

  // Status selesai agenda lembaga per pengguna.
  assert.equal((await panggil(base, `/api/agenda-lembaga/${itemBersama.id}/selesai`, {
    metode: 'POST', token: guruToken, body: { selesai: true },
  })).status, 200)
  const guruLagi = await panggil(base, `/api/agenda?dari=${hariIni}&sampai=${hariIni}`, { token: guruToken }).then(r => r.json())
  assert.equal(guruLagi.agenda.find(a => a.judul === 'Rapat dewan guru').selesai, true)
  const siswaLagi = await panggil(base, `/api/agenda?dari=${hariIni}&sampai=${hariIni}`, { token: siswaToken }).then(r => r.json())
  assert.equal(siswaLagi.agenda.find(a => a.judul === 'Rapat dewan guru').selesai, false,
    'centang guru tidak menghapus centang milik siswa')

  // Hapus.
  assert.equal((await panggil(base, `/api/agenda/${idGuru}`, { metode: 'DELETE', token: guruToken })).status, 200)
  assert.equal((await panggil(base, `/api/agenda-lembaga/${itemBersama.id}`, { metode: 'DELETE', token: adminToken })).status, 200)
})

test('dasbor setiap peran memasang komponen agenda', () => {
  const fs = require('node:fs')
  const wajib = [
    'src/pages/admin/AdminDashboard.tsx',
    'src/pages/admin/MobileAdminDashboard.tsx',
    'src/pages/admin/SuperadminDashboard.tsx',
    'src/pages/admin/BendaharaDashboard.tsx',
    'src/pages/admin/MobileBendaharaDashboard.tsx',
    'src/pages/guru/GuruDashboard.tsx',
    'src/pages/guru/MobileGuruDashboard.tsx',
    'src/pages/siswa/SiswaDashboard.tsx',
    'src/pages/siswa/MobileSiswaDashboard.tsx',
    'src/pages/siswa/WaliDashboardPage.tsx',
    'src/pages/proktor/ProktorDashboardPage.tsx',
  ]
  for (const f of wajib) {
    const isi = fs.readFileSync(path.join(root, f), 'utf8')
    assert.match(isi, /AgendaHarian/, `${f} harus memasang AgendaHarian`)
  }
})
