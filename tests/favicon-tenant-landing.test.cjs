'use strict'
// Kontrak dua perbaikan:
//
//  1. FAVICON PER TENANT. Bug aslinya bukan "logo belum diunggah" — route
//     dinamisnya ADA, tapi didaftarkan SETELAH express.static, sehingga
//     dist/favicon.ico menang dan semua domain menyajikan ikon yang sama
//     (terbukti md5 identik di 9 domain). Urutan pendaftaran adalah intinya,
//     jadi urutan itulah yang dikunci di sini.
//
//     Bug kedua: rute ikon berjalan tanpa authMiddleware, jadi req.tenantId
//     kosong dan getTenantSettings selalu jatuh ke logo default. Resolusi
//     tenant dari host harus terjadi DI DALAM sendTenantIcon.
//
//  2. LANDING: kata "tanpa kartu kredit" diganti "coba gratis sekarang juga".
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const server = baca('server/index.cjs')

test('route ikon didaftarkan SEBELUM express.static', () => {
  const iStatic = server.indexOf("express.static(path.join(__dirname, '..', 'dist')")
  assert.ok(iStatic > 0, 'express.static dist harus ada')
  const iIkon = server.indexOf("app.get('/favicon.ico'")
  assert.ok(iIkon > 0, 'route ikon per-tenant harus ada')
  assert.ok(iIkon < iStatic,
    'route ikon HARUS didaftarkan sebelum express.static — kalau tidak, dist/favicon.ico menang dan semua domain memakai ikon sama')
})

test('route favicon hanya didaftarkan sekali (tidak ada duplikat)', () => {
  const jumlah = (server.match(/app\.get\('\/favicon\.ico'/g) || []).length
  assert.strictEqual(jumlah, 1, 'route favicon harus tepat satu; duplikat setelah static membuat yang pertama tidak berarti')
})

test('sendTenantIcon memetakan tenant dari host (rute ikon tanpa auth)', () => {
  const i = server.indexOf('async function sendTenantIcon')
  assert.ok(i > 0)
  const badan = server.slice(i, i + 1200)
  assert.ok(/tenantDariHost\(hostPermintaan\(req\)\)/.test(badan),
    'tanpa resolusi host, req.tenantId kosong dan semua domain dapat logo default')
  assert.ok(/pwa_icon/.test(badan) && /logo/.test(badan),
    'ikon harus diambil dari pwa_icon lalu logo tenant')
})

test('landing tidak lagi menyebut "tanpa kartu kredit"', () => {
  const landing = baca('src/pages/LandingPage.tsx')
  assert.ok(!/kartu kredit/i.test(landing),
    'frasa "tanpa kartu kredit" harus sudah diganti di seluruh landing page')
})

test('landing memakai "coba gratis sekarang juga"', () => {
  const landing = baca('src/pages/LandingPage.tsx')
  assert.ok(/coba gratis sekarang juga/i.test(landing),
    'pengganti frasa harus muncul di landing page')
})
