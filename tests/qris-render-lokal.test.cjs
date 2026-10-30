// QRIS dirender LOKAL dari payload (qris_code), bukan lewat layanan gambar
// pihak ketiga (api.qrserver.com). Dua alasan:
//   1. Ketergantungan eksternal hilang — QR tetap tampil walau layanan itu mati.
//   2. Payload pembayaran (nominal merchant) tidak ikut terkirim ke pihak ketiga.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

test('lib render QR tersedia sebagai dependensi', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.ok(pkg.dependencies['qrcode.react'], 'qrcode.react harus terdaftar')
})

test('modal QRIS merender QRCodeSVG dari qris_code (fallback ke qris_url)', () => {
  const src = read('src/components/QrisPayModal.tsx')
  assert.match(src, /import \{ QRCodeSVG \} from 'qrcode\.react'/, 'impor QRCodeSVG')
  assert.match(src, /qris_code\?: string/, 'field qris_code ikut di intent')
  assert.match(src, /<QRCodeSVG value=\{intent\.qris_code\}/, 'render dari payload lokal')
  assert.match(src, /intent\.qris_url\s*\n?\s*\? <img/, 'fallback ke gambar gateway bila payload tak ada')
})

test('layar pembayaran registrasi juga merender QR lokal', () => {
  const src = read('src/pages/auth/RegisterPage.tsx')
  assert.match(src, /import \{ QRCodeSVG \} from 'qrcode\.react'/)
  assert.match(src, /<QRCodeSVG value=\{pembayaran\.qris_code\}/, 'render dari payload lokal')
})

test('payload QR (qris_code) memang dikirim server ke klien', () => {
  const core = read('server/payment-gateway.cjs')
  const blok = core.slice(core.indexOf('function intentRingkas'))
  assert.match(blok, /qris_code: row\.qris_code/, 'intentRingkas menyertakan qris_code')
})
