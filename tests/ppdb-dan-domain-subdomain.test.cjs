'use strict'
// Tes PPDB + daftar domain subdomain. DB sementara — tidak menyentuh produksi.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(48)
const Database = require('better-sqlite3')
const AKAR = path.join(__dirname, '..')
const ppdb = require(path.join(AKAR, 'server/ppdb.cjs'))

function dbPpdb() {
  const f = path.join(os.tmpdir(), 'ppdb-tes-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.db')
  const db = new Database(f)
  db.exec('PRAGMA foreign_keys=ON')
  db.exec(`CREATE TABLE IF NOT EXISTS siswa (
    id TEXT PRIMARY KEY, tenant_id TEXT, nis TEXT NOT NULL, nisn TEXT, nik TEXT, nama TEXT NOT NULL,
    jenis_kelamin TEXT, tempat_lahir TEXT, tanggal_lahir TEXT, alamat TEXT, no_hp TEXT,
    nama_ortu TEXT, rombel_id TEXT, status TEXT DEFAULT 'aktif')`)
  ppdb.setupPpdbTables(db)
  return { db, f }
}

const isiGelombang = (db, T, extra = {}) => {
  const svc = ppdb.buatLayananPpdb(db, { logger: { error() { } } })
  const g = svc.simpanGelombang(T, { nama: 'Gelombang 1', tahun_ajaran: '2026/2027', dibuka: 1, kuota: 40, ...extra })
  return { svc, g }
}

