'use strict'
// Kontrak substitusi guru.
//
// Tiga hal yang mudah salah dan karena itu dikunci di sini:
//
//  1. Substitusi berlaku PER TANGGAL, tidak mengubah `jadwal.gtk_id`. Kalau
//     jadwal diubah permanen, guru asli kehilangan jadwalnya selamanya.
//  2. Bentrok dicegah di SERVER. Guru yang sudah mengajar di jam yang sama
//     tidak boleh ditugaskan — dua kelas kehilangan guru tanpa ada yang sadar.
//  3. Satu jadwal pada satu tanggal hanya boleh punya SATU substitusi.
//     Dijamin unique index, bukan pengecekan aplikasi yang bisa balapan.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const sub = require(path.join(AKAR, 'server', 'substitusi.cjs'))
const s = baca('server/substitusi.cjs')

test('substitusi punya tabel sendiri, bukan mengubah jadwal', () => {
  assert.ok(/CREATE TABLE IF NOT EXISTS substitusi_guru/.test(s))
  assert.ok(!/UPDATE jadwal SET gtk_id/.test(s),
    'JANGAN mengubah gtk_id jadwal — guru asli akan kehilangan jadwalnya permanen')
})

test('satu jadwal satu tanggal hanya satu substitusi (unique index)', () => {
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS idx_substitusi_unik/.test(s),
    'keunikan harus dijamin DB, bukan cek aplikasi yang bisa balapan')
})

test('deteksi bentrok jam benar', () => {
  assert.strictEqual(sub.bentrok('07:30', '08:10', '07:30', '08:10'), true, 'jam identik = bentrok')
  assert.strictEqual(sub.bentrok('07:30', '08:10', '08:10', '08:50'), false, 'bersambung = tidak bentrok')
  assert.strictEqual(sub.bentrok('07:30', '08:50', '08:00', '08:30'), true, 'terkandung = bentrok')
  assert.strictEqual(sub.bentrok('09:00', '10:00', '07:30', '08:10'), false, 'beda waktu = tidak bentrok')
})

test('deteksi bentrok tahan format jam tanpa nol depan', () => {
  assert.strictEqual(sub.bentrok('7:30', '8:10', '07:30', '08:10'), true,
    '"7:30" harus dianggap sama dengan "07:30"')
})

test('nama hari diturunkan dari tanggal ISO', () => {
  assert.strictEqual(sub.hariDariTanggal('2026-10-18'), 'minggu')
  assert.strictEqual(sub.hariDariTanggal('2026-10-19'), 'senin')
  assert.strictEqual(sub.hariDariTanggal('bukan-tanggal'), '')
})

test('guru pengganti tidak boleh sama dengan guru asli', () => {
  assert.ok(/gtk_pengganti_id\) === String\(j\.gtk_id\)|String\(j\.gtk_id\) === String\(gtk_pengganti_id\)/.test(s) ||
            /Guru pengganti tidak boleh sama dengan guru asli/.test(s))
})

test('bentrok ditolak server, bisa dipaksa dengan alasan sadar', () => {
  assert.ok(/bisa_paksa/.test(s), 'server harus memberi tahu bahwa bentrok bisa dipaksa')
  assert.ok(/&& !paksa/.test(s), 'penolakan hanya berlaku bila tidak dipaksa')
})

test('calon pengganti menyertakan status bentrok', () => {
  assert.ok(/\/api\/substitusi\/calon/.test(s), 'endpoint calon harus ada')
  assert.ok(/detail_bentrok/.test(s), 'UI perlu detail jam bentrok, bukan sekadar boolean')
})

test('rute, halaman, dan menu terdaftar', () => {
  assert.ok(/daftarkanRuteSubstitusi\(app/.test(baca('server/index.cjs')))
  assert.ok(/path="substitusi"/.test(baca('src/App.tsx')))
  assert.ok(/Substitusi Guru/.test(baca('src/lib/menuItems.tsx')))
})
