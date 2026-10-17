'use strict'
// Kontrak: jadwal dengan rentang jam terbalik harus DITOLAK (400), bukan tersimpan.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SUMBER = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')

test('ada helper validasi rentang jam', () => {
  assert.match(SUMBER, /function galatRentangJam/, 'helper harus ada')
  assert.match(SUMBER, /POLA_JAM/, 'harus memvalidasi format HH:MM')
})

test('POST /api/jadwal memanggil validasi jam sebelum menyentuh DB', () => {
  const i = SUMBER.indexOf("app.post('/api/jadwal'")
  assert.ok(i > 0)
  const blok = SUMBER.slice(i, i + 1800)
  assert.match(blok, /galatRentangJam\(jam_mulai, jam_selesai\)/, 'harus memanggil helper')
  assert.match(blok, /status\(400\)\.json\(\{ error: galatJam \}\)/, 'harus membalas 400')
  // Validasi harus muncul SEBELUM pemanggilan normalizePiketIds (yang menyentuh DB).
  assert.ok(blok.indexOf('galatRentangJam') < blok.indexOf('normalizePiketIds'), 'validasi jam lebih dulu')
})

test('PUT /api/jadwal/:id juga memvalidasi jam', () => {
  const i = SUMBER.indexOf("app.put('/api/jadwal/:id'")
  assert.ok(i > 0)
  const blok = SUMBER.slice(i, i + 1200)
  assert.match(blok, /galatRentangJam\(jam_mulai, jam_selesai\)/)
  assert.match(blok, /status\(400\)\.json\(\{ error: galatJam \}\)/)
})

test('logika galatRentangJam: menolak terbalik, menerima wajar', () => {
  // Salin fungsi dari sumber dan uji perilakunya.
  const m = SUMBER.match(/const POLA_JAM = (\/[^\n]+\/)\nfunction galatRentangJam[\s\S]*?\n}\n/)
  assert.ok(m, 'definisi helper harus bisa diekstrak')
  const kode = `const POLA_JAM = ${m[1]};\n` + m[0].split('\n').slice(1).join('\n')
  const fn = new Function(kode + '\nreturn galatRentangJam;')()
  assert.strictEqual(fn('07:30', '08:10'), null, 'rentang wajar harus lolos')
  assert.match(fn('11:40', '00:15'), /harus lebih besar/, 'terbalik harus ditolak')
  assert.match(fn('10:35', '07:30'), /harus lebih besar/)
  assert.match(fn('7:30', '08:10'), /Format jam/, 'format tidak valid ditolak')
  assert.strictEqual(fn('', ''), null, 'kosong = opsional, tidak dipaksa')
  assert.strictEqual(fn(null, null), null)
})
