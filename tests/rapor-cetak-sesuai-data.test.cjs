'use strict'
// Kontrak cetak rapor — mengunci bug yang membuat isi PDF tidak sesuai data asli.
//
// Setiap butir di sini berasal dari bug NYATA yang ditemukan dengan mencetak PDF
// dari produksi lalu membandingkan teksnya dengan baris DB:
//
//  1. Sampul tidak memuat satu gambar pun (0 image di halaman 1) karena
//     `logo.lembagaPath` salah nama — objeknya `lembagaLogoPath`.
//  2. Logo Kemenag berformat WebP; PDFKit hanya membaca JPEG/PNG, dan error-nya
//     ditelan `try/catch` sehingga logo hilang tanpa jejak.
//  3. `settings.nama_instansi` tidak ada di skema `settings` — selalu undefined.
//  4. Yayasan, alamat, telepon, email tidak pernah dicetak padahal ada di DB.
//  5. Jenjang ditanam "Madrasah Tsanawiyah (MTs)" — salah untuk MI/MA.
//  6. Nomor identitas berulang: 'a.'/'b.'/'c.' dua kali, `alamat_ortu` bukan kolom.
//  7. Tabel nilai meluber 34pt melewati margin kanan (x=595.28 = tepi kertas).
//  8. Halaman lanjutan tabel kehilangan kop.
//  9. Label "Semester" terpotong karena lebar 40pt.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const svc = baca('server/rapor-mtsplus-pdf-service.cjs')

test('logo lembaga memakai nama properti yang benar (lembagaLogoPath)', () => {
  // Bug asli: `logo.lembagaPath` tidak pernah ada, jadi logo lembaga tidak
  // pernah tercetak di sampul maupun kop — tanpa error apa pun.
  // Komentar boleh menyebut nama lama (untuk menjelaskan bug), jadi yang
  // diperiksa hanya baris KODE, bukan komentar.
  const kode = svc.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.ok(kode.includes('lembagaLogoPath'), 'harus ada properti lembagaLogoPath')
  assert.ok(!/logo\.lembagaPath\b/.test(kode), 'logo.lembagaPath sudah tidak boleh dipakai di kode')
  const pakai = (kode.match(/logo\.lembagaLogoPath/g) || []).length
  assert.ok(pakai >= 2, `lembagaLogoPath harus dipakai di kop DAN sampul, dapat ${pakai}`)
})

test('gambar non-JPEG/PNG dikonversi sebelum dicetak (WebP logo Kemenag)', () => {
  assert.ok(svc.includes('async function siapkanGambar'), 'harus ada siapkanGambar')
  // Konversi + resize + kompres lewat sharp (bukan hanya .png().toBuffer()).
  assert.ok(/sharp\(filePath\)\s*\n?\s*\.resize/.test(svc), 'harus resize lewat sharp')
  assert.ok(/\.png\(\{\s*compressionLevel/.test(svc), 'harus kompres PNG agar PDF massal tidak puluhan MB')
  // Konversi WAJIB dipakai di ketiga jalur: data utama, partial, dan foto siswa.
  assert.ok(/kemenagPath:\s*await siapkanGambar/.test(svc), 'logo kemenag harus dikonversi di loadStudentData')
  assert.ok(/fotoPath:\s*await siapkanGambar/.test(svc), 'foto siswa harus dikonversi')
  const partial = svc.slice(svc.indexOf('async function createRaporMtsplusPdfPartial'))
  assert.ok(/await siapkanGambar/.test(partial), 'jalur cover/identitas saja juga harus mengonversi')
  // Cache: cetak massal 500 siswa tidak boleh mengonversi file sama 500 kali.
  assert.ok(svc.includes('_cacheGambar'), 'konversi harus di-cache')
})

// Regresi: hasil konversi harus BERKAS, bukan Buffer.
//
// PDFKit hanya mendeduplikasi objek gambar bila diberi path. Buffer yang sama
// ditanam ulang di setiap halaman — terukur 544 objek gambar pada arsip 136
// halaman dan PDF 13,6 MB, padahal isinya cuma 2 logo + 34 foto. Setelah
// diubah ke .toFile(), arsip yang sama jadi 310 KB (44x lebih kecil).
test('hasil konversi gambar ditulis ke berkas agar PDFKit bisa deduplikasi', () => {
  const kode = svc.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.ok(kode.includes('.toFile(tujuan)'), 'sharp harus menulis ke berkas, bukan Buffer')
  assert.ok(!/\.png\(\{[^}]*\}\)\s*\n?\s*\.toBuffer\(\)/.test(kode), 'tidak boleh mengembalikan Buffer dari siapkanGambar')
  // Nama berkas cache harus deterministik supaya berkas yang sama dipakai ulang.
  assert.ok(kode.includes("createHash('sha1')"), 'nama berkas cache harus hash dari kunci')
  // Berlaku juga untuk buku induk.
  const bi = fs.readFileSync(path.join(__dirname, '..', 'server/buku-induk-pdf-service.cjs'), 'utf8')
  const biKode = bi.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.ok(biKode.includes('.toFile(tujuan)'), 'buku induk juga harus menulis ke berkas')
  assert.ok(!/\.png\(\{[^}]*\}\)\s*\n?\s*\.toBuffer\(\)/.test(biKode), 'buku induk tidak boleh pakai Buffer')
})

