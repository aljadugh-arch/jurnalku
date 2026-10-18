'use strict'
// Kontrak modul Alumni & Mutasi.
//
// Kenapa bukan sekadar mengubah kolom siswa.status: status saja tidak menyimpan
// KAPAN, KEMANA, dan ATAS DASAR APA siswa keluar — dan itu yang diminta saat
// akreditasi/audit. Karena itu riwayat disimpan di tabel sendiri dan tidak
// pernah dihapus.
//
// Efek samping yang dikunci: mencatat mutasi keluar HARUS mengosongkan rombel,
// kalau tidak siswa alumni tetap muncul di absensi, jadwal, dan rekap kelas.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const mut = require(path.join(AKAR, 'server', 'mutasi.cjs'))

test('riwayat mutasi disimpan di tabel sendiri', () => {
  const s = baca('server/mutasi.cjs')
  assert.ok(/CREATE TABLE IF NOT EXISTS mutasi_siswa/.test(s), 'tabel mutasi_siswa harus ada')
  // Tidak boleh sekadar UPDATE siswa tanpa riwayat
  assert.ok(/INSERT INTO mutasi_siswa/.test(s), 'setiap mutasi harus dicatat ke riwayat')
})

test('mutasi keluar mengosongkan rombel agar berhenti muncul di absensi', () => {
  const s = baca('server/mutasi.cjs')
  assert.ok(/SET status=\?, rombel_id=NULL/.test(s),
    'status keluar harus mengosongkan rombel_id — tanpa ini alumni tetap dihitung di kelas')
})

test('jenis mutasi dan status hasilnya konsisten', () => {
  assert.deepStrictEqual(mut.STATUS_SETELAH.alumni, 'alumni')
  assert.deepStrictEqual(mut.STATUS_SETELAH.pindah_keluar, 'pindah')
  assert.deepStrictEqual(mut.STATUS_SETELAH.pindah_masuk, 'aktif', 'pindah masuk harus mengaktifkan kembali')
  assert.deepStrictEqual(mut.STATUS_SETELAH.keluar, 'keluar')
})

test('semua jenis mutasi punya label yang bisa dibaca', () => {
  for (const j of mut.JENIS_MUTASI) {
    assert.ok(mut.LABEL_JENIS[j], `jenis ${j} harus punya label`)
  }
})

test('pembatalan mutasi tidak menghapus riwayat', () => {
  const s = baca('server/mutasi.cjs')
  const i = s.indexOf("/api/mutasi/:id/urungkan")
  const badan = s.slice(i, i + 1600)
  assert.ok(!/DELETE FROM mutasi_siswa/.test(badan),
    'urungkan tidak boleh menghapus riwayat — itu jejak audit')
  assert.ok(/INSERT INTO mutasi_siswa/.test(badan),
    'urungkan harus mencatat pembatalan sebagai baris baru')
})

test('rute dan halaman terdaftar', () => {
  const idx = baca('server/index.cjs')
  assert.ok(/daftarkanRuteMutasi\(app/.test(idx), 'rute mutasi harus didaftarkan')
  const app = baca('src/App.tsx')
  assert.ok(/path="mutasi"/.test(app), 'route /admin/mutasi harus ada')
  const menu = baca('src/lib/menuItems.tsx')
  assert.ok(/Alumni & Mutasi/.test(menu), 'menu Alumni & Mutasi harus ada')
})

test('halaman dengan tabel dibungkus overflow-x-auto (tidak terpotong di HP)', () => {
  const s = baca('src/pages/admin/MutasiPage.tsx')
  if (s.includes('<table')) {
    assert.ok(/overflow-x-auto/.test(s), 'tabel alumni harus punya wadah scroll horizontal')
  }
})
