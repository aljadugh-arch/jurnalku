const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/admin/CashlessBankConfigPage.tsx'), 'utf8')

// KONTRAK BARU: konfigurasi transfer bank tetap ada, tetapi QRIS bukan lagi dua
// akun merchant ShopeePay/GoPay — sekarang daftar QRIS milik lembaga sendiri
// (bank atau e-wallet apa pun), berapa pun jumlahnya.
test('konfigurasi transfer bank tetap tersedia', () => {
  assert.match(source, /Transfer Bank/)
  assert.match(source, /Aktifkan transfer bank sebagai metode top-up/)
  assert.match(source, /Prefix VA/)
  assert.match(source, /Kode Bank/)
  assert.match(source, /Biaya Admin per Transaksi/)
  assert.match(source, /Verifikasi manual oleh admin\/bendahara/)
})

test('QRIS berupa daftar milik lembaga, bukan dua merchant', () => {
  assert.match(source, /qris_list/)
  assert.match(source, /Tambah QRIS/)
  assert.match(source, /Nama tampil/)
  // Nama merchant lama tidak boleh muncul lagi sebagai satu-satunya pilihan.
  assert.doesNotMatch(source, /ShopeePay Merchant/)
  assert.doesNotMatch(source, /GoPay Merchant/)
})

test('form transfer bank memakai field konfigurasi backend yang sudah ada', () => {
  assert.match(source, /value=\{config\.va_prefix\}/)
  assert.match(source, /value=\{config\.bank_code\}/)
  assert.match(source, /value=\{config\.admin_fee\}/)
  assert.match(source, /checked=\{config\.manual_verify\}/)
  assert.match(source, /api\.put\('\/cashless\/provider\/bank_transfer', config\)/)
})

test('input upload QRIS punya label yang bisa dibaca', () => {
  // Label harus berupa teks yang terlihat, bukan sekadar placeholder.
  assert.match(source, /Gambar QRIS/)
  assert.match(source, /accept="image\/png,image\/jpeg,image\/webp"/)
})

test('admin diberi tahu beda QRIS statis dan payment gateway otomatis', () => {
  // Tanpa penjelasan ini admin mengira halaman ini mengaktifkan QRIS dinamis.
  assert.match(source, /Payment Gateway/)
  assert.match(source, /fazapay/)
})
