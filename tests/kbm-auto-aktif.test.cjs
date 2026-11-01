'use strict'
// KBM otomatis aktif: semua hari non-libur aktif; hari libur (mis. Minggu)
// tetap non-aktif KECUALI ada kegiatan (ekskul/ujian/kegiatan sekolah).
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const root = path.join(__dirname, '..')
const acak = () => Math.random().toString(36).slice(2, 8)

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jurnalku-kbm-${process.pid}-${Date.now()}.db`)
  const port = 40800 + Math.floor(Math.random() * 500)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: 'k'.repeat(40), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 60000
  while (Date.now() < batas && !out.includes('JURNALKU API Server running')) {
    await new Promise(r => setTimeout(r, 150))
  }
  if (!out.includes('JURNALKU API Server running')) {
    try { proc.kill('SIGKILL') } catch {}
    assert.fail('server gagal start:\n' + out.slice(-600))
  }
  return { proc, port }
}

const hariMinggu = (() => {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)) // Minggu berikutnya
  return d.toISOString().slice(0, 10)
})()

test('hari libur tanpa kegiatan non-aktif; dengan kegiatan jadi aktif', async (t) => {
  const { proc, port } = await boot()
  const base = `http://127.0.0.1:${port}`
  t.after(() => { try { proc.kill('SIGKILL') } catch {} })

  // 1. Daftar tenant (admin otomatis)
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_lembaga: 'Uji KBM', nama: 'Admin KBM', email: `kbm-${acak()}@uji.id`,
      password: 'rahasia-uji-123', no_hp: '081200000009', domain_type: 'subdomain', slug: `kbm-${acak()}`,
    }),
  }).then(r => r.json())
  assert.ok(reg.token, 'token admin dari registrasi')
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` }

  // 2. Nyalakan KBM otomatis + libur Minggu
  const put = await fetch(`${base}/api/settings`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({
      nama_lembaga: 'Uji KBM', hari_libur: ['minggu'], kbm_auto_aktif: true,
      dashboard_quick_menus: ['siswa'],
    }),
  })
  assert.equal(put.status, 200, 'setelan tersimpan')

  // 3. Hari kerja (Senin) aktif otomatis
  const senin = (() => { const d = new Date(hariMinggu); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
  const stSenin = await fetch(`${base}/api/kalender-kbm/status?tanggal=${senin}`, { headers: auth }).then(r => r.json())
  assert.equal(stSenin.libur, false)
  assert.equal(stSenin.aktif, true, 'hari kerja aktif otomatis')
  assert.equal(stSenin.sumber, 'otomatis')

  // 4. Minggu tanpa kegiatan -> non-aktif
  const stLibur = await fetch(`${base}/api/kalender-kbm/status?tanggal=${hariMinggu}`, { headers: auth }).then(r => r.json())
  assert.equal(stLibur.libur, true)
  assert.equal(stLibur.aktif, false, 'Minggu tanpa kegiatan harus non-aktif')

  // 5. Tambah kegiatan pada hari Minggu -> jadi aktif
  const keg = await fetch(`${base}/api/kegiatan-khusus`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ nama: 'Ekskul Pramuka', jenis: 'insidental', tanggal: hariMinggu, deskripsi: 'Kegiatan sekolah' }),
  })
  assert.equal(keg.status, 200)

  const stAktif = await fetch(`${base}/api/kalender-kbm/status?tanggal=${hariMinggu}`, { headers: auth }).then(r => r.json())
  assert.equal(stAktif.libur, true, 'tetap tercatat libur')
  assert.equal(stAktif.aktif, true, 'kegiatan membuat hari libur menjadi aktif')
  assert.equal(stAktif.sumber, 'kegiatan')
  assert.equal(stAktif.kegiatan?.nama, 'Ekskul Pramuka')

  // 6. Kalender bulanan memuat entri kegiatan pada tanggal itu
  const [tahun, bulan] = hariMinggu.split('-')
  const kal = await fetch(`${base}/api/kalender-kbm?year=${tahun}&month=${bulan}`, { headers: auth }).then(r => r.json())
  const entri = kal.find(x => x.tanggal === hariMinggu)
  assert.ok(entri, 'tanggal kegiatan muncul di kalender')
  assert.equal(entri.jenis, 'kegiatan_lain')
})
