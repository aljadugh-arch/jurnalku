const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server', 'index.cjs'), 'utf8')
const page = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
const login = fs.readFileSync(path.join(root, 'src', 'pages', 'auth', 'LoginPage.tsx'), 'utf8')

test('password awal akun siswa adalah NIS sesuai kredensial yang diumumkan', () => {
  assert.match(server, /function studentInitialPassword\(siswa\)[\s\S]*return String\(siswa\?\.nis/)
  const fn = server.match(/function studentInitialPassword\(siswa\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.doesNotMatch(fn, /nisn|tanggal_lahir/)
})

test('admin dapat membuat akun siswa dan mereset password ke NIS', () => {
  assert.match(page, /\/siswa\/generate-akun/)
  assert.match(page, /reset_password: true/)
  assert.match(page, /Reset Password ke NIS/)
  assert.match(server, /resetDefaultPassword && user\.must_change_password/)
  assert.match(server, /reset_default_password === true/)
})

test('halaman login menjelaskan kredensial siswa secara jelas', () => {
  assert.match(login, /Username dan password awal siswa menggunakan NIS/)
})
