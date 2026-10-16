// Program belajar + level untuk lembaga NONFORMAL (kursus/bimbel/sanggar),
// dan perbaikan nilai harian rusak (bug parseInt lama).
//
// Dua hal yang dijaga berkas ini:
//   1. Admin lembaga bisa tambah/ubah/hapus program & level tanpa deploy,
//      tenant-scoped, nama unik, hapus program ikut menghapus levelnya.
//   2. Nilai rusak pola "asli x 10 tanpa titik desimal" (79.0->790, 90.9->909,
//      100.1->1001) diperbaiki aman: hanya baris di luar 0-100 yang disentuh,
//      hasil selalu 0-100, dan idempoten.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-program-0000000'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const {
  setupProgramBelajarTables, seedProgramBawaan, normalizeProgramInput,
  normalizeLevelInput, daftarProgram, PROGRAM_BAWAAN,
} = require('../server/program-belajar.cjs')
const { nilaiPerbaikan, perbaikiBaris, perbaikiNilaiHarian } = require('../server/nilai-repair.cjs')

function dbUji() {
  const db = new Database(':memory:')
  setupProgramBelajarTables(db)
  return db
}

// ─── Program belajar ────────────────────────────────────────────────────────

test('tabel program & level dibuat dengan indeks unik per tenant', () => {
  const db = dbUji()
  const tabel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name)
  assert.ok(tabel.includes('program_belajar'))
  assert.ok(tabel.includes('program_level'))
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name)
  assert.ok(idx.includes('idx_program_belajar_nama'))
  assert.ok(idx.includes('idx_program_level_nama'))
})

test('seed paket bawaan nonformal idempoten dan tidak menimpa perubahan admin', () => {
  const db = dbUji()
  seedProgramBawaan(db, 't1')
  const pertama = daftarProgram(db, 't1')
  assert.equal(pertama.length, PROGRAM_BAWAAN.length)
  const totalLevel = pertama.reduce((n, p) => n + p.levels.length, 0)
  assert.ok(totalLevel > 0, 'paket bawaan harus punya level')

  // Admin menghapus satu program & mengubah nama program lain.
  db.prepare('DELETE FROM program_level WHERE program_id=?').run(pertama[0].id)
  db.prepare('DELETE FROM program_belajar WHERE id=?').run(pertama[0].id)
  db.prepare('UPDATE program_belajar SET nama=? WHERE id=?').run('Bahasa Inggris (Ubah Admin)', pertama[1].id)

  // Seed ulang TIDAK boleh menghidupkan kembali yang dihapus / menimpa nama.
  seedProgramBawaan(db, 't1')
  const kedua = daftarProgram(db, 't1')
  assert.equal(kedua.length, PROGRAM_BAWAAN.length - 1, 'program yang dihapus tidak boleh kembali')
  assert.ok(kedua.some(p => p.nama === 'Bahasa Inggris (Ubah Admin)'), 'perubahan admin tidak boleh ditimpa')
})

test('seed terpisah per tenant (tidak bocor antar lembaga)', () => {
  const db = dbUji()
  seedProgramBawaan(db, 't1')
  assert.equal(daftarProgram(db, 't2').length, 0, 'tenant lain belum punya program')
  seedProgramBawaan(db, 't2')
  assert.equal(daftarProgram(db, 't2').length, PROGRAM_BAWAAN.length)
})

test('normalizeProgramInput memvalidasi & membersihkan masukan', () => {
  assert.throws(() => normalizeProgramInput({}), /Nama program wajib/)
  assert.throws(() => normalizeProgramInput({ nama: 'x'.repeat(81) }), /maksimal 80/)
  const v = normalizeProgramInput({ nama: '  Menjahit  ', deskripsi: ' a ', kategori: 'Keterampilan', durasi_pertemuan: '90' })
  assert.equal(v.nama, 'Menjahit')
  assert.equal(v.durasi_pertemuan, 90)
  assert.equal(v.aktif, 1)
  // Durasi negatif/aneh tidak boleh lolos.
  assert.equal(normalizeProgramInput({ nama: 'A', durasi_pertemuan: -5 }).durasi_pertemuan, 0)
  assert.equal(normalizeProgramInput({ nama: 'A', durasi_pertemuan: 'abc' }).durasi_pertemuan, 0)
})

test('normalizeLevelInput memvalidasi nama level', () => {
  assert.throws(() => normalizeLevelInput({}), /Nama level\/grade wajib/)
  const v = normalizeLevelInput({ nama: ' Basic ', grade: 'Grade 1' })
  assert.equal(v.nama, 'Basic')
  assert.equal(v.grade, 'Grade 1')
})

