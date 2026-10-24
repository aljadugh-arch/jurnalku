'use strict'
// Kontrak redesign login SISFO (24 Okt 2026).
//
// Halaman login diadopsi dari sisfo.upiyptk.ac.id: layout split (kiri intro
// lembaga + grid layanan, kanan kartu login), design system krem/oranye dengan
// kelas prefiks `sk-`. Logika login (OTP wali, akun demo, banner PPDB) TIDAK
// boleh hilang saat restyling.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const login = fs.readFileSync(path.join(AKAR, 'src/pages/auth/LoginPage.tsx'), 'utf8')
const sisfo = fs.readFileSync(path.join(AKAR, 'src/styles/sisfo.css'), 'utf8')

test('design system sisfo punya token palet + kelas komponen', () => {
  assert.ok(sisfo.includes('--sk-orange: #f47b20'), 'aksen oranye utama')
  assert.ok(sisfo.includes('--sk-bg: #fbfaf8'), 'canvas krem')
  assert.ok(sisfo.includes("'Poppins'"), 'font Poppins')
  assert.ok(/\.sk-card\b/.test(sisfo), 'kelas kartu')
  assert.ok(/\.sk-service\b/.test(sisfo), 'kelas service card')
  assert.ok(/\.sk-btn\b/.test(sisfo), 'kelas tombol')
})

test('halaman login memakai kelas design system sisfo', () => {
  assert.ok(/sk-root/.test(login), 'canvas akar sk-root')
  assert.ok(/sk-nav\b/.test(login), 'navbar sk-nav')
  assert.ok(/sk-card\b/.test(login), 'kartu login sk-card')
  assert.ok(/sk-service\b/.test(login), 'grid layanan sk-service')
  assert.ok(/sk-btn\b/.test(login), 'tombol sk-btn')
})

test('layout split: intro lembaga + grid layanan tetap ada', () => {
  assert.ok(/grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2/.test(login), 'layout dua kolom')
  assert.ok(/Selamat Datang di/.test(login), 'judul sambutan')
  assert.ok(/namaLembaga/.test(login), 'nama lembaga dinamis')
  assert.ok(/layanan\.map/.test(login), 'grid layanan dirender dari daftar')
})

test('logika login tidak boleh hilang saat restyling', () => {
  // OTP wali murid
  assert.ok(/mintaOtp/.test(login) && /loginDenganOtp/.test(login), 'alur OTP wali')
  assert.ok(/mode === 'otp'/.test(login), 'tab OTP')
  // Akun demo gated server
  assert.ok(/demoHostAktif/.test(login) && /demo-status/.test(login), 'penjaga akun demo')
  // Banner PPDB
  assert.ok(/ppdb\.dibuka/.test(login) && /ppdb\/publik\/info/.test(login), 'banner PPDB')
  // Deteksi koneksi lambat
  assert.ok(/setLambat\(true\)/.test(login), 'deteksi koneksi lambat')
  // Login kredensial
  assert.ok(/loginWithCredentials/.test(login), 'login username/password')
})

test('copy label tetap sederhana (kontrak lama dipertahankan)', () => {
  assert.ok(/placeholder="Username"/.test(login), 'placeholder username sederhana')
  assert.ok(/placeholder="Password"/.test(login), 'placeholder password sederhana')
})

test('kartu login tidak meluber di layar sempit (max-w-full + min-w-0)', () => {
  // Grid satu kolom bisa menetapkan lebar lintasan ke max-content kartu,
  // membuat kartu lebih lebar dari viewport di ponsel. Pengaman wajib:
  // item grid diberi min-w-0 dan kartu dibatasi max-w-full.
  assert.ok(/section className="min-w-0 w-full"/.test(login), 'item grid kanan min-w-0')
  assert.ok(/max-w-full sm:max-w-\[500px\]/.test(login), 'kartu dibatasi max-w-full di ponsel')
  assert.ok(/hidden min-w-0 lg:block/.test(login), 'intro tersembunyi di mobile + min-w-0')
})
