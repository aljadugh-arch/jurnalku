'use strict'
// Kontrak LMS (materi ajar + progres belajar).
//
// Empat hal yang menentukan modul ini bermakna atau tidak:
//
//  1. PROGRES unik per siswa per materi. Tanpa unique index, siswa yang membuka
//     dua kali terhitung dua orang dan "berapa yang sudah membaca" jadi bohong.
//  2. dibuka_pertama TIDAK berubah saat dibuka lagi. Kalau ikut diperbarui,
//     guru tidak bisa tahu siapa yang menunda sampai mendekati ujian.
//  3. AKSES per rombel disaring DI QUERY, bukan disembunyikan di UI.
//  4. TIPE BERKAS dibatasi. Materi ajar bukan tempat menyimpan executable.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const lms = require(path.join(AKAR, 'server', 'lms.cjs'))
const s = baca('server/lms.cjs')

test('tabel materi dan progres ada', () => {
  assert.ok(/CREATE TABLE IF NOT EXISTS lms_materi/.test(s))
  assert.ok(/CREATE TABLE IF NOT EXISTS lms_progres/.test(s))
})

test('progres unik per siswa per materi', () => {
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_progres_unik/.test(s),
    'tanpa unique index, buka dua kali dihitung dua siswa')
  assert.ok(/ON lms_progres\(tenant_id, materi_id, siswa_id\)/.test(s))
})

test('dibuka_pertama tidak ditimpa saat dibuka lagi', () => {
  const i = s.indexOf('jumlah_buka=jumlah_buka+1')
  assert.ok(i > 0)
  const badan = s.slice(i - 200, i + 60)
  assert.ok(!/dibuka_pertama=/.test(badan),
    'dibuka_pertama harus tetap; hanya dibuka_terakhir dan jumlah_buka yang berubah')
})

test('akses siswa disaring per rombel di query', () => {
  assert.ok(/m\.rombel_id IS NULL OR m\.rombel_id = \?/.test(s),
    'materi rombel lain tidak boleh terbaca hanya karena tahu ID')
  assert.ok(/publikasi = 1/.test(s), 'materi draf tidak boleh terbaca siswa')
})

test('siswa rombel lain ditolak saat membuka materi', () => {
  assert.ok(/Materi ini bukan untuk rombel Anda/.test(s))
})

test('tipe berkas dibatasi lewat daftar izin, bukan daftar larangan', () => {
  // Kunci PERILAKU: harus ada allowlist dan penolakan eksplisit untuk tipe
  // di luar daftar. Jangan cocokkan kata di komentar — itu rapuh.
  assert.ok(/const TIPE_DIIZINKAN = new Set/.test(s), 'harus pakai allowlist')
  assert.ok(/application\/pdf/.test(s), 'PDF harus diizinkan')
  assert.ok(/!TIPE_DIIZINKAN\.has\(/.test(s),
    'berkas di luar allowlist harus ditolak, bukan diterima diam-diam')
  assert.ok(/tidak diizinkan untuk materi ajar/.test(s), 'penolakan harus memberi alasan jelas')
})

test('batas ukuran berkas ada', () => {
  assert.ok(/MAKS_BYTE/.test(s))
  assert.ok(/50 \* 1024 \* 1024/.test(s))
})

test('menghapus materi ikut menghapus berkas fisik dan progres', () => {
  const i = s.indexOf("app.delete('/api/lms/materi/:id'")
  const badan = s.slice(i, i + 900)
  assert.ok(/fs\.unlinkSync/.test(badan), 'berkas fisik harus dihapus, kalau tidak uploads menumpuk')
  assert.ok(/DELETE FROM lms_progres/.test(badan), 'progres yatim harus dibersihkan')
})

test('progres menampilkan siswa yang BELUM membuka', () => {
  const i = s.indexOf("app.get('/api/lms/materi/:id/progres'")
  const badan = s.slice(i, i + 1200)
  assert.ok(/belumMembuka/.test(badan),
    'guru menanyakan siapa yang belum membaca, bukan hanya siapa yang sudah')
})

test('rute, halaman, dan menu terdaftar', () => {
  assert.ok(/daftarkanRuteLms\(app/.test(baca('server/index.cjs')))
  assert.ok(/path="lms"/.test(baca('src/App.tsx')))
  assert.ok(/Materi Ajar/.test(baca('src/lib/menuItems.tsx')))
})

test('halaman dengan tabel dibungkus overflow-x-auto', () => {
  const h = baca('src/pages/admin/LmsPage.tsx')
  if (h.includes('<table')) assert.ok(/overflow-x-auto/.test(h))
})
