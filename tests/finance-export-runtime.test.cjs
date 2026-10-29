// Runtime end-to-end untuk ekspor laporan keuangan: server sungguhan dengan DB
// sementara, login admin, seed tagihan/tabungan/buku kas, lalu buktikan bahwa
// filter rentang tanggal (mulai/selesai) dan endpoint /api/tabungan/laporan
// mengembalikan data yang tepat — bukan cuma grep di sumber.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')

const root = path.join(__dirname, '..')

function seedDb(file, passwordHash) {
  const db = new Database(file)
  // tenant default sudah dibuat migrasi; sisipkan user admin + master data
  const uid = crypto.randomUUID()
  db.prepare(`INSERT INTO users (id, nama, email, password, role, tenant_id, created_at)
    VALUES (?, 'Admin Uji', 'admin@uji.id', ?, 'admin', 'default', datetime('now'))`).run(uid, passwordHash)
  const siswaId = crypto.randomUUID()
  db.prepare(`INSERT INTO siswa (id, nis, nama, jenis_kelamin, status, tenant_id)
    VALUES (?, '2001', 'Budi Santoso', 'L', 'aktif', 'default')`).run(siswaId)
  // jenis tagihan + 3 tagihan (2 lunas di tanggal berbeda)
  const jtId = crypto.randomUUID()
  db.prepare(`INSERT INTO jenis_tagihan (id, nama, nominal, tenant_id) VALUES (?, 'SPP', 150000, 'default')`).run(jtId)
  const insT = db.prepare(`INSERT INTO tagihan (id, siswa_id, jenis_tagihan_id, bulan, tahun, nominal, status, tanggal_bayar, tenant_id)
    VALUES (?, ?, ?, 'Oktober', '2026', ?, ?, ?, 'default')`)
  insT.run(crypto.randomUUID(), siswaId, jtId, 150000, 'lunas', '2026-10-01')
  insT.run(crypto.randomUUID(), siswaId, jtId, 150000, 'lunas', '2026-10-15')
  insT.run(crypto.randomUUID(), siswaId, jtId, 150000, 'belum_bayar', null)
  // tabungan: setor di dua tanggal berbeda
  const insS = db.prepare(`INSERT INTO tabungan (id, siswa_id, tanggal, tipe, nominal, keterangan, saldo_akhir, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'default')`)
  insS.run(crypto.randomUUID(), siswaId, '2026-10-05', 'setor', 50000, 'setoran', 50000)
  insS.run(crypto.randomUUID(), siswaId, '2026-10-20', 'setor', 25000, 'setoran', 75000)
  // buku kas via keuangan_transaksi (akun Buku Kas + kategori)
  const akunId = crypto.randomUUID()
  db.prepare(`INSERT INTO keuangan_akun (id, nama, saldo_awal, tenant_id) VALUES (?, 'Buku Kas', 0, 'default')`).run(akunId)
  const katId = crypto.randomUUID()
  db.prepare(`INSERT INTO keuangan_kategori (id, nama, tipe, tenant_id) VALUES (?, 'Buku Kas Debet', 'masuk', 'default')`).run(katId)
  const insK = db.prepare(`INSERT INTO keuangan_transaksi (id, tanggal, akun_id, kategori_id, tipe, nominal, keterangan, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'default')`)
  insK.run(crypto.randomUUID(), '2026-10-02', akunId, katId, 'masuk', 100000, 'SPP Budi')
  insK.run(crypto.randomUUID(), '2026-10-18', akunId, katId, 'keluar', 30000, 'ATK')
  db.close()
}

async function startServer(dbFile) {
  const port = 39500 + Math.floor(Math.random() * 400)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 30000
  while (Date.now() < batas && !out.includes('JURNALKU API Server running')) {
    await new Promise(r => setTimeout(r, 200))
  }
  assert.ok(out.includes('JURNALKU API Server running'), 'server harus start:\n' + out.slice(-800))
  return { proc, port }
}

