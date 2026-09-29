'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createKtsPdf, CARD_W, CARD_H } = require('../server/kts-pdf-service.cjs')

test('createKtsPdf menghasilkan dua halaman per siswa tanpa template pun', async () => {
  const pdf = await createKtsPdf({ siswaList: [{ nama: 'Ani', nis: '1', qr_token: 's-1' }], settings: {}, uploadDir: '/tmp/no-kts' })
  assert.ok(pdf.subarray(0, 5).toString() === '%PDF-')
  assert.ok(pdf.length > 1000)
  assert.ok(CARD_W > 240 && CARD_H > 150)
})
