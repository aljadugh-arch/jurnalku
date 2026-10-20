'use strict'
// Kontrak: login wali otomatis dari nomor WA.
//
// Wali tidak perlu didaftarkan admin. Begitu nomor WA wali diisi pada data
// siswa, wali bisa langsung masuk memakai nomor itu + 6 digit terakhir nomor
// sebagai sandi awal. Akun wali_murid dibuat saat login pertama dan ditautkan
// ke SEMUA anak dengan nomor yang sama (kakak-adik).
//
// Kontrak ini menjaga tiga hal yang mudah rusak tanpa disadari:
//   1. normalisasi nomor (0../62../+62..) tetap menerima semua format
//   2. akun dibuat otomatis hanya bila sandi cocok pola 6 digit terakhir
//   3. akun ditautkan ke seluruh anak, bukan hanya yang pertama
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(AKAR, 'server/index.cjs'), 'utf8')

// Ambil blok login saja supaya assertion tidak tertangkap kode lain.
function blokLogin() {
  const mulai = server.indexOf("app.post('/api/auth/login'")
  const akhir = server.indexOf("app.get('/api/auth/me'", mulai)
  assert.ok(mulai > 0 && akhir > mulai, 'blok login harus ditemukan')
  return server.slice(mulai, akhir)
}

test('login menerima nomor WA dalam berbagai format', () => {
  const blok = blokLogin()
  // Normalisasi: hanya digit, lalu variasikan 62/0/8.
  assert.ok(blok.includes("replace(/\\D/g, '')"), 'nomor harus dinormalisasi jadi digit saja')
  assert.ok(blok.includes("hanyaDigit.startsWith('62')"), 'format 62.. harus diterima')
  assert.ok(blok.includes("hanyaDigit.startsWith('0')"), 'format 0.. harus diterima')
  assert.ok(blok.includes("hanyaDigit.startsWith('8')"), 'format 8.. harus diterima')
})

test('akun wali dibuat otomatis saat login pertama', () => {
  const blok = blokLogin()
  assert.ok(blok.includes("role='wali_murid'"), 'harus mencari akun wali_murid')
  assert.ok(/if \(!wali && sandiDefault && String\(password\) === sandiDefault\)/.test(blok),
    'akun dibuat hanya bila belum ada DAN sandi cocok pola default')
  assert.ok(blok.includes("INSERT INTO users"), 'harus membuat baris users baru')
  assert.ok(blok.includes("'wali_murid'"), 'role akun baru harus wali_murid')
})

test('sandi awal = 6 digit terakhir nomor', () => {
  const blok = blokLogin()
  assert.ok(blok.includes('digit.slice(-6)'), 'sandi default harus 6 digit terakhir nomor')
})

test('akun ditautkan ke SEMUA anak dengan nomor sama', () => {
  const blok = blokLogin()
  assert.ok(blok.includes('for (const a of anakAnak)'), 'harus mengulang seluruh anak')
  assert.ok(blok.includes('INSERT OR IGNORE INTO user_students'), 'tautan harus idempoten')
})

test('nomor yang tidak terdaftar tidak bisa membuat akun', () => {
  const blok = blokLogin()
  // Pembuatan akun hanya di dalam cabang `if (anakAnak.length)`.
  const iAnak = blok.indexOf('if (anakAnak.length)')
  const iInsert = blok.indexOf("INSERT INTO users")
  assert.ok(iAnak > 0 && iInsert > iAnak, 'pembuatan akun harus berada di dalam cabang nomor terdaftar')
})

test('dashboard wali memilih anak pertama sebagai default', () => {
  const i = server.indexOf("app.get('/api/siswa/dashboard'")
  const blok = server.slice(i, i + 4000)
  assert.ok(/role === 'wali_murid' && linked.length >= 1\) selected = linked\[0\]/.test(blok),
    'wali dengan lebih dari satu anak harus tetap mendapat data default')
})
