'use strict'
// Kontrak: halaman login bersih — tanpa keterangan tambahan.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const ui = fs.readFileSync(path.join(AKAR, 'src/pages/auth/LoginPage.tsx'), 'utf8')

test('kolom username dan password memakai label sederhana', () => {
  assert.ok(/htmlFor="login-identifier"[\s\S]{0,120}>\s*Username\s*</.test(ui), 'label harus "Username"')
  assert.ok(/placeholder="Username"/.test(ui), 'placeholder username harus "Username"')
  assert.ok(/placeholder="Password"/.test(ui), 'placeholder password harus "Password"')
})

test('tab OTP memakai label sederhana', () => {
  assert.ok(/htmlFor="otp-phone"[\s\S]{0,120}>\s*Nomor WhatsApp\s*</.test(ui), 'label harus "Nomor WhatsApp"')
  assert.ok(/placeholder="Nomor WhatsApp"/.test(ui), 'placeholder harus "Nomor WhatsApp"')
})

test('tidak ada keterangan panjang yang diminta dihapus', () => {
  const dilarang = [
    'Username dan password awal siswa menggunakan NISN',
    'Email / No. WhatsApp Wali / Kode Guru / NISN',
    'email, no. WA wali, kode guru, NISN, atau NIS',
    'Gunakan nomor yang terdaftar di sekolah',
    'Wali murid: masuk dengan nomor WhatsApp yang terdaftar',
    'Sandi awal = 6 angka terakhir nomor tersebut',
  ]
  for (const t of dilarang) {
    assert.ok(!ui.includes(t), `teks berikut harus hilang: "${t.slice(0, 40)}"`)
  }
})