async function login(port) {
  // CAPTCHA guard: ambil tantangan lalu jawab (soal matematika self-hosted).
  const chall = await fetch(`http://127.0.0.1:${port}/api/captcha/challenge`).then(r => r.json())
  assert.ok(chall.token && chall.soal, 'challenge captcha harus ada')
  // Soal captcha berbentuk aritmetika sederhana ("3 + 4"); evaluasi aman karena
  // hanya boleh memuat angka dan operator + - *.
  assert.ok(/^[\d\s+\-*]+$/.test(chall.soal), 'soal captcha harus aritmetika sederhana')
  const jawaban = String(new Function(`return (${chall.soal})`)())
  const r = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@uji.id', password: 'rahasia-uji-123', captchaToken: chall.token, captchaJawaban: jawaban }),
  })
  const loginText = await r.text()
  assert.equal(r.status, 200, 'login harus 200: ' + loginText.slice(0, 200))
  const data = JSON.parse(loginText)
  assert.ok(data.token, 'token JWT harus ada')
  return data.token
}

test('ekspor keuangan runtime: filter rentang, laporan tabungan, saldo buku kas', async () => {
  const dbFile = path.join(os.tmpdir(), `jurnalku-fin-exp-${process.pid}-${Date.now()}.db`)
  const { proc, port } = await startServer(dbFile)
  const base = `http://127.0.0.1:${port}`
  try {
    // Seed SETELAH server start: migrasi server yang membuat tabel (termasuk
    // kolom tenant_id di users yang hanya ada lewat ALTER pada boot).
    seedDb(dbFile, bcrypt.hashSync('rahasia-uji-123', 10))
    const token = await login(port)
    const get = async (p) => {
      const r = await fetch(base + p, { headers: { Authorization: `Bearer ${token}` } })
      return { status: r.status, data: await r.json().catch(() => null) }
    }

    // --- tagihan: rentang tanggal bayar harian (14-16 Okt) ---
    const harian = await get('/api/tagihan?mulai=2026-10-14&selesai=2026-10-16')
    assert.equal(harian.status, 200)
    assert.equal(harian.data.length, 1, 'hanya tagihan yang dibayar 15 Okt lolos rentang harian')
    assert.equal(harian.data[0].tanggal_bayar, '2026-10-15')

    const bulanBayar = await get('/api/tagihan?bulan_bayar=2026-10')
    assert.equal(bulanBayar.data.length, 2, 'bulan bayar menangkap kedua pembayaran Oktober')

    // --- tabungan laporan lintas siswa ---
    const lapTab = await get('/api/tabungan/laporan?mulai=2026-10-01&selesai=2026-10-31')
    assert.equal(lapTab.status, 200)
    assert.equal(lapTab.data.length, 2, 'dua mutasi tabungan Oktober')
    assert.equal(lapTab.data[0].siswa_nama, 'Budi Santoso', 'join siswa membawa nama')
    assert.equal(lapTab.data[0].nis, '2001', 'join siswa membawa NIS')

    const lapTabHarian = await get('/api/tabungan/laporan?mulai=2026-10-20&selesai=2026-10-20')
    assert.equal(lapTabHarian.data.length, 1, 'rentang satu hari hanya 1 mutasi')

    // --- buku kas: saldo akhir periode tetap posisi penuh, bukan mutasi rentang ---
    const bk = await get('/api/buku-kas?mulai=2026-10-01&selesai=2026-10-02')
    assert.equal(bk.status, 200)
    assert.equal(bk.data.length, 1, 'hanya transaksi 2 Okt yang tampil')
    assert.equal(bk.data[0].debet, 100000)
    assert.equal(bk.data[0].saldo, 100000, 'saldo berjalan benar untuk baris pertama')

    const bk2 = await get('/api/buku-kas?mulai=2026-10-18&selesai=2026-10-31')
    assert.equal(bk2.data.length, 1, 'hanya transaksi 18 Okt yang tampil')
    assert.equal(bk2.data[0].saldo, 70000, 'saldo 18 Okt = 100000 - 30000 (posisi akhir, bukan mutasi rentang)')

    // rentang tidak valid -> diabaikan (200, semua baris)
    const bkInvalid = await get('/api/buku-kas?mulai=bukan-tanggal')
    assert.equal(bkInvalid.status, 200)
    assert.equal(bkInvalid.data.length, 2, 'rentang tidak valid diabaikan, semua baris tampil')
  } finally {
    proc.kill('SIGKILL')
    for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) { try { fs.unlinkSync(f) } catch { /* bersih */ } }
  }
})
