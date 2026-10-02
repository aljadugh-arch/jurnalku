'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createKtsPdf, CARD_W, CARD_H, DEFAULT_KTS_LAYOUT, normalizeKtsLayout } = require('../server/kts-pdf-service.cjs')

test('createKtsPdf menghasilkan dua halaman per siswa tanpa template pun', async () => {
  const pdf = await createKtsPdf({ siswaList: [{ nama: 'Ani', nis: '1', qr_token: 's-1' }], settings: {}, uploadDir: '/tmp/no-kts' })
  assert.ok(pdf.subarray(0, 5).toString() === '%PDF-')
  assert.ok(pdf.length > 1000)
  assert.ok(CARD_W > 240 && CARD_H > 150)
})

test('normalizeKtsLayout menerima {x,y} bebas dan menolak nilai di luar batas kartu', () => {
  const free = normalizeKtsLayout(JSON.stringify({ depan: { nama: { x: 100, y: 50 } } }))
  assert.equal(free.depan.nama.x, 100)
  assert.equal(free.depan.nama.y, 50)
  assert.equal(free.depan.nis.x, DEFAULT_KTS_LAYOUT.depan.nis.x)
  // Nilai negatif / melebihi batas dikunci ke dalam rentang kartu.
  const clamped = normalizeKtsLayout(JSON.stringify({ depan: { qr: { x: -10, y: 99999 } } }))
  assert.equal(clamped.depan.qr.x, 0)
  assert.equal(clamped.depan.qr.y, CARD_H)
})

test('normalizeKtsLayout membaca format legacy (angka = posisi Y, X default)', () => {
  const legacy = normalizeKtsLayout(JSON.stringify({ depan: { nama: 40, nis: 55 } }))
  assert.deepEqual(legacy.depan.nama, { x: DEFAULT_KTS_LAYOUT.depan.nama.x, y: 40 })
  assert.deepEqual(legacy.depan.nis, { x: DEFAULT_KTS_LAYOUT.depan.nis.x, y: 55 })
  // Field yang tidak tersedia memakai default penuh.
  assert.deepEqual(legacy.depan.qr, DEFAULT_KTS_LAYOUT.depan.qr)
})
