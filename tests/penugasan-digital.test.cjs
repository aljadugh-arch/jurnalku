'use strict'
// Kontrak Penugasan Digital (LMS) — 23 Okt 2026.
//
// Guru membuat tugas (judul, deskripsi, deadline, lampiran, bobot), siswa
// mengumpulkan (teks/berkas), guru merekap + menilai. Deadline lewat ditandai
// "terlambat" tapi tetap diterima. Ini menutup gap kompetitor (APPSO/SIDIGS
// LMS penugasan) di atas tabel tugas_siswa yang sebelumnya hanya judul+deskripsi.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = p => fs.readFileSync(path.join(AKAR, p), 'utf8')
const server = baca('server/index.cjs')

test('tabel tugas_pengumpulan dibuat dengan unique per (tugas, siswa)', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS tugas_pengumpulan/, 'tabel pengumpulan ada')
  assert.match(server, /UNIQUE INDEX IF NOT EXISTS idx_tugas_pengumpulan_unik/, 'unique index per tugas+siswa')
  assert.match(server, /ON tugas_pengumpulan\(tenant_id, tugas_id, siswa_id\)/, 'kunci unik tenant+tugas+siswa')
})

test('tugas_siswa migrasi aditif: lampiran + bobot', () => {
  assert.match(server, /addTugas = \[/, 'ada daftar kolom addTugas')
  assert.match(server, /ALTER TABLE tugas_siswa ADD COLUMN \$\{col\} \$\{type\}/, 'loop migrasi kolom tugas')
  assert.match(server, /\['file_path', "TEXT NOT NULL DEFAULT ''"\]/, 'kolom file_path')
  assert.match(server, /\['bobot', 'INTEGER NOT NULL DEFAULT 100'\]/, 'kolom bobot')
  // Multer khusus tugas dengan whitelist tipe + 20 MB.
  assert.match(server, /TUGAS_TIPE_DIIZINKAN/, 'whitelist tipe tugas')
  assert.match(server, /fileSize: 20 \* 1024 \* 1024/, 'batas 20 MB')
})

test('guru bisa buat tugas dengan lampiran + bobot (multipart)', () => {
  assert.match(server, /app\.post\('\/api\/guru\/tugas', TEACHER, tugasUpload\.single\('file'\)/, 'POST tugas pakai multipart')
  assert.match(server, /INSERT INTO tugas_siswa \(id,guru_id,mapel_id,rombel_id,judul,deskripsi,deadline,file_path,file_nama,file_ukuran,file_tipe,bobot,tenant_id\)/, 'insert menyertakan lampiran + bobot')
})

test('guru bisa rekap pengumpulan per siswa', () => {
  assert.match(server, /app\.get\('\/api\/guru\/tugas\/:id\/pengumpulan'/, 'route rekap ada')
  assert.match(server, /status: k \? 'dikumpulkan' : 'belum'/, 'status kumpul/belum per siswa')
  assert.match(server, /jumlah_terlambat/, 'ringkasan jumlah terlambat')
})

test('guru bisa memberi nilai + feedback (batas 0..bobot)', () => {
  assert.match(server, /app\.put\('\/api\/guru\/pengumpulan\/:id\/nilai'/, 'route nilai ada')
  assert.match(server, /Nilai harus 0–/, 'validasi batas nilai')
  assert.match(server, /nilaiVal > \(p\.bobot \|\| 100\)/, 'nilai dibatasi bobot tugas')
})

test('siswa bisa mengumpulkan tugas (teks/berkas), deadline lewat = terlambat', () => {
  assert.match(server, /app\.post\('\/api\/siswa\/tugas\/:id\/kumpul'/, 'route kumpul ada')
  assert.match(server, /Isi jawaban teks atau lampirkan berkas/, 'wajib teks atau berkas')
  assert.match(server, /Date\.now\(\) > dl\) terlambat = 1/, 'deteksi terlambat dari deadline')
  assert.match(server, /ON CONFLICT\(tenant_id,tugas_id,siswa_id\) DO UPDATE/, 'kumpul ulang menimpa pengumpulan lama')
})

test('siswa melihat status kumpul + nilai sendiri di daftar tugas', () => {
  assert.match(server, /LEFT JOIN tugas_pengumpulan p ON p\.tugas_id=t\.id AND p\.siswa_id=\?/, 'daftar tugas siswa bergabung pengumpulan')
  assert.match(server, /p\.nilai, p\.catatan_guru, p\.submitted_at, p\.terlambat/, 'status + nilai sendiri ikut dikirim')
})

test('hapus tugas juga menghapus lampiran + pengumpulan dari disk', () => {
  assert.match(server, /DELETE FROM tugas_pengumpulan WHERE tugas_id=/, 'hapus pengumpulan saat hapus tugas')
  assert.match(server, /for \(const f of files\) \{ try \{ if \(fs\.existsSync\(f\)\) fs\.unlinkSync\(f\) \}/, 'hapus berkas dari disk')
})

test('frontend: halaman penugasan guru + form kumpul siswa ada', () => {
  const g = baca('src/pages/guru/GuruTugasPage.tsx')
  assert.match(g, /api\.get\('\/guru\/tugas'\)/, 'halaman guru memuat tugas')
  assert.match(g, /api\.get\('\/guru\/tugas-scope'\)/, 'halaman guru memuat cakupan mengajar')
  assert.match(g, /api\.get\(`\/guru\/tugas\/\$\{t\.id\}\/pengumpulan`\)/, 'halaman guru memuat rekap')
  assert.match(g, /api\.put\(`\/guru\/pengumpulan\/\$\{nilaiModal\.pengumpulan_id\}\/nilai`/, 'halaman guru menyimpan nilai')
  const s = baca('src/pages/siswa/SiswaSectionPage.tsx')
  assert.match(s, /api\.get\('\/siswa\/tugas'\)/, 'halaman siswa memuat tugas')
  assert.match(s, /api\.post\(`\/siswa\/tugas\/\$\{id\}\/kumpul`/, 'halaman siswa mengumpulkan tugas')
})

test('menu guru "Penugasan" menunjuk route nyata /guru/tugas (bukan hash)', () => {
  const m = baca('src/lib/menuItems.tsx')
  assert.match(m, /label: 'Penugasan', path: '\/guru\/tugas'/, 'menu penugasan ke /guru/tugas')
  assert.ok(!m.includes('/guru#tugas'), 'tidak ada lagi anchor hash /guru#tugas')
})
