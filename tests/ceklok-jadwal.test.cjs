'use strict'
// Dua hal yang diperiksa:
//  1. Rekap per mapel benar-benar diambil UI (dulu penjaga efek memakai
//     mapel.tanggal yang sudah terisi hari ini, jadi API tak pernah dipanggil).
//  2. Ceklok GTK menampilkan jadwal hari ini dan bisa disaring hanya yang
//     mengajar, plus ringkasan jumlahnya.
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

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-ceklok-${process.pid}-${Date.now()}.db`)
  const port = 50500 + Math.floor(Math.random() * 300)
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

test('UI rekap per mapel memakai penanda muat, bukan tanggal awal', () => {
  const ui = fs.readFileSync(path.join(root, 'src/pages/admin/MobileAttendanceSummary.tsx'), 'utf8')
  assert.match(ui, /const \[mapelDimuat, setMapelDimuat\] = useState<string \| null>\(null\)/)
  assert.match(ui, /if \(tab !== 'mapel' \|\| mapelDimuat === tanggal\) return/)
  assert.doesNotMatch(ui, /if \(tab !== 'mapel' \|\| mapel\.tanggal === tanggal\) return/,
    'penjaga lama tidak boleh kembali')
  assert.match(ui, /setMapel\(res\.data\); setMapelDimuat\(tanggal\)/)
})

test('ceklok: jadwal hari ini ikut dikirim dan bisa disaring', async (t) => {
  const { proc, port, dbFile } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const base = `http://127.0.0.1:${port}`

  const reg = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_lembaga: 'Uji Ceklok', nama: 'Admin', email: `ck-${crypto.randomBytes(3).toString('hex')}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000011', domain_type: 'subdomain', slug: `ck-${crypto.randomBytes(3).toString('hex')}`,
    }),
  }).then(r => r.json())

  const db = new Database(dbFile)
  const tenantId = db.prepare('SELECT tenant_id FROM users ORDER BY created_at DESC LIMIT 1').get().tenant_id
  const mapelId = crypto.randomUUID()
  const rombelId = crypto.randomUUID()
  db.prepare("INSERT INTO mapel(id,nama,kode,tenant_id) VALUES(?,?,?,?)").run(mapelId, 'Matematika', 'MTK', tenantId)
  db.prepare("INSERT INTO rombel(id,nama,tingkat,tahun_ajaran,tenant_id) VALUES(?,?,?,?,?)").run(rombelId, 'VII-A', '7', '2026/2027', tenantId)

  const buatGuru = (nama, denganJadwal) => {
    const gtkId = crypto.randomUUID()
    db.prepare("INSERT INTO gtk(id,tenant_id,nama,nip,jenis_kelamin,status_kepegawaian) VALUES(?,?,?,?,?,'Aktif')").run(gtkId, tenantId, nama, '1980' + gtkId.slice(0, 4), 'L')
    if (denganJadwal) {
      db.prepare(`INSERT INTO jadwal(id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,tenant_id)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), mapelId, rombelId, gtkId, hariIni, '07:00', '08:30', 'VII-A', tenantId)
    }
    return gtkId
  }
  const guruTerjadwal = buatGuru('Guru Terjadwal', true)
  const guruTanpaJadwal = buatGuru('Guru Tanpa Jadwal', false)

  // Akun untuk kedua guru agar keduanya masuk daftar ceklok.
  for (const gtkId of [guruTerjadwal, guruTanpaJadwal]) {
    db.prepare("INSERT INTO users(id,nama,email,password,role,tenant_id,gtk_id) VALUES(?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), 'x', `${gtkId}@uji.id`, 'x', 'guru', tenantId, gtkId)
  }
  db.close()

  const semua = await fetch(base + '/api/ceklok/admin', { headers: { Authorization: `Bearer ${reg.token}` } }).then(r => r.json())
  const barisTerjadwal = semua.records.find(r => r.guru_id === guruTerjadwal)
  const barisTanpa = semua.records.find(r => r.guru_id === guruTanpaJadwal)
  assert.ok(barisTerjadwal?.jadwal, 'guru dengan jadwal punya info jadwal')
  assert.equal(barisTerjadwal.jadwal.jtm, 1)
  assert.equal(barisTerjadwal.jadwal.mulai, '07:00')
  assert.equal(barisTanpa?.jadwal, null, 'guru tanpa jadwal ditandai null')
  assert.equal(semua.summary.mengajar_hari_ini >= 1, true)

  const saring = await fetch(base + '/api/ceklok/admin?hanya_mengajar=1', { headers: { Authorization: `Bearer ${reg.token}` } }).then(r => r.json())
  assert.equal(saring.records.some(r => r.guru_id === guruTanpaJadwal), false, 'guru tanpa jadwal tersaring')
  assert.equal(saring.records.some(r => r.guru_id === guruTerjadwal), true)
})
