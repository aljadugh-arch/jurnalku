'use strict'
// Kontrak: unggah media posting harus TAHAN-SEBAGIAN.
// Satu berkas rusak tidak boleh menggagalkan berkas lain.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SUMBER = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')

test('unggah posting memakai Promise.allSettled, bukan Promise.all', () => {
  // Cari blok route upload posting.
  const awal = SUMBER.indexOf("app.post('/api/posting/upload'")
  assert.ok(awal > 0, 'route upload posting harus ada')
  const blok = SUMBER.slice(awal, awal + 3000)
  assert.match(blok, /Promise\.allSettled/, 'harus allSettled agar satu kegagalan tidak membatalkan semua')
  assert.ok(!/Promise\.all\(/.test(blok), 'tidak boleh Promise.all pada jalur ini')
})

test('unggah posting melaporkan berkas yang gagal (field gagal)', () => {
  const awal = SUMBER.indexOf("app.post('/api/posting/upload'")
  const blok = SUMBER.slice(awal, awal + 3000)
  assert.match(blok, /gagal\.push\(/, 'kegagalan per berkas harus dicatat')
  assert.match(blok, /res\.json\(\{\s*media:\s*saved,\s*gagal\s*\}\)/, 'respons harus memuat media + gagal')
})

test('bila SEMUA berkas gagal, balas 400 (bukan sukses palsu)', () => {
  const awal = SUMBER.indexOf("app.post('/api/posting/upload'")
  const blok = SUMBER.slice(awal, awal + 3000)
  assert.match(blok, /if \(!saved\.length\)/, 'harus ada penjagaan saat tidak ada yang berhasil')
  assert.match(blok, /status\(400\)/, 'harus 400 bila semua gagal')
})

test('FE memberi tahu berkas mana yang dilewati', () => {
  const fe = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'RichEditor.tsx'), 'utf8')
  assert.match(fe, /response\.data\.gagal/, 'FE harus membaca daftar gagal')
  assert.match(fe, /berkas dilewati/, 'FE harus memberi pesan ke pengguna')
})

test('simulasi: 2 sehat + 1 gagal -> 2 tersimpan, 1 dilaporkan', async () => {
  // Meniru alur Promise.allSettled di route: hasil sukses tetap dipakai.
  const tugas = [
    async () => ({ ok: true, nama: 'a.png' }),
    async () => { throw new Error('libpng read error') },
    async () => ({ ok: true, nama: 'c.png' }),
  ]
  const hasil = await Promise.allSettled(tugas.map(t => t()))
  const tersimpan = hasil.filter(h => h.status === 'fulfilled').map(h => h.value)
  const gagal = hasil.filter(h => h.status === 'rejected').map(h => h.reason.message)
  assert.equal(tersimpan.length, 2, 'dua berkas sehat harus tetap tersimpan')
  assert.equal(gagal.length, 1)
  assert.match(gagal[0], /libpng/)
})

test('perbandingan: Promise.all membatalkan semuanya (alasan bug ini ada)', async () => {
  const tugas = [
    async () => 'a',
    async () => { throw new Error('rusak') },
    async () => 'c',
  ]
  let gagalTotal = false
  try { await Promise.all(tugas.map(t => t())) } catch { gagalTotal = true }
  assert.equal(gagalTotal, true, 'Promise.all memang menggagalkan seluruh batch')
})
