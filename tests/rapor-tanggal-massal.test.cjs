'use strict'
// Kontrak fitur "set tanggal pembagian massal per kelas" (25 Okt 2026).
//
// Tanggal pembagian rapor tersimpan per-siswa di rapor_pelengkap.tanggal_pembagian
// (input PUT /api/rapor/pelengkap). Untuk cetak massal satu kelas, admin butuh
// shortcut satu tanggal untuk seluruh siswa — endpoint POST baru + kontrol UI.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const index = fs.readFileSync(path.join(AKAR, 'server/index.cjs'), 'utf8')
const rapor = fs.readFileSync(path.join(AKAR, 'src/pages/admin/RaporPage.tsx'), 'utf8')

test('endpoint massal terdaftar dengan gate STAFF', () => {
  assert.ok(index.includes("app.post('/api/rapor/pelengkap/tanggal-massal', STAFF"), 'route POST + gate STAFF')
})

test('endpoint memvalidasi format tanggal (YYYY-MM-DD)', () => {
  // Potongan handler massal (antara definisi route dan 'Bobot nilai rapor').
  const blok = index.slice(index.indexOf('tanggal-massal'), index.indexOf("// Bobot nilai rapor"))
  assert.ok(/tanggal_pembagian tidak valid/.test(blok), 'pesan error format tanggal')
  assert.ok(/\\d\{4\}-\\d\{2\}-\\d\{2\}\$/.test(blok), 'regex format YYYY-MM-DD')
})

test('endpoint upsert HANYA kolom tanggal_pembagian (jaga pelengkap lain)', () => {
  const blok = index.slice(index.indexOf('tanggal-massal'), index.indexOf("// Bobot nilai rapor"))
  assert.ok(/ON CONFLICT\(tenant_id,siswa_id,tahun_ajaran,semester,jenis\) DO UPDATE SET\s+[\s\S]*?tanggal_pembagian=excluded\.tanggal_pembagian/.test(blok), 'konflik hanya update tanggal_pembagian')
  // Tidak boleh menimpa prestasi/catatan/keputusan.
  assert.ok(!/DO UPDATE SET\s+[\s\S]*?catatan_wali_kelas=excluded\.catatan_wali_kelas/.test(blok), 'tidak menimpa catatan wali kelas')
})

test('endpoint membatasi ke siswa AKTIF dan melapor jumlah', () => {
  const blok = index.slice(index.indexOf('tanggal-massal'), index.indexOf("// Bobot nilai rapor"))
  assert.ok(/COALESCE\(status,'aktif'\)='aktif'/.test(blok), 'hanya siswa aktif')
  assert.ok(/jumlah: siswaRows\.length/.test(blok), 'melapor jumlah siswa ter-update')
})

test('UI RaporPage menampilkan kontrol tanggal massal per kelas', () => {
  assert.ok(/tanggal-massal/.test(rapor), 'panggil endpoint massal')
  assert.ok(/Tanggal Pembagian \(seluruh kelas\)/.test(rapor), 'label input tanggal massal')
  assert.ok(/Set untuk Kelas/.test(rapor), 'tombol set untuk kelas')
  assert.ok(/simpanTanggalMassal/.test(rapor), 'fungsi simpan massal')
})

test('input per-siswa (Tanggal Pembagian) tetap ada', () => {
  assert.ok(/label="Tanggal Pembagian"/.test(rapor), 'input per-siswa tidak dihapus')
})
