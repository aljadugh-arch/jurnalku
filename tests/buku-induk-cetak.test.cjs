'use strict'
// Kontrak Buku Induk + cetak rapor per bagian.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('service buku induk ada dan mengekspor API yang dipakai route', () => {
  const p = path.join(AKAR, 'server/buku-induk-pdf-service.cjs')
  assert.ok(fs.existsSync(p), 'service buku induk harus ada')
  const isi = baca('server/buku-induk-pdf-service.cjs')
  for (const fn of ['createBukuIndukPdf', 'createBukuIndukPdfBulk', 'loadBukuInduk']) {
    assert.ok(isi.includes(fn), `harus mengekspor ${fn}`)
  }
  assert.ok(/module\.exports\s*=\s*\{[^}]*createBukuIndukPdf/.test(isi), 'createBukuIndukPdf harus di module.exports')
})

test('route buku induk terdaftar dengan auth dan dua bentuk (single + bulk)', () => {
  const s = baca('server/index.cjs')
  assert.ok(s.includes("app.get('/api/buku-induk/pdf'"), 'route single harus ada')
  assert.ok(s.includes("app.get('/api/buku-induk/pdf-bulk'"), 'route bulk harus ada')
  const single = s.slice(s.indexOf("app.get('/api/buku-induk/pdf'"), s.indexOf("app.get('/api/buku-induk/pdf-bulk'"))
  assert.ok(single.includes('authMiddleware'), 'single butuh auth')
  assert.ok(single.includes('teacherCanAccessStudent'), 'guru dibatasi ke siswanya')
  const bulk = s.slice(s.indexOf("app.get('/api/buku-induk/pdf-bulk'"), s.indexOf("app.put('/api/rapor/pelengkap'"))
  assert.ok(bulk.includes('canManageRaporRombel'), 'bulk dibatasi per rombel untuk guru')
  assert.ok(bulk.includes("application/pdf"), 'harus mengembalikan PDF')
})

test('bagian buku induk: lengkap, identitas, nilai', () => {
  const s = baca('server/index.cjs')
  assert.ok(/BAGIAN_BUKU_INDUK\s*=\s*\['lengkap',\s*'identitas',\s*'nilai'\]/.test(s), 'tiga bagian harus dideklarasikan')
})

test('buku induk memakai computeRaporLive, bukan tabel rapor ter-materialisasi', () => {
  const isi = baca('server/buku-induk-pdf-service.cjs')
  assert.ok(isi.includes('computeRaporLive'), 'nilai harus dihitung live (tabel rapor tidak pernah diisi)')
  assert.ok(!/FROM rapor\s+WHERE[^)]*jenis='rapor_sts'/.test(isi), 'jangan membaca baris hasil materialisasi')
})

test('periode diturunkan dari tanggal penilaian_harian (tabel itu tidak punya tahun_ajaran)', () => {
  const isi = baca('server/buku-induk-pdf-service.cjs')
  assert.ok(isi.includes('penilaian_harian'), 'harus membaca penilaian_harian')
  // Tahun ajaran dimulai Juli.
  assert.ok(/bulan\s*>=\s*7/.test(isi), 'harus memakai batas Juli untuk menentukan semester')
  assert.ok(isi.includes('ganjil') && isi.includes('genap'))
})

test('kolom BK yang dipakai benar-benar ada di skema', () => {
  // Komentar penjelas bug menyebut nama kolom lama, jadi periksa KODE saja.
  const isi = baca('server/buku-induk-pdf-service.cjs')
  const kode = isi.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.ok(!kode.includes('tindak_lanjut'), 'bk_pelanggaran tidak punya kolom tindak_lanjut (namanya tindakan)')
  assert.ok(kode.includes('tindakan'), 'harus memakai kolom tindakan')
  assert.ok(kode.includes('bk_pelanggaran'), 'harus membaca bk_pelanggaran')
  // bk_prestasi tidak ada di DB produksi — akses harus dibungkus try/catch.
  const blok = kode.slice(kode.indexOf('const prestasi'), kode.indexOf('const ekskul'))
  assert.ok(blok.includes('try'), 'akses bk_prestasi harus defensif (tabel belum tentu ada)')
})

test('gambar dikonversi untuk PDFKit (WebP) di buku induk', () => {
  const isi = baca('server/buku-induk-pdf-service.cjs')
  assert.ok(isi.includes('siapkanGambar'), 'harus ada konversi gambar')
  assert.ok(/sharp/.test(isi), 'memakai sharp untuk format non-JPEG/PNG')
})

test('buku induk menandai biodata kosong secara jujur, bukan diam', () => {
  const isi = baca('server/buku-induk-pdf-service.cjs')
  assert.ok(isi.includes('belum diisi di sistem'), 'harus memberi catatan bila biodata kosong')
})

test('frontend punya aksi buku induk dan cetak massal per bagian', () => {
  const isi = baca('src/pages/admin/RaporPage.tsx')
  assert.ok(isi.includes('exportBukuInduk'), 'harus ada fungsi exportBukuInduk')
  assert.ok(isi.includes('/buku-induk/pdf'), 'harus memanggil route buku induk')
  assert.ok(isi.includes('Buku Induk'), 'tombol harus terlihat')
  // Cetak massal kini punya menu bagian, bukan hanya 'lengkap'.
  const bulk = isi.slice(isi.indexOf('exportPdfBulk'), isi.indexOf('exportBukuInduk'))
  assert.ok(/bagian: BagianCetak = 'lengkap'/.test(bulk), 'exportPdfBulk menerima bagian')
  assert.ok(isi.includes('cetakBulkOpen'), 'harus ada state menu massal')
})