test('route program belajar: CRUD lengkap, admin-only untuk tulis', () => {
  const routes = read('server/program-belajar-routes.cjs')
  const idx = read('server/index.cjs')
  for (const r of [
    "app.get('/api/program-belajar', LIHAT",
    "app.post('/api/program-belajar', KELOLA",
    "app.put('/api/program-belajar/:id', KELOLA",
    "app.delete('/api/program-belajar/:id', KELOLA",
    "app.post('/api/program-belajar/:id/level', KELOLA",
    "app.put('/api/program-level/:id', KELOLA",
    "app.delete('/api/program-level/:id', KELOLA",
  ]) assert.ok(routes.includes(r), `route hilang: ${r}`)
  assert.match(routes, /const KELOLA = requireRole\('admin', 'super_admin'\)/)
  // Modul terpasang di server.
  assert.match(idx, /setupProgramBelajar\(db\)/)
  assert.match(idx, /registerProgramBelajarRoutes\(app, db, \{ requireRole \}\)/)
})

test('hapus program menghapus levelnya (tidak meninggalkan yatim)', () => {
  const routes = read('server/program-belajar-routes.cjs')
  const start = routes.indexOf("app.delete('/api/program-belajar/:id'")
  const blok = routes.slice(start, start + 900)
  assert.match(blok, /DELETE FROM program_level WHERE tenant_id=\? AND program_id=\?/)
  assert.match(blok, /DELETE FROM program_belajar WHERE id=\? AND tenant_id=\?/)
})

test('nama program unik per lembaga (case-insensitive) di route', () => {
  const routes = read('server/program-belajar-routes.cjs')
  assert.match(routes, /lower\(nama\)=lower\(\?\)/)
  assert.match(routes, /sudah ada/)
})

test('halaman Program Belajar tersedia di route & menu admin', () => {
  const app = read('src/App.tsx')
  assert.match(app, /ProgramBelajarPage = lazy/)
  assert.match(app, /path="program-belajar"/)
  const menu = read('src/lib/menuItems.tsx')
  assert.match(menu, /label: 'Program Belajar'[\s\S]{0,80}path: '\/admin\/program-belajar'/)
})

