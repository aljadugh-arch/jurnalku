'use strict'
// Kontrak: alur verifikasi Search Console harus bisa dijalankan TANPA pemilik
// menyentuh berkas — cukup klik "Allow" sekali di browser.
//
// Yang dikunci di sini adalah tiga hal yang mudah rusak tanpa terlihat:
//   1. Rute /api/search-console/hubungkan meminta scope webmasters +
//      siteverification. Tanpa scope itu, token tersimpan tetapi tidak bisa
//      memverifikasi apa pun, dan errornya muncul jauh di belakang.
//   2. Callback menangani state 'SEARCHCONSOLE' SEBELUM jwt.verify — kalau
//      urutannya terbalik, callback melempar error JWT dan token tidak pernah
//      tersimpan.
//   3. Skrip memakai token yang DITERBITKAN Google (siteVerification.getToken),
//      bukan nama berkas karangan. Berkas karangan selalu gagal verifikasi.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('rute hubungkan meminta scope Search Console + Site Verification', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.get('/api/search-console/hubungkan'")
  assert.ok(i > 0, 'rute /api/search-console/hubungkan harus ada')
  const badan = s.slice(i, i + 1200)
  assert.ok(badan.includes('webmasters'), 'harus meminta scope webmasters')
  assert.ok(badan.includes('siteverification'), 'harus meminta scope siteverification')
  assert.ok(badan.includes('offline'), 'harus access_type=offline agar dapat refresh_token')
  assert.ok(badan.includes('SEARCHCONSOLE'), 'state harus SEARCHCONSOLE')
})

test('callback menangani SEARCHCONSOLE sebelum jwt.verify', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.get('/api/ai-config/google/callback'")
  const badan = s.slice(i, i + 4000)
  const posState = badan.indexOf("=== 'SEARCHCONSOLE'")
  // Cari PEMANGGILAN jwt.verify, bukan kata di komentar. Komentar di file ini
  // menyebut "SEBELUM jwt.verify" sehingga indexOf mentah salah sasaran —
  // itu yang bikin tes ini sempat gagal padahal kodenya benar.
  const posJwt = badan.indexOf('jwt.verify(String(state)')
  assert.ok(posState > 0, 'cabang SEARCHCONSOLE harus ada di callback')
  assert.ok(posJwt > 0, 'jwt.verify harus tetap ada untuk alur AI')
  assert.ok(posState < posJwt, 'cabang SEARCHCONSOLE harus SEBELUM jwt.verify, kalau tidak callback melempar error JWT')
})

test('callback menyimpan refresh token terenkripsi, bukan plaintext', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("=== 'SEARCHCONSOLE'")
  const badan = s.slice(i, i + 1800)
  assert.ok(badan.includes('encryptSecret'), 'refresh token harus dienkripsi')
  assert.ok(/CREATE TABLE IF NOT EXISTS search_console_token/.test(badan), 'tabel token harus dibuat idempoten')
})

test('skrip memakai token terbitan Google, bukan nama berkas karangan', () => {
  const s = baca('scripts/search-console.cjs')
  assert.ok(s.includes('siteVerification/v1/token'), 'harus memanggil siteVerification.getToken')
  assert.ok(s.includes('verificationMethod: \'FILE\''), 'harus memakai metode FILE')
  assert.ok(/google-site-verification: \$\{namaBerkas\}/.test(s), 'isi berkas harus format resmi Google')
  // Harus menulis ke public/, karena deploy mengirim public/
  assert.ok(/public/.test(s), 'berkas harus ditulis ke public/')
})

test('skrip tidak pernah mengarang token', () => {
  const s = baca('scripts/search-console.cjs')
  // Token harus berasal dari respons API (r.isi.token), bukan string literal
  assert.ok(/const t = r\.isi\.token/.test(s), 'token harus dibaca dari respons API')
  assert.ok(!/google[a-f0-9]{16}/i.test(s), 'tidak boleh ada token hardcoded di skrip')
})
