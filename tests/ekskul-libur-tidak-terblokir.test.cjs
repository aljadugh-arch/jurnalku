'use strict'
// Kontrak: absensi ekskul boleh dicatat di hari libur/akhir pekan (26 Okt 2026).
//
// Bug: POST /api/absensi-ekskul/bulk digerbang assertKbmActive sehingga ekskul
// yang jatuh di hari libur (libur mingguan via setting hari_libur, atau event
// kalender jenis "libur") ditolak dengan "Hari libur: absensi nonaktif".
// Ekstrakurikuler berjalan di luar KBM (lazim di akhir pekan/libur), jadi
// absensinya harus independen dari kalender KBM — beda dengan absensi pelajaran
// reguler yang tetap wajib digerbang.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')

function endpointBlock(code, startMarker) {
  const start = code.indexOf(startMarker)
  assert.ok(start >= 0, `endpoint tidak ditemukan: ${startMarker}`)
  const next = code.indexOf('\napp.', start + 1)
  return next >= 0 ? code.slice(start, next) : code.slice(start)
}

test('absensi ekskul TIDAK digerbang assertKbmActive (boleh di hari libur)', () => {
  const blok = endpointBlock(server, "app.post('/api/absensi-ekskul/bulk'")
  assert.ok(!blok.includes('assertKbmActive(req'), 'tidak ada pemanggilan assertKbmActive di endpoint ekskul')
})

test('absensi pelajaran reguler TETAP digerbang assertKbmActive (tanpa regresi)', () => {
  const blok = endpointBlock(server, "app.post('/api/absensi-siswa/bulk'")
  assert.ok(blok.includes('assertKbmActive'), 'absensi reguler masih memakai assertKbmActive')
})
