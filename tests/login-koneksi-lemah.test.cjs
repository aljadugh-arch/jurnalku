'use strict'
// Kontrak: login tahan koneksi lemah.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

// ---------- TIMEOUT ----------

test('klien API punya timeout — axios default 0 berarti menunggu selamanya', () => {
  const api = baca('src/services/api.ts')
  assert.ok(/timeout:\s*90000/.test(api), 'harus ada timeout bawaan')
  assert.ok(!/timeout:\s*0/.test(api), 'timeout 0 = menggantung tanpa batas')
})

test('login memakai timeout pendek dan satu kali coba ulang', () => {
  const s = baca('src/stores/authStore.ts')
  // Pakai 'async' supaya yang ditemukan implementasinya, bukan definisi tipe di atas.
  const i = s.indexOf('loginWithCredentials: async')
  const j = s.indexOf('mintaOtp: async', i)
  const blok = s.slice(i, j > i ? j : i + 2400)
  assert.ok(/timeout:\s*20000/.test(blok), 'login timeout 20 detik')
  // Coba ulang hanya untuk kegagalan jaringan.
  assert.ok(/bisaDiulang\(err\)/.test(blok), 'percobaan ulang harus lewat bisaDiulang')
  assert.ok(/setTimeout\(r,\s*1200\)/.test(blok), 'jeda sebelum percobaan ulang')
  // Tidak boleh mengulang saat perangkat offline.
  assert.ok(/navigator\.onLine === false/.test(blok), 'jangan ulang saat offline')
})

test('percobaan ulang tidak dilakukan saat server menolak (4xx)', () => {
  const api = baca('src/services/api.ts')
  const i = api.indexOf('export function bisaDiulang')
  const blok = api.slice(i, i + 400)
  assert.ok(/status < 500/.test(blok), '4xx = jawaban server, tidak diulang')
  assert.ok(/return false/.test(blok), 'harus menolak pengulangan')
})

// ---------- PESAN ----------

test('pesan galat membedakan jaringan dari penolakan server', () => {
  const api = baca('src/services/api.ts')
  const i = api.indexOf('export function pesanGagalJaringan')
  const blok = api.slice(i, i + 800)
  assert.ok(/navigator\.onLine === false/.test(blok), 'deteksi offline')
  assert.ok(/ECONNABORTED/.test(blok), 'deteksi timeout')
  assert.ok(/Koneksi terputus/.test(blok), 'pesan saat jaringan putus')
  assert.ok(/terlalu lambat/i.test(blok), 'pesan saat timeout')
})

test('halaman login memakai pesanGagalJaringan, bukan pesan menyesatkan', () => {
  const ui = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(/import api, \{ pesanGagalJaringan \}/.test(ui), 'harus diimpor')
  assert.ok(ui.includes('setError(pesanGagalJaringan(err))'), 'dipakai pada handleLogin')
  // Sebelumnya jaringan putus diberi tahu "Periksa email dan password" — padahal
  // sandi benar. Pastikan pesan itu tidak lagi menjadi cadangan for handleLogin.
  const i = ui.indexOf('const handleLogin')
  const blok = ui.slice(i, i + 700)
  assert.ok(!/Periksa email dan password/.test(blok), 'jangan salahkan sandi saat jaringan putus')
  // OTP juga: jangan bilang "Kode salah" saat tidak ada jawaban server.
  const j = ui.indexOf('const handleVerifikasiOtp')
  const blokOtp = ui.slice(j, j + 700)
  assert.ok(/pesanGagalJaringan\(err\)/.test(blokOtp), 'OTP memakai pesan jaringan juga')
})

// ---------- TIDAK MENAHAN RENDER ----------

test('loadSettings tidak ditunggu di jalur login', () => {
  const s = baca('src/stores/authStore.ts')
  // Jalur login: loginWithCredentials, loginDenganOtp, loginDemo.
  // (masukLembaga/kembaliKePlatform sengaja menunggu: superadmin berpindah
  // tenant dan branding lembaga baru harus siap sebelum dashboard dirender.)
  for (const nama of ['loginWithCredentials: async', 'loginDenganOtp: async', 'loginDemo: async']) {
    const i = s.indexOf(nama)
    assert.ok(i > 0, `${nama} harus ada`)
    const berikutnya = s.indexOf('  },', i)
    const blok = s.slice(i, berikutnya > i ? berikutnya : i + 1200)
    assert.ok(
      !/await useSettingsStore\.getState\(\)\.loadSettings\(\)/.test(blok),
      `${nama}: loadSettings tidak boleh di-await (menahan navigasi)`
    )
    assert.ok(
      /void useSettingsStore\.getState\(\)\.loadSettings\(\)\.catch/.test(blok),
      `${nama}: loadSettings dijalankan di belakang layar`
    )
  }
})

test('checkAuth punya timeout pendek agar tidak menahan halaman', () => {
  const s = baca('src/stores/authStore.ts')
  // Cari implementasinya, bukan definisi tipe di bagian atas berkas.
  const i = s.indexOf('checkAuth: async')
  assert.ok(i > 0, 'checkAuth async harus ada')
  const blok = s.slice(i, i + 900)
  assert.ok(/api\.get\('\/auth\/me', \{ timeout: 12000 \}\)/.test(blok), 'batas 12 detik')
})

test('permintaan opsional di halaman login dibatasi waktunya', () => {
  const ui = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(/api\.get\('\/ppdb\/publik\/info', \{ timeout: 8000 \}\)/.test(ui), 'PPDB 8 detik')
  assert.ok(/api\.get\('\/demo-status', \{ timeout: 8000 \}\)/.test(ui), 'demo-status 8 detik')
})

// ---------- PENANDA KONEKSI LAMBAT ----------

test('halaman login menampilkan penanda koneksi lambat', () => {
  const ui = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(/setLambat\(true\), 6000/.test(ui), 'muncul setelah 6 detik')
  assert.ok(/Koneksi lambat/.test(ui), 'teks penanda')
  assert.ok(/addEventListener\('online'/.test(ui), 'dengarkan jaringan kembali')
})
