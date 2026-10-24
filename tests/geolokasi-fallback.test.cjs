'use strict'
// Kontrak perbaikan geolokasi ceklok & masuk-kelas (23 Okt 2026).
//
// Keluhan produksi: guru tidak bisa ceklok — error timeout dan "jarak terlalu
// jauh" padahal sudah berdiri di lokasi. Dua akar yang diperbaiki:
//
//   1. TIMEOUT — `enableHighAccuracy: true` memaksa GPS satelit yang tidak bisa
//      lock di dalam gedung -> getCurrentPosition timeout 15-20 detik lalu gagal.
//      Perbaikan: fallback dua tahap (GPS presisi tinggi dulu, lalu posisi
//      jaringan WiFi/seluler yang bekerja di dalam gedung).
//
//   2. JARAK TERLALU JAUH — toleransi akurasi dibatasi 60 m, padahal posisi
//      dalam gedung wajar melaporkan akurasi 100-200 m. Guru di lokasi ditolak
//      karena toleransinya dipotong di bawah ketidakpastian alatnya sendiri.
//      Perbaikan: AKURASI_MAKS 60 -> 200 m (tetap jauh di bawah celah pemalsuan).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = p => fs.readFileSync(path.join(AKAR, p), 'utf8')
const geo = require(path.join(AKAR, 'server', 'geo-lock.cjs'))

test('geo-lock: toleransi akurasi naik ke 200 m (bukan 60) agar posisi dalam gedung lolos', () => {
  assert.strictEqual(geo.AKURASI_MAKS, 200)
  assert.strictEqual(geo.toleransiAkurasi(150), 150, 'akurasi jaringan 150m tidak dipotong')
  assert.strictEqual(geo.toleransiAkurasi(99999), 200, 'akurasi palsu tetap dibatasi 200m')
})

test('geo-lock: posisi dalam gedung (akurasi 150m, meleset 120m) LOLOS di radius sekolah 70m', () => {
  // Sebelumnya (cap 60): batas 70+60=130m, jarak 120m lolos. Tapi meleset 150m
  // (umum dalam gedung) DITOLAK. Kini batas 70+150=220m -> lolos.
  assert.ok(geo.toleransiAkurasi(150) === 150, 'sanity: 150m masih dalam batas')
})

test('frontend: helper geolokasi punya fallback dua tahap (GPS lalu jaringan)', () => {
  const g = baca('src/lib/geo.ts')
  assert.match(g, /enableHighAccuracy: true, timeout: 8000/, 'tahap 1 GPS presisi tinggi (8 detik)')
  assert.match(g, /enableHighAccuracy: false, timeout: 12000/, 'tahap 2 fallback jaringan (12 detik)')
  assert.match(g, /code === 1/, 'izin ditolak tidak diulang ke jaringan')
  assert.match(g, /export async function getCurrentPosition/, 'fungsi bersama diekspor')
})

test('frontend: ceklok guru memakai helper bersama, bukan getCurrentPosition inline timeout 15s', () => {
  const a = baca('src/pages/guru/GuruAbsensiPage.tsx')
  assert.match(a, /import \{ getCurrentPosition \} from '..\/..\/lib\/geo'/, 'ceklok memakai helper bersama')
  assert.doesNotMatch(a, /enableHighAccuracy: true, timeout: 15000/, 'tidak ada lagi getCurrentPosition inline timeout 15s')
  assert.match(a, /acc > 500/, 'hanya tolak posisi IP-level (>500m), bukan >200m')
})

test('frontend: masuk kelas menampilkan alasan gagal lokasi, bukan kirim koordinat kosong', () => {
  const d = baca('src/pages/guru/GuruDashboard.tsx')
  const m = baca('src/pages/guru/MobileGuruDashboard.tsx')
  for (const [f, nama] of [[d, 'GuruDashboard'], [m, 'MobileGuruDashboard']]) {
    assert.match(f, /catch \(e: any\) \{\s*toast\.error\(e\?\.message/, `${nama} menampilkan alasan gagal lokasi`)
    assert.doesNotMatch(f, /catch \{ lok = \{\} \}/, `${nama} tidak lagi menelan galat lokasi`)
  }
})
