const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const sharp = require('sharp')
const { setupPortalCashless, normalizeBankTransferConfig, normalizeStaticQrisConfig, validateStaticQrisSubmission, assertStaticQrisSubmissionAvailable } = require('../server/portal-cashless.cjs')

let png

test.before(async () => {
  const buffer = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
  png = `data:image/png;base64,${buffer.toString('base64')}`
})

test('static QRIS config keeps only ShopeePay and GoPay merchant images', async () => {
  const value = await normalizeStaticQrisConfig({ enabled: true, shopee_qris: png, gopay_qris: png })
  assert.equal(value.enabled, true)
  assert.match(value.shopee_qris, /^data:image\/webp;base64,/)
  assert.match(value.gopay_qris, /^data:image\/webp;base64,/)
  assert.deepEqual(value.providers, ['shopee', 'gopay'])
})

test('static QRIS config rejects non-image, malformed, and oversized payloads', async () => {
  await assert.rejects(() => normalizeStaticQrisConfig({ enabled: true, shopee_qris: 'https://example.test/x.png' }), /gambar QRIS/i)
  await assert.rejects(() => normalizeStaticQrisConfig({ enabled: true, shopee_qris: 'data:image/webp;base64,UklGRg==' }), /valid|diproses/i)
  await assert.rejects(() => normalizeStaticQrisConfig({ enabled: true, shopee_qris: 'data:image/png;base64,' + 'A'.repeat(7_100_000) }), /maksimal/i)
})

test('bank transfer config normalizes safe values and compresses QRIS images', async () => {
  const value = await normalizeBankTransferConfig({
    va_prefix: ' jurnal01 ', bank_code: '002', admin_fee: '1500', manual_verify: false,
    shopee_qris: png, gopay_qris: png
  })
  assert.equal(value.va_prefix, 'JURNAL01')
  assert.equal(value.bank_code, '002')
  assert.equal(value.admin_fee, 1500)
  assert.equal(value.manual_verify, false)
  assert.match(value.shopee_qris, /^data:image\/webp;base64,/)
  assert.match(value.gopay_qris, /^data:image\/webp;base64,/)
})

test('bank transfer config rejects invalid prefix, bank code, and admin fee', async () => {
  await assert.rejects(() => normalizeBankTransferConfig({ va_prefix: 'VA<script>' }), /prefix va/i)
  await assert.rejects(() => normalizeBankTransferConfig({ bank_code: '2' }), /kode bank/i)
  await assert.rejects(() => normalizeBankTransferConfig({ bank_code: 'ABC' }), /kode bank/i)
  await assert.rejects(() => normalizeBankTransferConfig({ admin_fee: -1 }), /biaya admin/i)
  await assert.rejects(() => normalizeBankTransferConfig({ admin_fee: 1.5 }), /biaya admin/i)
  await assert.rejects(() => normalizeBankTransferConfig({ admin_fee: 1_000_001 }), /biaya admin/i)
})

test('transfer declaration requires a 3 digit unique code matching the transferred amount', async () => {
  const value = await validateStaticQrisSubmission({ provider: 'shopee', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: 'Budi', no_rek_dari: '08123456789', bukti_transfer: png })
  assert.equal(value.provider, 'shopee')
  assert.equal(value.amount, 50000)
  assert.equal(value.unique_code, '123')
  assert.equal(value.transfer_amount, 50123)
  assert.equal(value.atas_nama, 'Budi')
  assert.match(value.bank_dari, /ShopeePay/)
  assert.match(value.bukti_transfer, /^data:image\/webp;base64,/)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'shopee', amount: 50000, unique_code: '12', transfer_amount: 50012, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png }), /3 digit/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'shopee', amount: 50000, unique_code: '123', transfer_amount: 50124, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png }), /tidak sesuai/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'lain', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png }), /metode/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'gopay', amount: 0, unique_code: '123', transfer_amount: 123, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png }), /nominal/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'gopay', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: '', no_rek_dari: '1', bukti_transfer: png }), /pengirim/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'gopay', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: 'Budi', no_rek_dari: '1' }), /bukti/i)
})

test('submission requires an enabled configured tenant provider and rejects pending transfer collisions', async () => {
  const db = new Database(':memory:')
  setupPortalCashless(db)
  const declaration = await validateStaticQrisSubmission({ provider: 'shopee', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png })

  assert.throws(() => assertStaticQrisSubmissionAvailable(db, 'tenant-a', declaration), /belum diaktifkan/i)
  db.prepare('INSERT INTO cashless_provider_config(tenant_id,provider,enabled,config_json) VALUES(?,?,?,?)').run('tenant-a', 'bank_transfer', 1, JSON.stringify({ gopay_qris: png }))
  assert.throws(() => assertStaticQrisSubmissionAvailable(db, 'tenant-a', declaration), /belum dikonfigurasi/i)
  db.prepare('UPDATE cashless_provider_config SET config_json=? WHERE tenant_id=? AND provider=?').run(JSON.stringify({ shopee_qris: png }), 'tenant-a', 'bank_transfer')
  assert.doesNotThrow(() => assertStaticQrisSubmissionAvailable(db, 'tenant-a', declaration))

  db.prepare('INSERT INTO cashless_topup_manual(id,tenant_id,student_id,amount,status,provider,unique_code,transfer_amount) VALUES(?,?,?,?,?,?,?,?)')
    .run('existing', 'tenant-a', 'student-a', 50000, 'pending', 'shopee', '123', 50123)
  assert.throws(() => assertStaticQrisSubmissionAvailable(db, 'tenant-a', declaration), /sudah digunakan/i)
  db.close()
})
