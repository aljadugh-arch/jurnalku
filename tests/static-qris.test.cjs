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

// KONTRAK BARU: QRIS statis milik LEMBAGA (bank/e-wallet apa pun), bukan dua
// akun merchant ShopeePay/GoPay seperti sebelumnya. `id` dipakai siswa saat
// memilih, `label` ditampilkan sebagai nama QRIS.
test('static QRIS config menyimpan daftar QRIS milik lembaga', async () => {
  const value = await normalizeStaticQrisConfig({
    enabled: true,
    qris_list: [
      { id: 'q1', label: 'BRI', jenis: 'bank', gambar: png },
      { id: 'q2', label: 'Dana', jenis: 'ewallet', gambar: png },
    ],
  })
  assert.equal(value.enabled, true)
  assert.equal(value.qris_list.length, 2)
  assert.equal(value.qris_list[0].label, 'BRI')
  assert.equal(value.qris_list[0].jenis, 'bank')
  assert.match(value.qris_list[0].gambar, /^data:image\/webp;base64,/)
  assert.deepEqual(value.providers, ['q1', 'q2'])
})

test('QRIS lembaga wajib punya nama agar bisa dipilih siswa', async () => {
  await assert.rejects(
    () => normalizeStaticQrisConfig({ enabled: true, qris_list: [{ gambar: png }] }),
    /wajib diisi/i,
  )
})

test('data lama ShopeePay/GoPay tetap terbaca sebagai daftar', async () => {
  // Kompatibilitas: lembaga yang sudah pernah mengunggah QRIS merchant lama
  // tidak boleh kehilangan gambarnya setelah perubahan model.
  const value = await normalizeStaticQrisConfig({ enabled: true, shopee_qris: png, gopay_qris: png })
  assert.equal(value.qris_list.length, 2)
  assert.equal(value.qris_list[0].label, 'ShopeePay')
  assert.equal(value.qris_list[1].label, 'GoPay')
})

test('static QRIS config menolak non-image, rusak, dan terlalu besar', async () => {
  await assert.rejects(
    () => normalizeStaticQrisConfig({ enabled: true, qris_list: [{ label: 'X', gambar: 'https://example.test/x.png' }] }),
    /gambar QRIS/i,
  )
  await assert.rejects(
    () => normalizeStaticQrisConfig({ enabled: true, qris_list: [{ label: 'X', gambar: 'data:image/webp;base64,UklGRg==' }] }),
    /valid|diproses/i,
  )
  await assert.rejects(
    () => normalizeStaticQrisConfig({ enabled: true, qris_list: [{ label: 'X', gambar: 'data:image/png;base64,' + 'A'.repeat(7_100_000) }] }),
    /maksimal/i,
  )
})

test('bank transfer config menormalkan nilai aman dan mengompres QRIS', async () => {
  const value = await normalizeBankTransferConfig({
    enabled: true,
    va_prefix: 'jurnal',
    bank_code: '002',
    admin_fee: 2500,
    manual_verify: true,
    qris_list: [{ id: 'q1', label: 'BSI', jenis: 'bank', gambar: png }],
  })
  assert.equal(value.va_prefix, 'JURNAL')
  assert.equal(value.bank_code, '002')
  assert.equal(value.admin_fee, 2500)
  assert.equal(value.manual_verify, true)
  assert.equal(value.qris_list.length, 1)
  assert.match(value.qris_list[0].gambar, /^data:image\/webp;base64,/)
  // Field merchant lama tidak boleh ditulis lagi.
  assert.equal(value.shopee_qris, undefined)
  assert.equal(value.gopay_qris, undefined)
})

test('bank transfer config menolak prefix, kode bank, dan biaya admin tidak sah', async () => {
  await assert.rejects(
    () => normalizeBankTransferConfig({ qris_list: [{ label: 'X', gambar: png }], va_prefix: 'ab-cd' }),
    /prefix VA/i,
  )
  await assert.rejects(
    () => normalizeBankTransferConfig({ qris_list: [{ label: 'X', gambar: png }], bank_code: '02' }),
    /3 digit/i,
  )
  await assert.rejects(
    () => normalizeBankTransferConfig({ qris_list: [{ label: 'X', gambar: png }], admin_fee: -1 }),
    /biaya admin/i,
  )
})

test('deklarasi transfer wajib kode unik 3 digit sesuai nominal', async () => {
  const value = await validateStaticQrisSubmission({ provider: 'q1', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: 'Budi', no_rek_dari: '08123456789', bukti_transfer: png })
  assert.equal(value.provider, 'q1')
  assert.equal(value.bank_dari, '', 'label QRIS diisi saat verifikasi ketersediaan, bukan di sini')

  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'q1', amount: 50000, unique_code: '12', transfer_amount: 50012, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png }), /3 digit/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'q1', amount: 50000, unique_code: '123', transfer_amount: 50124, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png }), /tidak sesuai/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'q1', amount: 0, unique_code: '123', transfer_amount: 123, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png }), /nominal/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'q1', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: '', no_rek_dari: '1', bukti_transfer: png }), /pengirim/i)
  await assert.rejects(() => validateStaticQrisSubmission({ provider: 'q1', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: 'Budi', no_rek_dari: '1' }), /bukti/i)
})

test('submission wajib QRIS aktif dan menolak bentrok kode unik', async () => {
  const db = new Database(':memory:')
  setupPortalCashless(db)
  const declaration = await validateStaticQrisSubmission({ provider: 'q1', amount: 50000, unique_code: '123', transfer_amount: 50123, atas_nama: 'Budi', no_rek_dari: '1', bukti_transfer: png })

  // Belum diaktifkan
  assert.throws(() => assertStaticQrisSubmissionAvailable(db, 'tenant-a', declaration), /belum diaktifkan/i)

  // Aktif tapi QRIS yang dipilih tidak ada
  db.prepare('INSERT INTO cashless_provider_config(tenant_id,provider,enabled,config_json) VALUES(?,?,?,?)')
    .run('tenant-a', 'bank_transfer', 1, JSON.stringify({ qris_list: [{ id: 'lain', label: 'Lain', jenis: 'bank', gambar: png }] }))
  assert.throws(() => assertStaticQrisSubmissionAvailable(db, 'tenant-a', declaration), /tidak tersedia/i)

  // QRIS tersedia -> lolos, dan label diisi dari daftar
  db.prepare('UPDATE cashless_provider_config SET config_json=? WHERE tenant_id=? AND provider=?')
    .run(JSON.stringify({ qris_list: [{ id: 'q1', label: 'BRI', jenis: 'bank', gambar: png }] }), 'tenant-a', 'bank_transfer')
  assert.doesNotThrow(() => assertStaticQrisSubmissionAvailable(db, 'tenant-a', declaration))
  assert.equal(declaration.bank_dari, 'BRI', 'bank_dari harus memakai label QRIS lembaga')

  // Bentrok kode unik pada transaksi pending
  db.prepare('INSERT INTO cashless_topup_manual(id,tenant_id,student_id,amount,status,provider,unique_code,transfer_amount) VALUES(?,?,?,?,?,?,?,?)')
    .run('existing', 'tenant-a', 'student-a', 50000, 'pending', 'q1', '123', 50123)
  assert.throws(() => assertStaticQrisSubmissionAvailable(db, 'tenant-a', declaration), /sudah digunakan/i)
  db.close()
})
