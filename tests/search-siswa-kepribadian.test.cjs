'use strict'
// Kontrak perbaikan search siswa di Catatan Kepribadian (25 Okt 2026).
//
// Bug: search siswa tidak memunculkan siswa pada catatan kepribadian guru
// (siswaList diambil dari /guru/jadwal-context yang terbatas ke jadwal hari
// itu) dan admin (tidak ada search sama sekali). Perbaikan: guru memakai
// /api/siswa (semua siswa diampu), admin menambah search nama/NIS.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const guru = fs.readFileSync(path.join(AKAR, 'src/pages/guru/GuruCatatanKepribadianPage.tsx'), 'utf8')
const admin = fs.readFileSync(path.join(AKAR, 'src/pages/admin/CatatanKepribadianPage.tsx'), 'utf8')

test('guru: fetchSiswa memakai /api/siswa, bukan jadwal-context', () => {
  const blok = guru.slice(guru.indexOf('const fetchSiswa'), guru.indexOf('useEffect(() => { fetchData()'))
  assert.ok(/api\.get\('\/siswa'\)/.test(blok), 'ambil dari /api/siswa')
  assert.ok(!/guru\/jadwal-context/.test(blok), 'tidak lagi memakai jadwal-context')
})

test('guru: perubahan tanggal tidak memicu fetchSiswa(tanggal)', () => {
  assert.ok(!/fetchSiswa\(tanggal\)/.test(guru), 'tidak ada fetchSiswa(tanggal) tersisa')
})

test('admin: ada input search siswa (nama/NIS)', () => {
  assert.ok(/Cari nama \/ NIS siswa/.test(admin), 'placeholder search')
  assert.ok(/setSearch\(e\.target\.value\)/.test(admin), 'input search terhubung state')
})

test('admin: pencarian hanya memfilter tampilan (visibleRows), bukan data yang disimpan (rows)', () => {
  const blok = admin.slice(admin.indexOf('const visibleRows'), admin.indexOf('const update ='))
  assert.ok(/rows\.filter\(r =>/.test(blok), 'filter visibleRows')
  assert.ok(/r\.nama.*toLowerCase\(\).*includes\(q\)/.test(blok), 'cocokkan nama')
  assert.ok(/String\(r\.nis \|\| ''\)\.includes\(q\)/.test(blok), 'cocokkan NIS')
  // Simpan Semua mem-posting rows (lengkap), bukan visibleRows (terfilter),
  // supaya siswa yang sedang terfilter pencarian tidak ikut terhapus.
  assert.ok(/data:\s*rows\s*\}/.test(admin), 'save memakai rows penuh')
})

test('admin: pesan kosong membedakan search vs rombel kosong', () => {
  assert.ok(/Siswa tidak ditemukan/.test(admin), 'pesan search tidak menemukan')
})
