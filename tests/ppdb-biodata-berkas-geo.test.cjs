'use strict'
// Tes geolokasi rombel + PPDB lengkap (biodata, berkas, rombel tujuan).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Database = require('better-sqlite3')

const { haversineMeters, validateClassGeo, toleransiAkurasi } = require('../server/geo-lock.cjs')
const { buatLayananPpdb, setupPpdbTables } = require('../server/ppdb.cjs')
const berkas = require('../server/ppdb-berkas.cjs')

function dbUji() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT, key TEXT, value TEXT);
           CREATE TABLE rombel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, tingkat TEXT,
             geo_latitude REAL, geo_longitude REAL, geo_radius INTEGER, geo_lock INTEGER);
           CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT, nis TEXT, nisn TEXT, nik TEXT,
             nama TEXT, nama_panggilan TEXT, jenis_kelamin TEXT, tempat_lahir TEXT, tanggal_lahir TEXT,
             alamat TEXT, no_hp TEXT, nama_ortu TEXT, rombel_id TEXT, foto TEXT, status TEXT,
             created_at TEXT DEFAULT (datetime('now')), agama TEXT, status_keluarga TEXT, anak_ke INTEGER,
             alamat_ortu TEXT, nama_ayah TEXT, kerja_ayah TEXT, nama_ibu TEXT, kerja_ibu TEXT,
             nama_wali TEXT, kerja_wali TEXT, asal_sekolah TEXT, rfid_uid TEXT);`)
  return db
}

// Titik acuan (Madrasah, Bondowoso).
const LAT = -6.911918, LNG = 112.13111

test('haversine: titik sama = 0 meter', () => {
  assert.strictEqual(Math.round(haversineMeters(LAT, LNG, LAT, LNG)), 0)
})

test('haversine: ±0.0001 derajat lintang ≈ 11 meter', () => {
  const d = haversineMeters(LAT, LNG, LAT + 0.0001, LNG)
  assert.ok(d > 10 && d < 12, `dapat ${d}`)
})

test('toleransi akurasi dibatasi 200 m (tidak bisa dipalsukan)', () => {
  assert.strictEqual(toleransiAkurasi(20), 20)
  assert.strictEqual(toleransiAkurasi(99999), 200)
  assert.strictEqual(toleransiAkurasi(null), 0)
  assert.strictEqual(toleransiAkurasi(-5), 0)
})

test('geo: lock mati -> selalu lolos, tidak ada penegakan', () => {
  const db = dbUji()
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('r1', 't1', 'VII-A', 'VII', LAT, LNG, 10, 0)
  const h = validateClassGeo(db, 't1', 'r1', 0, 0, 0)
  assert.strictEqual(h.ok, true)
  assert.strictEqual(h.scope, 'none')
})

test('geo: AKAR BUG — guru tepat di titik kelas dengan akurasi 20m harus LOLOS di radius 10m', () => {
  const db = dbUji()
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('r1', 't1', 'VII-A', 'VII', LAT, LNG, 10, 1)
  // Tepat di titik, tapi GPS meleset 15 m (umum di HP) dan akurasi dilaporkan 20 m.
  const geser = 15 / 111320 // ~15 meter ke utara
  const h = validateClassGeo(db, 't1', 'r1', LAT + geser, LNG, 20)
  assert.strictEqual(h.ok, true, 'radius 10 + akurasi 20 = 30m, jarak 15m harus lolos')
})

test('geo: benar-benar jauh tetap DITOLAK walau ada toleransi', () => {
  const db = dbUji()
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('r1', 't1', 'VII-A', 'VII', LAT, LNG, 10, 1)
  const jauh = 200 / 111320 // 200 meter
  const h = validateClassGeo(db, 't1', 'r1', LAT + jauh, LNG, 20)
  assert.strictEqual(h.ok, false)
  assert.match(h.error, /di luar area kelas/i)
})

test('geo: akurasi palsu besar tidak meloloskan posisi jauh (toleransi dibatasi 200m)', () => {
  const db = dbUji()
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('r1', 't1', 'VII-A', 'VII', LAT, LNG, 10, 1)
  const jauh = 400 / 111320 // 400 meter — jauh melampaui radius+lantai+toleransi
  const h = validateClassGeo(db, 't1', 'r1', LAT + jauh, LNG, 5000)
  assert.strictEqual(h.ok, false, 'toleransi maksimal 200m: 25+200=225m < 400m, harus ditolak')
})

test('geo: akurasi 60m masih menolong kasus wajar (radius 10 + 60 = 70m)', () => {
  const db = dbUji()
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('r1', 't1', 'VII-A', 'VII', LAT, LNG, 10, 1)
  const geser = 50 / 111320 // 50 meter
  const h = validateClassGeo(db, 't1', 'r1', LAT + geser, LNG, 60)
  assert.strictEqual(h.ok, true, '50m <= 10+60')
})

test('geo: tanpa koordinat -> 400 dengan pesan izin lokasi', () => {
  const db = dbUji()
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('r1', 't1', 'VII-A', 'VII', LAT, LNG, 10, 1)
  const h = validateClassGeo(db, 't1', 'r1', undefined, undefined, 10)
  assert.strictEqual(h.ok, false)
  assert.match(h.error, /izinkan akses lokasi/i)
})

test('geo: rombel tanpa titik -> fallback geofence sekolah', () => {
  const db = dbUji()
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('r1', 't1', 'VII-A', 'VII', null, null, 10, 1)
  // getTenantSettings memakai id kanonik 'main_<tenant>' dan kolom bernama.
  db.exec(`ALTER TABLE settings ADD COLUMN geo_latitude REAL`)
  db.exec(`ALTER TABLE settings ADD COLUMN geo_longitude REAL`)
  db.exec(`ALTER TABLE settings ADD COLUMN geo_radius INTEGER`)
  db.prepare('INSERT INTO settings (id,tenant_id,geo_latitude,geo_longitude,geo_radius) VALUES (?,?,?,?,?)')
    .run('main_t1', 't1', LAT, LNG, 100)
  const h = validateClassGeo(db, 't1', 'r1', LAT, LNG, 10)
  assert.strictEqual(h.ok, true)
  assert.strictEqual(h.scope, 'sekolah')
})

test('ppdb: migrasi menambah kolom biodata ke tabel lama', () => {
  const db = dbUji()
  // Buat tabel versi LAMA (tanpa biodata) lalu jalankan setup.
  db.exec(`CREATE TABLE ppdb_pendaftar (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, gelombang_id TEXT,
    nomor_daftar TEXT, nama TEXT NOT NULL, jenis_kelamin TEXT, nisn TEXT, nik TEXT, tempat_lahir TEXT,
    tanggal_lahir TEXT, alamat TEXT, no_hp TEXT, email TEXT, nama_ortu TEXT, no_hp_ortu TEXT,
    asal_sekolah TEXT, pilihan_rombel_id TEXT, status TEXT, catatan TEXT, dokumen_json TEXT,
    daftar_ulang_at TEXT, diterima_at TEXT, siswa_id TEXT, created_at TEXT, updated_at TEXT)`)
  setupPpdbTables(db)
  const kolom = new Set(db.prepare('PRAGMA table_info(ppdb_pendaftar)').all().map(c => c.name))
  for (const k of ['agama', 'nama_ayah', 'kerja_ayah', 'nama_ibu', 'kerja_ibu', 'nama_wali', 'kerja_wali', 'anak_ke', 'status_keluarga', 'nama_panggilan', 'alamat_ortu']) {
    assert.ok(kolom.has(k), `kolom ${k} harus ada`)
  }
})

test('ppdb: pendaftaran menyimpan SELURUH biodata', () => {
  const db = dbUji()
  const svc = buatLayananPpdb(db)
  svc.simpanGelombang('t1', { nama: 'Gel 1', tahun_ajaran: '2026/2027', dibuka: 1 })
  const h = svc.daftarPublik('t1', {
    nama: 'Ahmad Fauzi', jenis_kelamin: 'L', nisn: '1234567890', nik: '3511010101010001',
    tempat_lahir: 'Bondowoso', tanggal_lahir: '2013-05-01', alamat: 'Jl. Mawar 1',
    no_hp: '081234567890', email: 'ahmad@example.com',
    nama_ortu: 'Bapak Fauzi', no_hp_ortu: '081234567891', asal_sekolah: 'SDN 1',
    agama: 'Islam', status_keluarga: 'Anak Kandung', anak_ke: 2,
    nama_ayah: 'Fauzi', kerja_ayah: 'Petani', nama_ibu: 'Siti', kerja_ibu: 'Ibu Rumah Tangga',
    nama_wali: '', kerja_wali: '', nama_panggilan: 'Ahmad',
  })
  assert.strictEqual(h.ok, true, h.error)
  const p = h.pendaftar
  assert.strictEqual(p.agama, 'Islam')
  assert.strictEqual(p.anak_ke, 2)
  assert.strictEqual(p.nama_ayah, 'Fauzi')
  assert.strictEqual(p.kerja_ibu, 'Ibu Rumah Tangga')
  assert.strictEqual(p.nama_panggilan, 'Ahmad')
})

test('ppdb: NIK bukan 16 digit ditolak', () => {
  const db = dbUji()
  const svc = buatLayananPpdb(db)
  svc.simpanGelombang('t1', { nama: 'Gel 1', dibuka: 1 })
  const h = svc.daftarPublik('t1', { nama: 'Budi Santoso', jenis_kelamin: 'L', nik: '123' })
  assert.strictEqual(h.ok, false)
  assert.match(h.error, /NIK harus 16 digit/)
})

test('ppdb: agama tak dikenal ditolak', () => {
  const db = dbUji()
  const svc = buatLayananPpdb(db)
  svc.simpanGelombang('t1', { nama: 'Gel 1', dibuka: 1 })
  const h = svc.daftarPublik('t1', { nama: 'Budi Santoso', jenis_kelamin: 'L', agama: 'Jedi' })
  assert.strictEqual(h.ok, false)
})

test('ppdb: rombel tujuan milik tenant lain ditolak', () => {
  const db = dbUji()
  const svc = buatLayananPpdb(db)
  svc.simpanGelombang('t1', { nama: 'Gel 1', dibuka: 1 })
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('rX', 't2', 'VII-A', 'VII', null, null, 50, 0)
  const h = svc.daftarPublik('t1', { nama: 'Budi Santoso', jenis_kelamin: 'L', pilihan_rombel_id: 'rX' })
  assert.strictEqual(h.ok, false)
  assert.match(h.error, /tidak ditemukan/)
})

test('ppdb: terima jadi siswa MENYALIN biodata ke tabel siswa', () => {
  const db = dbUji()
  const svc = buatLayananPpdb(db)
  svc.simpanGelombang('t1', { nama: 'Gel 1', tahun_ajaran: '2026/2027', dibuka: 1 })
  db.prepare('INSERT INTO rombel VALUES (?,?,?,?,?,?,?,?)').run('r1', 't1', 'VII-A', 'VII', null, null, 50, 0)
  const d = svc.daftarPublik('t1', {
    nama: 'Ahmad Fauzi', jenis_kelamin: 'L', agama: 'Islam', anak_ke: 2,
    nama_ayah: 'Fauzi', kerja_ayah: 'Petani', nama_ibu: 'Siti', kerja_ibu: 'IRT',
    pilihan_rombel_id: 'r1', asal_sekolah: 'SDN 1', nama_panggilan: 'Ahmad',
    status_keluarga: 'Anak Kandung',
  })
  assert.strictEqual(d.ok, true, d.error)
  svc.tandaiDaftarUlang('t1', d.pendaftar.id)
  const h = svc.terimaJadiSiswa('t1', d.pendaftar.id)
  assert.strictEqual(h.ok, true, h.error)
  const s = db.prepare('SELECT * FROM siswa WHERE id=?').get(h.siswa_id)
  assert.strictEqual(s.agama, 'Islam')
  assert.strictEqual(s.nama_ayah, 'Fauzi')
  assert.strictEqual(s.kerja_ibu, 'IRT')
  assert.strictEqual(s.anak_ke, 2)
  assert.strictEqual(s.rombel_id, 'r1', 'rombel tujuan dari PPDB harus terbawa')
  assert.strictEqual(s.nama_panggilan, 'Ahmad')
})

test('berkas: simpan PDF valid lalu bisa dihapus', () => {
  const akar = fs.mkdtempSync(path.join(os.tmpdir(), 'ppdb-'))
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)])
  const h = berkas.simpanBerkas(akar, 't1', { buffer: pdf, size: pdf.length, mimetype: 'application/pdf', originalname: 'kk.pdf' })
  assert.match(h.url, /^\/uploads\/ppdb\/t1\/\d+-[a-f0-9]+\.pdf$/)
  assert.ok(fs.existsSync(path.join(akar, 'ppdb', 't1', path.basename(h.url))))
  assert.strictEqual(berkas.hapusBerkas(akar, 't1', h.url), true)
})

test('berkas: tipe tidak didukung ditolak', () => {
  const akar = fs.mkdtempSync(path.join(os.tmpdir(), 'ppdb-'))
  assert.throws(() => berkas.simpanBerkas(akar, 't1', {
    buffer: Buffer.from('<html>'), size: 6, mimetype: 'text/html', originalname: 'x.html',
  }), /tidak didukung/)
})

test('berkas: magic bytes tidak cocok ditolak (mimetype dipalsukan)', () => {
  const akar = fs.mkdtempSync(path.join(os.tmpdir(), 'ppdb-'))
  assert.throws(() => berkas.simpanBerkas(akar, 't1', {
    buffer: Buffer.from('BUKAN PDF SAMA SEKALI'), size: 20, mimetype: 'application/pdf', originalname: 'palsu.pdf',
  }), /tidak cocok/)
})

test('berkas: hapus tidak bisa keluar folder tenant (path traversal)', () => {
  const akar = fs.mkdtempSync(path.join(os.tmpdir(), 'ppdb-'))
  assert.strictEqual(berkas.hapusBerkas(akar, 't1', '/uploads/ppdb/t2/rahasia.pdf'), false)
  assert.strictEqual(berkas.hapusBerkas(akar, 't1', '../../../etc/passwd'), false)
})

test('ppdb: simpanDokumen menyaring entri tanpa url', () => {
  const db = dbUji()
  const svc = buatLayananPpdb(db)
  svc.simpanGelombang('t1', { nama: 'Gel 1', dibuka: 1 })
  const d = svc.daftarPublik('t1', { nama: 'Budi Santoso', jenis_kelamin: 'L' })
  const h = svc.simpanDokumen('t1', d.pendaftar.id, [
    { url: '/uploads/ppdb/t1/a.pdf', nama: 'KK' }, { nama: 'tanpa url' },
  ])
  assert.strictEqual(h.ok, true)
  assert.strictEqual(h.dokumen.length, 1)
})