test('PPDB: pendaftaran publik ditolak bila gelombang belum dibuka', () => {
  const { db, f } = dbPpdb()
  try {
    const svc = ppdb.buatLayananPpdb(db, { logger: { error() { } } })
    const r = svc.daftarPublik('t1', { nama: 'Calon Siswa', jenis_kelamin: 'L' })
    assert.strictEqual(r.ok, false)
    assert.match(r.error, /belum dibuka/i)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: nomor pendaftaran urut dan berformat PPDB-<tahun>-<urut>', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    const a = svc.daftarPublik('t1', { nama: 'Siswa A', jenis_kelamin: 'L', nisn: '1111111111' })
    const b = svc.daftarPublik('t1', { nama: 'Siswa B', jenis_kelamin: 'P', nisn: '2222222222' })
    assert.strictEqual(a.pendaftar.nomor_daftar, 'PPDB-2026-0001')
    assert.strictEqual(b.pendaftar.nomor_daftar, 'PPDB-2026-0002')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: NISN ganda ditolak, NISN salah panjang ditolak', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    svc.daftarPublik('t1', { nama: 'Siswa A', jenis_kelamin: 'L', nisn: '1234567890' })
    const dup = svc.daftarPublik('t1', { nama: 'Siswa B', jenis_kelamin: 'P', nisn: '1234567890' })
    assert.strictEqual(dup.ok, false)
    assert.match(dup.error, /sudah terdaftar/i)
    const pendek = svc.daftarPublik('t1', { nama: 'Siswa C', jenis_kelamin: 'L', nisn: '123' })
    assert.strictEqual(pendek.ok, false)
    assert.match(pendek.error, /10 digit/i)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: NISN sama di TENANT LAIN tetap boleh (isolasi tenant)', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    svc.simpanGelombang('t2', { nama: 'Gelombang 1', tahun_ajaran: '2026/2027', dibuka: 1 })
    const a = svc.daftarPublik('t1', { nama: 'Siswa A', jenis_kelamin: 'L', nisn: '9999999999' })
    const b = svc.daftarPublik('t2', { nama: 'Siswa B', jenis_kelamin: 'P', nisn: '9999999999' })
    assert.strictEqual(a.ok, true)
    assert.strictEqual(b.ok, true, 'NISN yang sama di lembaga lain tidak boleh ditolak')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: alur lengkap daftar -> verifikasi -> daftar ulang -> antrian -> jadi siswa', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    const r = svc.daftarPublik('t1', { nama: 'Ahmad Calon', jenis_kelamin: 'L', nisn: '1234567890', no_hp: '08123456789', nama_ortu: 'Bapak Ahmad' })
    assert.strictEqual(r.ok, true)

    // Belum daftar ulang -> tidak boleh masuk antrian
    assert.strictEqual(svc.antrianSiswa('t1').length, 0)

    svc.ubahStatus('t1', r.pendaftar.id, 'terverifikasi')
    const du = svc.tandaiDaftarUlang('t1', r.pendaftar.id)
    assert.strictEqual(du.ok, true)
    assert.strictEqual(du.pendaftar.status, 'daftar_ulang')
    assert.ok(du.pendaftar.daftar_ulang_at, 'waktu daftar ulang harus tercatat')

    // Masuk antrian
    const antrian = svc.antrianSiswa('t1')
    assert.strictEqual(antrian.length, 1)
    assert.strictEqual(antrian[0].nama, 'Ahmad Calon')

    // Terima jadi siswa
    const ter = svc.terimaJadiSiswa('t1', r.pendaftar.id)
    assert.strictEqual(ter.ok, true)
    assert.ok(ter.nis, 'NIS harus dibuat otomatis')
    const siswa = db.prepare('SELECT * FROM siswa WHERE id=?').get(ter.siswa_id)
    assert.strictEqual(siswa.nama, 'Ahmad Calon')
    assert.strictEqual(siswa.tenant_id, 't1')
    assert.strictEqual(siswa.status, 'aktif')
    // Nomor HP ortu dipakai bila no_hp calon kosong
    assert.strictEqual(siswa.no_hp, '628123456789')

    // Antrian kembali kosong, status akhir diterima
    assert.strictEqual(svc.antrianSiswa('t1').length, 0)
    assert.strictEqual(db.prepare('SELECT status FROM ppdb_pendaftar WHERE id=?').get(r.pendaftar.id).status, 'diterima')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: hanya status daftar_ulang yang boleh diterima jadi siswa', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    const r = svc.daftarPublik('t1', { nama: 'Calon', jenis_kelamin: 'L' })
    const ter = svc.terimaJadiSiswa('t1', r.pendaftar.id)
    assert.strictEqual(ter.ok, false)
    assert.match(ter.error, /daftar ulang/i)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: pendaftar yang sudah diterima tidak bisa diubah statusnya lagi', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    const r = svc.daftarPublik('t1', { nama: 'Calon', jenis_kelamin: 'L' })
    svc.ubahStatus('t1', r.pendaftar.id, 'terverifikasi')
    svc.tandaiDaftarUlang('t1', r.pendaftar.id)
    svc.terimaJadiSiswa('t1', r.pendaftar.id)
    const ubah = svc.ubahStatus('t1', r.pendaftar.id, 'ditolak')
    assert.strictEqual(ubah.ok, false)
    assert.match(ubah.error, /sudah menjadi siswa/i)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: NIS otomatis unik dan melanjutkan urutan yang ada', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    const buat = (nama) => {
      const r = svc.daftarPublik('t1', { nama, jenis_kelamin: 'L' })
      svc.ubahStatus('t1', r.pendaftar.id, 'terverifikasi')
      svc.tandaiDaftarUlang('t1', r.pendaftar.id)
      return svc.terimaJadiSiswa('t1', r.pendaftar.id)
    }
    const a = buat('Siswa Satu')
    const b = buat('Siswa Dua')
    assert.notStrictEqual(a.nis, b.nis, 'NIS harus unik')
    assert.strictEqual(b.nis, String(Number(a.nis) + 1), 'NIS melanjutkan urutan')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: terima banyak melaporkan berhasil/gagal per pendaftar', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    const ids = []
    for (const nama of ['Siswa A', 'Siswa B', 'Siswa C']) {
      const r = svc.daftarPublik('t1', { nama, jenis_kelamin: 'L' })
      svc.ubahStatus('t1', r.pendaftar.id, 'terverifikasi')
      svc.tandaiDaftarUlang('t1', r.pendaftar.id)
      ids.push(r.pendaftar.id)
    }
    // Satu id palsu untuk membuktikan kegagalan dilaporkan, bukan disembunyikan
    const hasil = svc.terimaBanyak('t1', [...ids, 'id-tidak-ada'])
    assert.strictEqual(hasil.total, 4)
    assert.strictEqual(hasil.berhasil, 3)
    assert.strictEqual(hasil.hasil.filter(h => !h.ok).length, 1)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: gelombang yang masih punya pendaftar tidak bisa dihapus', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc, g } = isiGelombang(db, 't1')
    svc.daftarPublik('t1', { nama: 'Calon', jenis_kelamin: 'L', gelombang_id: g.id })
    const h = svc.hapusGelombang('t1', g.id)
    assert.strictEqual(h.ok, false)
    assert.match(h.error, /pendaftar/i)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: ringkasan menghitung tiap status dan panjang antrian', () => {
  const { db, f } = dbPpdb()
  try {
    const { svc } = isiGelombang(db, 't1')
    const r1 = svc.daftarPublik('t1', { nama: 'Calon Satu', jenis_kelamin: 'L' })
    const r2 = svc.daftarPublik('t1', { nama: 'Calon Dua', jenis_kelamin: 'P' })
    svc.ubahStatus('t1', r2.pendaftar.id, 'ditolak')
    svc.ubahStatus('t1', r1.pendaftar.id, 'terverifikasi')
    svc.tandaiDaftarUlang('t1', r1.pendaftar.id)
    const rk = svc.ringkasan('t1')
    assert.strictEqual(rk.total, 2)
    assert.strictEqual(rk.ditolak, 1)
    assert.strictEqual(rk.daftar_ulang, 1)
    assert.strictEqual(rk.antrian_siswa, 1)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('PPDB: normalisasi nomor HP Indonesia', () => {
  assert.strictEqual(ppdb.normalHp('08123456789'), '628123456789')
  assert.strictEqual(ppdb.normalHp('628123456789'), '628123456789')
  assert.strictEqual(ppdb.normalHp('8123456789'), '628123456789')
  assert.strictEqual(ppdb.normalHp('0812-3456-789'), '628123456789')
  assert.strictEqual(ppdb.normalHp(''), '')
})

// ---------- DOMAIN SUBDOMAIN ----------
test('domain: BASE_DOMAINS memuat lima domain platform', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/tenant.cjs'), 'utf8')
  for (const d of ['jurnal.cc.cd', 'jurnalmadrasah.web.id', 'jurnalku.biz.id', 'idjurnal.my.id', 'idjurnal.web.id']) {
    assert.ok(src.includes(d), `domain ${d} harus terdaftar`)
  }
})

test('domain: registrasi HANYA menerima base_domain yang sah (anti-injeksi)', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/index.cjs'), 'utf8')
  assert.match(src, /BASE_DOMAINS\.includes\(mintaBase\)/,
    'base_domain dari klien harus divalidasi terhadap BASE_DOMAINS')
})

test('domain: endpoint publik daftar domain tersedia untuk halaman registrasi', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/index.cjs'), 'utf8')
  assert.match(src, /app\.get\('\/api\/tenant\/domains'/)
  const fe = fs.readFileSync(path.join(AKAR, 'src/pages/auth/RegisterPage.tsx'), 'utf8')
  assert.match(fe, /\/tenant\/domains/, 'halaman registrasi harus memuat daftar domain dari server')
  assert.match(fe, /payload\.base_domain = pilihBase \|\| SUBDOMAIN_BASE/, 'base_domain terpilih harus dikirim')
})

// ---------- MENU & ROUTE ----------
test('PPDB: menu dan route terpasang untuk admin, kepala, dan halaman publik', () => {
  const app = fs.readFileSync(path.join(AKAR, 'src/App.tsx'), 'utf8')
  assert.match(app, /path="ppdb"[\s\S]{0,200}allowedRoles=\{\['admin', 'super_admin', 'operator', 'tata_usaha', 'tu', 'kepala'\]\}/)
  assert.match(app, /path="\/ppdb" element=\{<PpdbPublikPage \/>\}/, 'halaman pendaftaran publik harus ada')
  const menu = fs.readFileSync(path.join(AKAR, 'src/lib/menuItems.tsx'), 'utf8')
  const jumlah = (menu.match(/label: 'PPDB'/g) || []).length
  assert.ok(jumlah >= 2, `menu PPDB harus ada di admin dan kepala (ditemukan ${jumlah})`)
  const sidebar = fs.readFileSync(path.join(AKAR, 'src/components/layout/Sidebar.tsx'), 'utf8')
  assert.match(sidebar, /'Data Siswa', 'PPDB'/, 'PPDB harus masuk grup MASTER DATA di sidebar')
})

test('WA platform: menu sambung WA tersedia untuk superadmin', () => {
  const menu = fs.readFileSync(path.join(AKAR, 'src/lib/menuItems.tsx'), 'utf8')
  const blokSuper = menu.slice(menu.indexOf('superAdminMenuItems'))
  assert.match(blokSuper, /WhatsApp Platform/, 'superadmin harus punya menu WhatsApp Platform')
  assert.match(blokSuper, /\/admin\/wa-gateway/, 'menu harus mengarah ke halaman gateway')
  const sidebar = fs.readFileSync(path.join(AKAR, 'src/components/layout/Sidebar.tsx'), 'utf8')
  assert.match(sidebar, /'WhatsApp', 'WhatsApp Platform'/, 'grup KOMUNIKASI harus memuat WhatsApp Platform')
})