test('sampul mencetak yayasan, alamat, dan kontak dari settings', () => {
  const cover = svc.slice(svc.indexOf('// ---------- HALAMAN 1: COVER ----------'), svc.indexOf('// ---------- HALAMAN 2: IDENTITAS ----------'))
  assert.ok(cover.includes('yayasan_nama'), 'yayasan_nama harus tercetak')
  assert.ok(cover.includes('settings.alamat'), 'alamat harus tercetak')
  assert.ok(cover.includes('settings.telepon'), 'telepon harus tercetak')
  assert.ok(cover.includes('settings.email'), 'email harus tercetak')
  // nama_instansi tidak ada di skema; harus ada fallback eksplisit.
  assert.ok(/safeText\(settings\.nama_instansi,\s*'KEMENTERIAN AGAMA REPUBLIK INDONESIA'\)/.test(cover), 'nama_instansi butuh fallback')
})

test('jenjang diambil dari settings, bukan hardcode MTs', () => {
  const cover = svc.slice(svc.indexOf('// ---------- HALAMAN 1: COVER ----------'), svc.indexOf('// ---------- HALAMAN 2: IDENTITAS ----------'))
  assert.ok(cover.includes('settings.jenjang'), 'jenjang harus dari settings')
  assert.ok(cover.includes("'MI'") && cover.includes("'MA'"), 'MI dan MA harus dipetakan')
  // Teks MTs boleh ada sebagai salah satu cabang, tapi tidak sebagai satu-satunya isi.
  assert.ok(!/doc\.text\('Madrasah Tsanawiyah \(MTs\)', M, 284/.test(cover), 'tidak boleh hardcode MTs')
})

test('identitas bernomor urut 1..16 tanpa label a/b/c berulang', () => {
  const blok = svc.slice(svc.indexOf('const rows = ['), svc.indexOf('doc.fontSize(11)'))
  const nomor = [...blok.matchAll(/\['(\d+)\.'/g)].map(m => Number(m[1]))
  assert.deepEqual(nomor, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], `nomor harus 1..16 urut, dapat ${nomor.join(',')}`)
  assert.ok(!/'a\. Nama Ayah'/.test(blok), 'label a. tidak boleh dipakai lagi')
  assert.ok(!blok.includes('alamat_ortu'), 'alamat_ortu bukan kolom siswa — jangan dirujuk')
})

test('tabel nilai tidak melewati margin kanan kertas', () => {
  // Hitung geometri dari sumber, bukan dari PDF (tes harus jalan tanpa render).
  const m = /const cols = \{ no: \{ x: M, w: (\d+) \}, mapel: \{ x: M \+ (\d+), w: (\d+) \}, kkm: \{ x: M \+ (\d+), w: (\d+) \}, nilai: \{ x: M \+ (\d+), w: (\d+) \}, huruf: \{ x: M \+ (\d+), w: (\d+) \}, capaian: \{ x: M \+ (\d+), w: (W - M - \(M \+ (\d+)\)) \} \}/.exec(svc)
  assert.ok(m, 'definisi kolom harus dalam bentuk yang bisa dihitung')
  const W = 595.28, M = 34
  const capaianX = M + Number(m[10])
  const capaianW = W - M - capaianX
  const tepiKanan = capaianX + capaianW
  assert.ok(tepiKanan <= W - M + 0.01, `tepi kanan tabel ${tepiKanan.toFixed(2)} harus <= ${(W - M).toFixed(2)}`)
})

test('halaman lanjutan tabel nilai memakai kop lagi', () => {
  const blok = svc.slice(svc.indexOf('const drawRow ='), svc.indexOf('drawHeader()\n    rapor.forEach'))
  assert.ok(/y \+ rowH > 760/.test(blok), 'harus ada pemecah halaman')
  const pecah = blok.slice(blok.indexOf('y + rowH > 760'), blok.indexOf('doc.font(bold'))
  assert.ok(pecah.includes('drawKop'), 'halaman baru WAJIB memanggil drawKop')
  assert.ok(!/y = 50;\s*drawHeader\(\)/.test(pecah), 'tidak boleh lompat ke y=50 tanpa kop')
})

test('label Semester diberi lebar cukup agar tidak terpotong', () => {
  assert.ok(/doc\.text\('Semester',[^)]*width:\s*(4[89]|5\d|[6-9]\d)/.test(svc), 'lebar label Semester minimal 48pt')
  assert.ok(!/doc\.text\('Semester',[^)]*width:\s*40/.test(svc), 'lebar 40pt membuat label terpotong')
})

test('romawi hanya mengubah angka murni, bukan nama rombel', () => {
  const isi = svc.slice(svc.indexOf('function romawi'), svc.indexOf('function jenisLabel'))
  const fn = new Function(`${isi}; return romawi`)()
  assert.equal(fn(8), 'VIII')
  assert.equal(fn('8'), 'VIII')
  assert.equal(fn('VIII-A'), 'VIII-A', 'nama rombel tidak boleh diubah')
  assert.equal(fn('VII-B'), 'VII-B')
  assert.equal(fn(''), '')
  assert.equal(fn(null), '')
  // Nama rombel ber-prefiks "KELAS" (tenant tertentu menyimpan "KELAS 2") harus
  // dibuang kata "Kelas"-nya supaya label "Kelas:"/"Wali Kelas" tidak ganda.
  assert.equal(fn('KELAS 2'), 'II')
  assert.equal(fn('Kelas 2'), 'II')
  assert.equal(fn('KELAS 6'), 'VI')
  assert.equal(fn('KELAS 2-A'), 'II-A')
  assert.equal(fn('kelas 2'), 'II')
})

test('NISN bergabung (#) dicetak bagian nasionalnya saja', () => {
  assert.ok(/String\(siswa\.nisn \|\| ''\)\.split\('# '\)/.test(svc) || /split\('#'\)\[1\]/.test(svc), 'sampul harus memisahkan nisn gabungan')
})

test('jenis kelamin dicetak sebagai kata, bukan huruf L/P', () => {
  assert.ok(/jenis_kelamin === 'L' \? 'Laki-laki'/.test(svc), 'L harus jadi Laki-laki')
  assert.ok(/jenis_kelamin === 'P' \? 'Perempuan'/.test(svc), 'P harus jadi Perempuan')
})
