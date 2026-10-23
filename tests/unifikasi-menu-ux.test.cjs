'use strict'
// Kontrak unifikasi menu + perbaikan navigasi hasil audit UX (23 Okt 2026).
//
// Temuan audit yang dikunci di sini:
//  1. Sidebar desktop TIDAK boleh lagi memakai array menu lokal
//     (siswaMenuItems/kepalaMenuItems/bendaharaMenuItems) yang menyimpang dari
//     menuItems.tsx. Sumber tunggal = menuForRole().
//  2. wali_murid punya menu SENDIRI (route nyata), bukan menu siswa ber-anchor
//     hash yang mati di WaliDashboardPage.
//  3. Role wali_kelas dipromosikan otomatis saat rombel.wali_kelas_id diisi.
//  4. GuruDashboard menangani scroll anchor (#tugas) seperti SiswaDashboard.
//  5. ROLE_LABELS lengkap (wali_murid/bendahara/operator/tata_usaha/tu).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = p => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('sidebar memakai menuForRole sebagai sumber tunggal (tidak ada array menu lokal)', () => {
  const s = baca('src/components/layout/Sidebar.tsx')
  assert.match(s, /menuForRole\(user\?\.role === 'kepala'/, 'sidebar harus memakai menuForRole')
  // Array lokal lama harus hilang dari KODE (bukan sekadar komentar).
  assert.ok(!/^const siswaMenuItems:/.test(s), 'array lokal siswaMenuItems harus hilang dari Sidebar')
  assert.ok(!/^const kepalaMenuItems:/.test(s), 'array lokal kepalaMenuItems harus hilang dari Sidebar')
  assert.ok(!/^const bendaharaMenuItems:/.test(s), 'array lokal bendaharaMenuItems harus hilang dari Sidebar')
})

test('wali_murid punya menu sendiri dengan route nyata (bukan anchor hash)', () => {
  const m = baca('src/lib/menuItems.tsx')
  assert.match(m, /export const waliMuridMenuItems/, 'menu wali_murid harus didefinisikan')
  const blok = m.slice(m.indexOf('export const waliMuridMenuItems'), m.indexOf('// Bendahara'))
  for (const rute of ["'/siswa/nilai'", "'/siswa/tagihan'", "'/siswa/tabungan'", "'/siswa/absensi'"]) {
    assert.ok(blok.includes(rute), `menu wali harus memuat route nyata ${rute}`)
  }
  assert.ok(!blok.includes('/siswa#'), 'menu wali tidak boleh memuat anchor hash')
  assert.match(m, /role === 'wali_murid' \? waliMuridMenuItems/, 'menuForRole harus merutekan wali_murid ke menunya')
})

test('siswa menu memakai route nyata, bukan anchor hash', () => {
  const m = baca('src/lib/menuItems.tsx')
  const blok = m.slice(m.indexOf('export const siswaMenuItems'), m.indexOf('// Wali murid'))
  assert.ok(!blok.includes('/siswa#'), 'menu siswa tidak boleh memuat anchor hash')
  for (const rute of ["'/siswa/nilai'", "'/siswa/tugas'", "'/siswa/tagihan'", "'/siswa/tabungan'"]) {
    assert.ok(blok.includes(rute), `menu siswa harus memuat ${rute}`)
  }
})

test('role wali_kelas dipromosikan otomatis saat rombel.wali_kelas_id diisi', () => {
  const s = baca('server/index.cjs')
  assert.match(s, /function syncWaliKelasRole/, 'helper sinkronisasi wali_kelas harus ada')
  const blok = s.slice(s.indexOf('function syncWaliKelasRole'), s.indexOf('app.post(\'/api/rombel\''))
  assert.match(blok, /UPDATE users SET role='wali_kelas'/, 'harus mempromosikan user ke wali_kelas')
  assert.match(blok, /UPDATE users SET role='guru'/, 'harus mendemote kembali ke guru')
  // Dipanggil di POST, PUT (baru + lama), dan DELETE rombel.
  assert.ok((s.match(/syncWaliKelasRole\(/g) || []).length >= 5, 'syncWaliKelasRole harus dipanggil di POST/PUT/DELETE rombel')
})

test('GuruDashboard menangani scroll anchor hash (menu Penugasan)', () => {
  const g = baca('src/pages/guru/GuruDashboard.tsx')
  assert.match(g, /useLocation/, 'GuruDashboard harus membaca useLocation')
  assert.match(g, /location\.hash/, 'GuruDashboard harus menangani hash anchor')
  assert.match(g, /scrollIntoView/, 'GuruDashboard harus menggulir ke section ber-hash')
})

test('ROLE_LABELS lengkap untuk semua role produksi', () => {
  const r = baca('src/lib/roles.ts')
  for (const role of ['wali_murid', 'bendahara', 'operator', 'tata_usaha', 'tu']) {
    assert.match(r, new RegExp(`${role}: '`), `ROLE_LABELS harus memuat ${role}`)
  }
})

test('demo login melayani proktor', () => {
  const s = baca('server/index.cjs')
  assert.match(s, /'admin','kepala','guru','wali_kelas','bendahara','siswa','wali_murid','proktor'/, 'proktor harus di daftar allowed demo')
  assert.match(s, /\['guru','kepala','bendahara','proktor'\]\.includes\(actualRole\)/, 'proktor harus dapat GTK demo')
})
