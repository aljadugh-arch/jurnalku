const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')

const landing = read('src/pages/LandingPage.tsx')
const login = read('src/pages/auth/LoginPage.tsx')
const register = read('src/pages/auth/RegisterPage.tsx')
const main = read('src/main.tsx')
const server = read('server/index.cjs')
const index = read('index.html')

test('kartu pilihan domain tetap muat pada viewport 320px', () => {
  assert.match(register, /grid grid-cols-1 sm:grid-cols-2 gap-3/)
  assert.match(register, /className=\{`min-w-0 flex flex-col items-start gap-1 p-3/)
  assert.match(register, /break-all/)
})

test('input subdomain membagi ruang dengan suffix tanpa terpotong', () => {
  assert.match(register, /className="min-w-0 flex items-center/)
  assert.match(register, /className="min-w-0 flex-1 px-3 py-2/)
  assert.match(register, /whitespace-nowrap/)
})

test('CTA Lihat Demo memiliki anchor yang digulir dan difokuskan setelah navigasi', () => {
  assert.match(landing, /to="\/login#demo"/)
  assert.match(login, /id="demo"/)
  assert.match(login, /window\.location\.hash !== '#demo'/)
  assert.match(login, /scrollIntoView/)
  assert.match(login, /focus\(\{ preventScroll: true \}\)/)
})

test('manifest PWA yang dinonaktifkan tidak menghasilkan request browser 404', () => {
  assert.doesNotMatch(index, /<link rel="manifest"/)
  assert.match(main, /document\.createElement\('link'\)/)
  assert.match(main, /linkEl\.rel = 'manifest'/)
  assert.match(main, /document\.head\.appendChild\(linkEl\)/)
  assert.doesNotMatch(server, /if \(s\.pwa_enabled === 0\) return res\.status\(404\)\.json\(\{ error: 'PWA dinonaktifkan' \}\)/)
  assert.match(server, /if \(s\.pwa_enabled === 0\) return res\.status\(204\)\.end\(\)/)
  assert.match(main, /response\.status === 204/)
})

test('kontrol login memiliki label programatik dan nama tombol ikon', () => {
  assert.match(login, /<label htmlFor="login-identifier"/)
  assert.match(login, /id="login-identifier"/)
  assert.match(login, /<label htmlFor="login-password"/)
  assert.match(login, /id="login-password"/)
  assert.match(login, /aria-label=\{showPassword \? 'Sembunyikan password' : 'Tampilkan password'\}/)
  assert.match(login, /aria-label=\{dark \? 'Aktifkan mode terang' : 'Aktifkan mode gelap'\}/)
})
