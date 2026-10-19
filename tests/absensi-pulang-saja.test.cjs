'use strict'
// Kontrak: siswa yang hanya scan PULANG tidak boleh tampak "sudah absen".
//
// BUG YANG DILAPORKAN: "ada yang belum absensi tapi sudah tercatat absensi".
//
// Akar masalahnya terbukti dari data produksi (97 baris):
//   status (masuk) KOSONG, waktu_masuk KOSONG, waktu_pulang ADA, status_pulang 'hadir'
// Artinya siswa hanya scan sesi pulang. Barisnya memang benar — yang salah
// adalah tampilan yang membuatnya seolah hadir penuh.
//
// Dua hal yang dikunci di sini:
//   1. Penyimpanan TIDAK boleh memalsukan status masuk menjadi 'hadir'
//      (itu akan membuat rekap & notifikasi wali bohong).
//   2. UI harus menandai siswa "pulang saja" agar guru tahu sesi masuknya
//      belum tercatat.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('scan pulang saja tidak mengisi status masuk', () => {
  const s = baca('server/attendance-rules.cjs')
  const i = s.indexOf('const insert = isPulang')
  const badan = s.slice(i, i + 700)
  // params baris pulang harus menulis '' pada kolom status
  assert.ok(/params: \[id, siswaId, rombelId, tanggal, '', status, waktu/.test(badan),
    'kolom status (masuk) harus tetap kosong saat hanya pulang yang tercatat')
  assert.ok(!/params: \[id, siswaId, rombelId, tanggal, 'hadir'/.test(badan),
    'JANGAN memalsukan status masuk menjadi hadir')
})

test('respons scan memberi tahu sesi mana yang benar-benar tercatat', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.post('/api/absensi-siswa/qr-scan'")
  const badan = s.slice(i, i + 4200)
  assert.ok(/sudah_masuk/.test(badan),
    'respons harus menyertakan apakah siswa sudah punya catatan masuk')
  assert.ok(/sesi: normalizedJenis/.test(badan), 'respons harus menyebut sesinya')
})

test('UI menandai siswa yang hanya punya catatan pulang', () => {
  const s = baca('src/pages/admin/AbsensiSiswaPage.tsx')
  assert.ok(/pulangSaja/.test(s), 'harus ada penanda pulang-saja')
  assert.ok(/a\.waktu_pulang/.test(s), 'penanda dihitung dari waktu_pulang yang ada')
  assert.ok(/!a\.status/.test(s), 'hanya berlaku bila status masuk kosong')
  assert.ok(/pulang saja/.test(s), 'harus ada label yang terbaca guru')
})

test('rekap tidak menghitung baris pulang-saja sebagai hadir', () => {
  // Monitoring memakai COALESCE(status,'')<>'' sehingga baris kosong tidak
  // dihitung "sudah masuk" — perilaku ini harus dipertahankan.
  const s = baca('server/notification-monitor.cjs')
  assert.ok(/COALESCE\(a\.status,''\)<>''/.test(s),
    'monitoring harus mengabaikan status kosong agar tidak dihitung hadir')
})
