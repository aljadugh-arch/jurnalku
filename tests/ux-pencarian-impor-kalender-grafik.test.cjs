'use strict'
// Kontrak enam perbaikan UX & operasional:
//
//  1. PENCARIAN di halaman yang memuat data siswa/GTK.
//  2. IMPOR EXCEL + cek ISBN untuk katalog (buku tidak lagi satu-satu).
//  3. KALENDER KBM menampilkan hari efektif mode normalisasi.
//  4. Tombol absensi tidak menumpuk satu kolom di mobile (grid 2/3).
//  6. Statistik monitoring tampil sebagai grafik, bukan hanya teks.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

// ---------------- (1) pencarian ----------------
test('komponen pencarian bersama tersedia', () => {
  const s = baca('src/components/SearchInput.tsx')
  assert.ok(/export default function SearchInput/.test(s))
  assert.ok(/export function cocokBeberapa/.test(s))
})

test('halaman data siswa/GTK memakai pencarian', () => {
  for (const p of [
    'src/pages/admin/WaliKelasPage.tsx',
    'src/pages/admin/PengajarPage.tsx',
    'src/pages/admin/BkPage.tsx',
    'src/pages/admin/JurnalPage.tsx',
  ]) {
    const s = baca(p)
    assert.ok(/SearchInput/.test(s), `${p} harus memakai SearchInput`)
  }
})

test('dropdown GTK panjang bisa dicari', () => {
  // Daftar guru bisa ratusan; dropdown tanpa pencarian memaksa scroll panjang.
  const wali = baca('src/pages/admin/WaliKelasPage.tsx')
  assert.ok(/cariGtk/.test(wali), 'pemilihan wali kelas harus bisa dicari')
  const peng = baca('src/pages/admin/PengajarPage.tsx')
  assert.ok(/cariGuru/.test(peng), 'pemilihan guru pengajar harus bisa dicari')
})

// ---------------- (2) impor excel + isbn ----------------
test('pustaka punya impor massal, bukan hanya input satu-satu', () => {
  const srv = baca('server/pustaka.cjs')
  assert.ok(/\/api\/pustaka\/buku\/impor/.test(srv), 'endpoint impor harus ada')
  const ui = baca('src/pages/admin/PustakaPage.tsx')
  assert.ok(/ImportExcel/.test(ui), 'UI harus memakai komponen ImportExcel')
  assert.ok(/Impor Excel/.test(ui))
})

test('impor melaporkan baris yang gagal, bukan membatalkan semua', () => {
  const srv = baca('server/pustaka.cjs')
  const i = srv.indexOf("/api/pustaka/buku/impor")
  const badan = srv.slice(i, i + 1800)
  assert.ok(/hasil\.gagal/.test(badan), 'harus menghitung baris gagal')
  assert.ok(/hasil\.detail\.push/.test(badan), 'harus menyebut baris mana yang gagal')
})

test('ada pencarian ISBN untuk scanner barcode', () => {
  const srv = baca('server/pustaka.cjs')
  assert.ok(/\/api\/pustaka\/buku\/cari-isbn/.test(srv))
  const ui = baca('src/pages/admin/PustakaPage.tsx')
  assert.ok(/cari-isbn/.test(ui), 'UI harus memanggil endpoint cek ISBN')
})

// ---------------- (3) kalender KBM ----------------
test('kalender KBM memproyeksikan hari efektif mode normalisasi', () => {
  const srv = baca('server/index.cjs')
  const i = srv.indexOf("app.get('/api/kalender-kbm'")
  const badan = srv.slice(i, i + 2000)
  assert.ok(/kbmAutoActiveFor/.test(badan),
    'kalender harus memakai mode otomatis, kalau tidak tampak kosong padahal absensi jalan')
  assert.ok(/KBM Aktif \(otomatis\)/.test(badan), 'hari otomatis harus ditandai')
  assert.ok(/otomatis: 1/.test(badan), 'UI butuh penanda otomatis')
})

test('status KBM memberi tahu sumbernya', () => {
  const srv = baca('server/index.cjs')
  const i = srv.indexOf("app.get('/api/kalender-kbm/status'")
  const badan = srv.slice(i, i + 700)
  assert.ok(/sumber:/.test(badan), 'UI perlu tahu aktif karena kalender atau otomatis')
})

test('halaman kalender menjelaskan mode normalisasi', () => {
  const ui = baca('src/pages/admin/KalenderKBMPage.tsx')
  assert.ok(/Normalisasi KBM aktif/.test(ui))
  assert.ok(/otomatis/.test(ui))
})

// ---------------- (4) tombol absensi mobile ----------------
test('tombol absensi memakai grid 2/3 kolom, bukan satu kolom menumpuk', () => {
  const ui = baca('src/pages/admin/AbsensiSiswaPage.tsx')
  assert.ok(/grid-cols-2/.test(ui), 'harus grid 2 kolom di ponsel')
  assert.ok(/sm:grid-cols-3/.test(ui), 'harus 3 kolom di layar agak lebar')
  assert.ok(/Scan Kamera/.test(ui) && /Scan Foto/.test(ui))
  for (const st of ['hadir', 'sakit', 'izin', 'alpha']) {
    assert.ok(ui.includes(st), `tombol "semua ${st}" harus tetap ada`)
  }
})

// ---------------- (6) grafik monitoring ----------------
test('statistik monitoring memakai grafik, bukan hanya teks', () => {
  const ui = baca('src/pages/admin/MobileAdminDashboard.tsx')
  assert.ok(/recharts/.test(ui), 'harus memakai recharts')
  assert.ok(/function Donut/.test(ui), 'harus ada komponen donut')
  assert.ok(/<Donut/.test(ui), 'donut harus dirender')
})

test('donut dipakai untuk absensi dan ceklok', () => {
  const ui = baca('src/pages/admin/MobileAdminDashboard.tsx')
  const jumlah = (ui.match(/<Donut/g) || []).length
  assert.ok(jumlah >= 2, `minimal 2 donut (absensi + ceklok), dapat ${jumlah}`)
})
