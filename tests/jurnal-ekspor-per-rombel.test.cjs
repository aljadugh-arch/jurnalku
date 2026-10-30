// Ekspor Jurnal Mengajar guru: disusun PER ROMBEL (Excel & PDF).
//
// Yang dijaga: laporan tidak lagi satu daftar datar lintas kelas, melainkan
// dikelompokkan per rombel — tiap rombel memuat jurnal hariannya (beberapa guru
// & mapel per hari sesuai jadwal), diurutkan tanggal -> jam -> mapel -> guru.
//   - Excel : satu lembar per rombel + lembar "Ringkasan" di depan.
//   - PDF   : satu blok tabel per rombel.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-jurnal-rombel'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(path.join(__dirname, '../src/pages/admin/JurnalPage.tsx'), 'utf8')

test('pengelompokan per rombel + urutan tanggal/jam/mapel/guru', () => {
  assert.match(page, /const kelompokRombel = /, 'ada helper pengelompokan')
  assert.match(page, /String\(a\.tanggal \|\| ''\)\.localeCompare\(String\(b\.tanggal \|\| ''\)\)/, 'urut tanggal')
  assert.match(page, /\(Number\(a\.jam_ke\) \|\| 0\) - \(Number\(b\.jam_ke\) \|\| 0\)/, 'lalu jam ke')
  assert.match(page, /const grup = kelompokRombel\(semua\)/, 'dipakai di ekspor')
})

test('Excel: satu lembar per rombel + lembar Ringkasan', () => {
  assert.match(page, /book_append_sheet\(wb, ws, namaSheet\(rombel, dipakai\)\)/, 'sheet per rombel')
  assert.match(page, /book_append_sheet\(wb, wsR, 'Ringkasan'\)/, 'sheet ringkasan')
  assert.match(page, /Jurnal_Mengajar_per_Rombel\.xlsx/, 'nama berkas per rombel')
  assert.match(page, /const namaSheet = /, 'nama sheet disanitasi (maks 31 char)')
})

test('PDF: satu blok tabel per rombel', () => {
  assert.match(page, /const blok = kelompokRombel\(semua\)\.map/, 'blok per rombel')
  assert.match(page, /<h4>Rombel: \$\{escapeHtml\(rombel\)\}/, 'judul rombel tiap blok')
  assert.match(page, /<div class="meta">\$\{escapeHtml\(filterInfo\)\}<\/div>\$\{blok\}\$\{signatureBlockHtml/, 'blok menggantikan tabel datar')
  assert.match(page, /JURNAL KEGIATAN PEMBELAJARAN \(PER ROMBEL\)/)
})

test('kolom Rombel tidak lagi diulang di dalam blok (sudah jadi judul)', () => {
  // Excel per rombel memakai judul kolom tanpa 'Rombel'.
  assert.match(page, /const judulKolom = \['No', 'Tanggal', 'Jam Ke', 'Mapel', 'Guru', 'Materi', 'Kegiatan', 'Catatan', 'Status'\]/)
})
