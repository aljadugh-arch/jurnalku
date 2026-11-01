// Kontrak UI keamanan akun: tab masuk, langkah 2FA, tautan email, kartu profil.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const baca = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')

test('login punya tiga cara masuk: sandi, OTP WA, tautan email', () => {
  const s = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(s.includes("['sandi', 'Sandi']") && s.includes("['otp', 'OTP WA']") && s.includes("['tautan', 'Tautan Email']"))
  assert.ok(s.includes('/auth/magic/peek'), 'tautan dibaca dulu tanpa menghanguskan token')
  assert.ok(s.includes('mfa_required'), 'login menangani tantangan 2FA')
})

test('login tanpa sandi memakai kode authenticator', () => {
  const s = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(s.includes('masukDenganTotp'), 'memanggil endpoint totp-login')
  assert.ok(s.includes('Masuk Tanpa Sandi'))
})

test('profil menyediakan aktivasi 2FA + kode pemulihan', () => {
  const s = baca('src/pages/ProfilePage.tsx')
  assert.ok(s.includes("api.post('/auth/2fa/setup')"))
  assert.ok(s.includes("api.post('/auth/2fa/enable'"))
  assert.ok(s.includes('QRCodeSVG'), 'QR authenticator dirender lokal')
  assert.ok(s.includes('recovery_codes'), 'kode pemulihan ditampilkan sekali')
  assert.ok(s.includes('Simpan kode pemulihan'), 'peringatan menyimpan kode')
})
