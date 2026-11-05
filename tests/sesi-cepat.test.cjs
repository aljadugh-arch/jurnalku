'use strict'
// Layar "Memuat sesi..." tidak boleh menggantung di perangkat/koneksi lambat.
// Yang dijaga:
//  1. Profil terakhir di-cache -> aplikasi langsung dirender, validasi di latar.
//  2. /auth/me punya batas waktu 12 detik, bukan 90 detik bawaan.
//  3. Gagal sementara: pakai cache + backoff 3s..30s, berhenti setelah 6 kali.
//  4. 401 tetap mengeluarkan sesi dan membersihkan cache.
//  5. Tanpa cache: satu percobaan cepat, lalu lepas ke halaman login (tidak
//     menggantung selamanya).
//  6. Ada banner "Coba lagi" saat sesi belum terverifikasi.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const store = fs.readFileSync(path.join(root, 'src/stores/authStore.ts'), 'utf8')
const layout = fs.readFileSync(path.join(root, 'src/components/layout/DashboardLayout.tsx'), 'utf8')

test('profil terakhir dipakai agar layar tidak tertahan', () => {
  assert.match(store, /const USER_CACHE = 'jurnalku_user'/)
  assert.match(store, /function bacaCacheUser\(\)/)
  assert.match(store, /authReady: !storedToken\(\) \|\| !!bacaCacheUser\(\)/,
    'dengan token + cache, authReady langsung true')
  assert.match(store, /user: storedToken\(\) \? bacaCacheUser\(\) : null/)
})

test('/auth/me dibatasi 12 detik, bukan 90 detik', () => {
  assert.match(store, /api\.get\('\/auth\/me', \{ timeout: 12000 \}\)/)
})

test('gagal sementara memakai cache dan backoff terbatas', () => {
  assert.match(store, /const percobaan = get\(\)\.percobaanAuth \+ 1/)
  assert.match(store, /const tersimpan = get\(\)\.user \|\| bacaCacheUser\(\)/)
  assert.match(store, /if \(percobaan < 6\) jadwalkanCekUlang\(percobaan\)/,
    'berhenti setelah 6 percobaan agar tidak membebani server')
  assert.match(store, /Math\.min\(AUTH_RETRY_MAKS, AUTH_RETRY_MS \* Math\.pow\(2,/)
  assert.match(store, /const AUTH_RETRY_MAKS = 30000/)
})

test('tanpa cache: layar dilepas ke login setelah dua percobaan', () => {
  assert.match(store, /if \(percobaan >= 2\) \{[\s\S]*?isAuthenticated: false, authReady: true/s)
  assert.match(store, /Koneksi ke server terganggu\. Periksa jaringan lalu masuk kembali\./)
})

test('401 mengeluarkan sesi dan membersihkan cache', () => {
  const blok401 = store.slice(store.indexOf('if (status === 401)'), store.indexOf('const percobaan ='))
  assert.match(blok401, /localStorage\.removeItem\('jurnalku_token'\)/)
  assert.match(blok401, /simpanCacheUser\(null\)/)
})

test('kembali online memicu pemeriksaan ulang', () => {
  assert.match(store, /addEventListener\('online'/)
})

test('banner status sesi punya tombol coba lagi', () => {
  assert.match(layout, /authError &&/)
  assert.match(layout, /Coba lagi/)
})