test('halaman menyediakan tambah/ubah/hapus program DAN level', () => {
  const page = read('src/pages/admin/ProgramBelajarPage.tsx')
  assert.match(page, /api\.post\('\/program-belajar'/)
  assert.match(page, /api\.put\(`\/program-belajar\/\$\{/)
  assert.match(page, /api\.delete\(`\/program-belajar\/\$\{/)
  assert.match(page, /api\.post\(`\/program-belajar\/\$\{modalLevel\.programId\}\/level`/)
  assert.match(page, /api\.put\(`\/program-level\/\$\{/)
  assert.match(page, /api\.delete\(`\/program-level\/\$\{/)
  // Hanya lembaga nonformal yang dapat paket bawaan — UI memberi tahu bila belum NF.
  assert.match(page, /Lembaga Nonformal \(NF\)/)
})

test('setupProgramBelajar tidak menggagalkan boot saat settings.jenjang belum ada', () => {
  // Regresi: DB parsial/uji tanpa kolom settings.jenjang pernah membuat
  // `no such column: s.jenjang` dan server gagal start.
  const { setupProgramBelajar } = require('../server/program-belajar-routes.cjs')
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT);
    CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT);`) // tanpa kolom jenjang
  db.prepare('INSERT INTO tenants (id, nama) VALUES (?,?)').run('t1', 'Lembaga Kursus')
  assert.doesNotThrow(() => setupProgramBelajar(db), 'boot tidak boleh mati karena kolom hilang')
  // Tabel program tetap dibuat walau seed dilewati.
  const tabel = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
  assert.ok(tabel.includes('program_belajar'))
  assert.ok(tabel.includes('program_level'))
})

test('setupProgramBelajar menanam paket bawaan hanya untuk lembaga jenjang NF', () => {
  const { setupProgramBelajar } = require('../server/program-belajar-routes.cjs')
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT);
    CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT, jenjang TEXT);`)
  db.prepare('INSERT INTO tenants (id, nama) VALUES (?,?)').run('nf1', 'Kursus Komputer')
  db.prepare('INSERT INTO tenants (id, nama) VALUES (?,?)').run('sd1', 'SD Negeri 1')
  db.prepare('INSERT INTO settings (id, tenant_id, jenjang) VALUES (?,?,?)').run('s1', 'nf1', 'Lembaga Nonformal (NF)')
  db.prepare('INSERT INTO settings (id, tenant_id, jenjang) VALUES (?,?,?)').run('s2', 'sd1', 'SD')
  setupProgramBelajar(db)
  assert.ok(daftarProgram(db, 'nf1').length > 0, 'lembaga NF dapat paket bawaan')
  assert.equal(daftarProgram(db, 'sd1').length, 0, 'sekolah formal tidak dikotori program kursus')
})

// ─── Perbaikan nilai rusak ──────────────────────────────────────────────────

test('nilaiPerbaikan membalik sidik jari "asli x 10"', () => {
  assert.equal(nilaiPerbaikan(790), 79)   // 79.0
  assert.equal(nilaiPerbaikan(909), 91)   // 90.9 -> dibulatkan
  assert.equal(nilaiPerbaikan(1001), 100) // 100.1 -> dijepit
  assert.equal(nilaiPerbaikan(95), null, 'nilai benar tidak diubah')
  assert.equal(nilaiPerbaikan(100), null)
  assert.equal(nilaiPerbaikan(0), null)
  assert.equal(nilaiPerbaikan(1500), 100, 'nilai mustahil dijepit ke 100')
  assert.equal(nilaiPerbaikan(-5), 0)
})

test('perbaikiBaris hanya mengubah kolom yang rusak', () => {
  const a = perbaikiBaris({ pengetahuan: 909, keaktifan: 90, sikap: 7 })
  assert.deepEqual(a.baru, { pengetahuan: 91, keaktifan: 90, sikap: 7 })
  assert.equal(a.berubah, true)
  const b = perbaikiBaris({ pengetahuan: 80, keaktifan: 80, sikap: 80 })
  assert.equal(b.berubah, false, 'baris sehat tidak diubah')
})

test('perbaikiNilaiHarian: periksa dulu, terapkan kemudian, hasil selalu 0-100', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE penilaian_harian (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT, tanggal TEXT,
    pengetahuan INTEGER DEFAULT 0, keaktifan INTEGER DEFAULT 0, sikap INTEGER DEFAULT 0);`)
  const ins = db.prepare('INSERT INTO penilaian_harian (id,tenant_id,siswa_id,tanggal,pengetahuan,keaktifan,sikap) VALUES (?,?,?,?,?,?,?)')
  ins.run('r1', 't1', 's1', '2026-08-11', 79, 79, 790)
  ins.run('r2', 't1', 's2', '2026-09-22', 909, 90, 7)
  ins.run('r3', 't1', 's3', '2026-09-24', 1001, 0, 0)
  ins.run('r4', 't1', 's4', '2026-09-25', 88, 90, 92) // sehat

  // Mode periksa tidak mengubah apa pun.
  const periksa = perbaikiNilaiHarian(db, { tenantId: 't1', terapkan: false })
  assert.equal(periksa.ditemukan, 3)
  assert.equal(periksa.diperbaiki, 3)
  assert.equal(db.prepare("SELECT pengetahuan FROM penilaian_harian WHERE id='r1'").get().pengetahuan, 79, 'mode periksa tidak menulis')

  const terapkan = perbaikiNilaiHarian(db, { tenantId: 't1', terapkan: true })
  assert.equal(terapkan.diperbaiki, 3)
  assert.deepEqual(db.prepare("SELECT pengetahuan,keaktifan,sikap FROM penilaian_harian WHERE id='r1'").get(), { pengetahuan: 79, keaktifan: 79, sikap: 79 })
  assert.deepEqual(db.prepare("SELECT pengetahuan,keaktifan,sikap FROM penilaian_harian WHERE id='r2'").get(), { pengetahuan: 91, keaktifan: 90, sikap: 7 })
  assert.deepEqual(db.prepare("SELECT pengetahuan,keaktifan,sikap FROM penilaian_harian WHERE id='r3'").get(), { pengetahuan: 100, keaktifan: 0, sikap: 0 })
  // Baris sehat tak tersentuh.
  assert.deepEqual(db.prepare("SELECT pengetahuan,keaktifan,sikap FROM penilaian_harian WHERE id='r4'").get(), { pengetahuan: 88, keaktifan: 90, sikap: 92 })
  // Idempoten: menjalankan lagi tidak menemukan apa pun.
  assert.equal(perbaikiNilaiHarian(db, { tenantId: 't1', terapkan: true }).diperbaiki, 0)
  // Tidak ada sisa nilai di luar 0-100.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM penilaian_harian WHERE pengetahuan>100 OR keaktifan>100 OR sikap>100').get().c, 0)
})

test('perbaikiNilaiHarian menghormati batas tenant', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE penilaian_harian (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT, tanggal TEXT,
    pengetahuan INTEGER DEFAULT 0, keaktifan INTEGER DEFAULT 0, sikap INTEGER DEFAULT 0);`)
  db.prepare('INSERT INTO penilaian_harian (id,tenant_id,tanggal,pengetahuan) VALUES (?,?,?,?)').run('a', 't1', '2026-01-01', 909)
  db.prepare('INSERT INTO penilaian_harian (id,tenant_id,tanggal,pengetahuan) VALUES (?,?,?,?)').run('b', 't2', '2026-01-01', 909)
  const r = perbaikiNilaiHarian(db, { tenantId: 't1', terapkan: true })
  assert.equal(r.diperbaiki, 1)
  assert.equal(db.prepare("SELECT pengetahuan FROM penilaian_harian WHERE id='a'").get().pengetahuan, 91)
  assert.equal(db.prepare("SELECT pengetahuan FROM penilaian_harian WHERE id='b'").get().pengetahuan, 909, 'tenant lain tidak disentuh')
})

test('nilai harian baru sudah dibulatkan 0-100 di semua jalur tulis', () => {
  const idx = read('server/index.cjs')
  for (const route of ["app.post('/api/penilaian-harian'", "app.post('/api/penilaian-harian/bulk'", "app.put('/api/penilaian-harian/:id'"]) {
    const start = idx.indexOf(route)
    assert.match(idx.slice(start, start + 1600), /clampNilai\(/)
  }
})
