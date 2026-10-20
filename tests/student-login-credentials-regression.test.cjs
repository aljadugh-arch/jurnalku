const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server', 'index.cjs'), 'utf8')
const page = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
const login = fs.readFileSync(path.join(root, 'src', 'pages', 'auth', 'LoginPage.tsx'), 'utf8')

test('password awal akun siswa memprioritaskan NISN lalu fallback ke NIS', () => {
  const fn = server.match(/function studentInitialPassword\(siswa\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(fn, /siswa\?\.nisn/)
  assert.match(fn, /siswa\?\.nis/)
  assert.ok(fn.indexOf('siswa?.nisn') < fn.lastIndexOf('siswa?.nis'), 'NISN harus diperiksa sebelum NIS')
})

test('admin dapat membuat akun siswa dan mereset password ke NISN atau NIS', () => {
  assert.match(page, /\/siswa\/generate-akun/)
  assert.match(page, /reset_password: true/)
  assert.match(page, /Reset Password ke NISN\/NIS/)
  assert.match(server, /resetDefaultPassword && user\.must_change_password/)
  assert.match(server, /reset_default_password === true/)
})

test('prioritas kredensial siswa tetap terdokumentasi, tapi TIDAK di halaman login', () => {
  // Dulu halaman login memuat paragraf "Username dan password awal siswa
  // menggunakan NISN, atau NIS jika NISN belum tersedia". Atas permintaan
  // pemilik produk, halaman login dibuat bersih: hanya label "Username" dan
  // "Password" tanpa keterangan tambahan.
  //
  // Informasi itu TIDAK hilang dari produk — tetap ada di halaman Data Siswa
  // (tombol "Reset Password ke NISN/NIS") yang sudah diperiksa tes di atas.
  assert.ok(!login.includes('Username dan password awal siswa menggunakan NISN'),
    'halaman login tidak boleh lagi memuat paragraf kredensial')
  const page = fs.readFileSync(path.join(__dirname, '..', 'src/pages/admin/DataSiswaPage.tsx'), 'utf8')
  assert.match(page, /Reset Password ke NISN\/NIS/, 'halaman Data Siswa tetap menjelaskan kredensial')
})
