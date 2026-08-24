const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/admin/CashlessBankConfigPage.tsx'), 'utf8')

test('konfigurasi transfer bank tetap tersedia bersama QRIS merchant', () => {
  assert.match(source, /Konfigurasi Transfer Bank/)
  assert.match(source, /Aktifkan transfer bank sebagai metode top-up/)
  assert.match(source, /Prefix VA/)
  assert.match(source, /Kode Bank/)
  assert.match(source, /Biaya Admin per Transaksi/)
  assert.match(source, /Verifikasi manual oleh admin\/bendahara/)
  assert.match(source, /ShopeePay Merchant/)
  assert.match(source, /GoPay Merchant/)
})

test('form transfer bank memakai field konfigurasi backend yang sudah ada', () => {
  assert.match(source, /value=\{config\.va_prefix\}/)
  assert.match(source, /value=\{config\.bank_code\}/)
  assert.match(source, /value=\{config\.admin_fee\}/)
  assert.match(source, /checked=\{config\.manual_verify\}/)
  assert.match(source, /api\.put\('\/cashless\/provider\/bank_transfer', config\)/)
})
