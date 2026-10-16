// Pemasangan fitur Payment Gateway QRIS — uji baca-sumber.
//
// Menjaga agar kabel (route terdaftar, menu tampil, bypass webhook aktif, poller hidup)
// tidak lepas diam-diam saat refactor. Ini uji struktur, bukan eksekusi — pola yang sama
// dengan sidebar-groups-signature.test.cjs.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const index = fs.readFileSync('server/index.cjs', 'utf8')
const routes = fs.readFileSync('server/payment-gateway-routes.cjs', 'utf8')
const core = fs.readFileSync('server/payment-gateway.cjs', 'utf8')
const menu = fs.readFileSync('src/lib/menuItems.tsx', 'utf8')
const app = fs.readFileSync('src/App.tsx', 'utf8')
const modal = fs.readFileSync('src/components/QrisPayModal.tsx', 'utf8')

test('modul inti + route + poller di-require dan dipasang di index.cjs', () => {
  assert.match(index, /require\('\.\/payment-gateway-routes\.cjs'\)/)
  assert.match(index, /require\('\.\/payment-poller\.cjs'\)/)
  assert.match(index, /setupPaymentGateway\(db\)/)
  assert.match(index, /registerPaymentGatewayRoutes\(app, db, \{ requireRole, hostPermintaan \}\)/)
  assert.match(index, /startPaymentPoller\(db\)/)
})

test('webhook pembayaran lolos gate langganan (uang tidak boleh hilang saat paket mati)', () => {
  assert.match(index, /req\.path\.startsWith\('\/api\/payment\/webhook\/'\)/)
})

test('poller tidak menyala saat pengujian', () => {
  assert.match(index, /NODE_ENV !== 'test'/)
})

test('menu Payment Gateway QRIS tampil untuk admin dan bendahara', () => {
  const adminKeuangan = /label: 'Keuangan'[\s\S]*?label: 'Payment Gateway QRIS', path: '\/admin\/payment-gateway'/.test(menu)
  const bendahara = /bendaharaMenuItems[\s\S]*?label: 'Payment Gateway QRIS', path: '\/admin\/payment-gateway'/.test(menu)
  assert.ok(adminKeuangan, 'admin harus punya menu Payment Gateway QRIS')
  assert.ok(bendahara, 'bendahara harus punya menu Payment Gateway QRIS')
})

test('route halaman /admin/payment-gateway terdaftar di App.tsx', () => {
  assert.match(app, /path="payment-gateway" element=\{<PaymentGatewayPage \/>\}/)
})

test('route API publik webhook ber-HMAC dan jalur portal terdaftar', () => {
  assert.match(routes, /app\.post\('\/api\/payment\/webhook\/fazapay\/:token'/)
  assert.match(routes, /app\.post\('\/api\/portal\/payment-intent'/)
  assert.match(routes, /app\.get\('\/api\/portal\/payment-gateway'/)
  // Verifikasi HMAC atas byte mentah, bukan JSON hasil serialisasi ulang.
  assert.match(routes, /req\.rawBody/)
  assert.match(core, /timingSafeEqual/)
})

test('API key disimpan terenkripsi, tidak pernah dikirim balik ke klien', () => {
  assert.match(core, /encryptSecret/)
  assert.match(core, /api_key_hint/)
  // konfigurasiPublik tidak menyertakan api_key_encrypted / nilai penuh.
  const pub = core.slice(core.indexOf('function konfigurasiPublik'), core.indexOf('function simpanKonfigurasi'))
  assert.doesNotMatch(pub, /api_key_encrypted:/)
})

test('modal QRIS menyediakan jalur staf dan jalur portal', () => {
  assert.match(modal, /JALUR_STAF/)
  assert.match(modal, /JALUR_PORTAL/)
  assert.match(modal, /payment-gateway\/intents/)
  assert.match(modal, /portal\/payment-intent/)
})

test('inti gateway menolak jebakan endpoint mati (body "Invalid/Expired token")', () => {
  assert.match(core, /bacaJawabanGateway/)
  assert.match(core, /success !== true/)
})

test('anti-tabrakan nominal lewat kode unik + indeks parsial', () => {
  assert.match(core, /kodeUnikBaru/)
  assert.match(core, /idx_payment_intents_pending_amount/)
  assert.match(core, /pay_amount/)
})