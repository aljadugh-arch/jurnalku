'use strict'
// Kontrak: tanggal lahir tampil DD-MMMM-YYYY, tetapi database tetap ISO.
//
// Alasan pemisahan ini: <input type="date"> HANYA menerima YYYY-MM-DD. Kalau DB
// diisi "28-Juli-2018", form edit akan tampil kosong dan tanggal hilang saat
// disimpan ulang. Jadi normalisasi ke ISO di DB, format di lapisan tampil.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const { formatTanggalLahir } = require(path.join(AKAR, 'server', 'format-tanggal.cjs'))
const { parseTanggalLahir } = require(path.join(AKAR, 'server', 'tanggal-parse.cjs'))

test('format tampilan: ISO -> DD-MMMM-YYYY', () => {
  assert.strictEqual(formatTanggalLahir('2018-07-28'), '28-Juli-2018')
  assert.strictEqual(formatTanggalLahir('2012-03-13'), '13-Maret-2012')
  assert.strictEqual(formatTanggalLahir('2020-09-01'), '01-September-2020')
  assert.strictEqual(formatTanggalLahir('2016-12-07'), '07-Desember-2016')
})

test('format tampilan: hari dan bulan selalu dua digit, tahun empat digit', () => {
  assert.strictEqual(formatTanggalLahir('2019-05-07'), '07-Mei-2019')
  assert.match(formatTanggalLahir('2019-05-07'), /^\d{2}-[A-Z][a-z]+-\d{4}$/)
})

test('format tampilan: nilai kosong / sampah jadi "-"', () => {
  assert.strictEqual(formatTanggalLahir(''), '-')
  assert.strictEqual(formatTanggalLahir(null), '-')
  assert.strictEqual(formatTanggalLahir(undefined), '-')
  assert.strictEqual(formatTanggalLahir('bukan tanggal'), '-')
})

test('format tampilan: tetap benar untuk data lama yang belum dinormalkan', () => {
  assert.strictEqual(formatTanggalLahir('28 JULI 2018'), '28-Juli-2018')
  assert.strictEqual(formatTanggalLahir('06-Sep-16'), '06-September-2016')
  assert.strictEqual(formatTanggalLahir('9 N0vember 2016'), '09-November-2016')
  assert.strictEqual(formatTanggalLahir('30 AGUSTUS2018'), '30-Agustus-2018')
})

test('parser normalisasi: semua variasi data nyata -> ISO', () => {
  const kasus = {
    '28 JULI 2018': '2018-07-28',
    '06-Sep-16': '2016-09-06',
    '11-April-2015': '2015-04-11',
    '01-NOV-2012': '2012-11-01',
    '18-okt 16': '2016-10-18',
    '11-juni 16': '2016-06-11',
    '30 AGUSTUS2018': '2018-08-30',
    '24 Agustus2017': '2017-08-24',
    '9 N0vember 2016': '2016-11-09',
    '31-Jan-16': '2016-01-31',
    '07-Des-16': '2016-12-07',
    '2 Agustus 2017': '2017-08-02',
    '4 juli 2017': '2017-07-04',
    '2012-03-13': '2012-03-13',
  }
  for (const [masukan, harap] of Object.entries(kasus)) {
    assert.strictEqual(parseTanggalLahir(masukan), harap, `gagal untuk ${JSON.stringify(masukan)}`)
  }
})

test('parser menolak tanggal mustahil', () => {
  assert.strictEqual(parseTanggalLahir('31 Februari 2018'), null)
  assert.strictEqual(parseTanggalLahir('32 JULI 2018'), null)
  assert.strictEqual(parseTanggalLahir('28 Juli 1800'), null)
})

test('helper frontend ada dan rumusnya sama dengan backend', () => {
  const fe = fs.readFileSync(path.join(AKAR, 'src', 'lib', 'tanggalLahir.ts'), 'utf8')
  assert.match(fe, /export function formatTanggalLahir/)
  assert.match(fe, /BULAN_ID/)
  // Nama bulan Indonesia lengkap, bukan singkatan
  for (const b of ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']) {
    assert.ok(fe.includes(b), `bulan ${b} harus ada di helper frontend`)
  }
})

test('kolom tanggal lahir di UI memakai formatter, bukan nilai mentah', () => {
  const siswa = fs.readFileSync(path.join(AKAR, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
  assert.match(siswa, /formatTanggalLahir\(s\.tanggal_lahir\)/)
  const gtk = fs.readFileSync(path.join(AKAR, 'src', 'pages', 'admin', 'DataGTKPage.tsx'), 'utf8')
  assert.match(gtk, /formatTanggalLahir\(g\.tanggal_lahir\)/)
})

test('input tanggal TETAP memakai ISO (jangan diformat)', () => {
  const siswa = fs.readFileSync(path.join(AKAR, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
  // <input type="date" value={form.tanggal_lahir}> harus tetap nilai mentah
  assert.match(siswa, /type="date"[^>]*value=\{form\.tanggal_lahir\}/)
})

test('service PDF memakai formatter tanggal lahir', () => {
  for (const f of ['rapor-k13-pdf-service.cjs', 'rapor-mtsplus-pdf-service.cjs', 'rapor-siswa-pdf-service.cjs', 'kts-pdf-service.cjs']) {
    const isi = fs.readFileSync(path.join(AKAR, 'server', f), 'utf8')
    assert.match(isi, /formatTanggalLahir/, `${f} harus memakai formatTanggalLahir`)
  }
})
