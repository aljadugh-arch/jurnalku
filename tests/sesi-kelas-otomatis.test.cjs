'use strict'
// Sesi kelas yang tidak pernah diakhiri harus ditutup otomatis, dan QR yang
// kedaluwarsa tidak boleh membuat worker menyambung ulang tanpa henti.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('server menutup sesi kelas tertinggal saat start dan berkala', () => {
  const s = baca('server/index.cjs')
  assert.ok(/function tutupSesiKelasBasi\(\)/.test(s), 'harus ada fungsi penutup sesi lama')
  assert.ok(/WHERE status='aktif' AND tanggal < \?/.test(s), 'hanya sesi sebelum hari ini')
  assert.ok(/waktu_selesai=COALESCE\(waktu_selesai,\(SELECT j\.jam_selesai/.test(s),
    'waktu selesai diambil dari jam pelajaran, bukan waktu sekarang')
  assert.ok(/tutupSesiKelasBasi\(\)\nsetInterval\(tutupSesiKelasBasi/.test(s),
    'dijalankan saat start lalu berkala')
})

test('worker berhenti mencoba saat QR kedaluwarsa', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/qrKedaluwarsa=/.test(s), 'harus mengenali alasan QR kedaluwarsa')
  assert.ok(/QR refs attempts ended\|QR ref timed out/.test(s), 'pola alasan dari Baileys')
  assert.ok(/qrKedaluwarsa\|\|stopping\.delete/.test(s), 'ikut jalur berhenti, bukan reconnect')
  assert.ok(/retryAfter\.delete\(tenantId\)/.test(s), 'backoff dibersihkan saat berhenti')
})
