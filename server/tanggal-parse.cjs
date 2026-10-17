'use strict'
// Parser tanggal Indonesia yang toleran: mengenali semua variasi yang ADA DI DATA
// dan mengembalikan ISO YYYY-MM-DD, atau null kalau tidak bisa dipastikan.
//
// Variasi yang ditangani (dari data nyata):
//   "28 JULI 2018"       -> 2018-07-28
//   "06-Sep-16"          -> 2016-09-06
//   "11-April-2015"      -> 2015-04-11
//   "01-NOV-2012"        -> 2012-11-01
//   "18-okt 16"          -> 2016-10-18
//   "11-juni 16"         -> 2016-06-11
//   "30 AGUSTUS2018"     -> 2018-08-30
//   "24 Agustus2017"     -> 2017-08-24
//   "9 N0vember 2016"    -> 2016-11-09  (typo angka nol)
//   "2012-03-13"         -> 2012-03-13  (sudah ISO)

const BULAN = {
  // Indonesia
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  // Singkatan Indonesia
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8, ags: 8,
  sep: 9, sept: 9, okt: 10, nov: 11, des: 12,
  // Inggris (berkas lama sering pakai ini)
  january: 1, february: 2, march: 3, april2: 4, may: 5, june: 6, july: 7,
  august: 8, september2: 9, october: 10, november2: 11, december: 12,
  // Singkatan Inggris
  jan2: 1, feb2: 2, mar2: 3, apr2: 4, may2: 5, jun2: 6, jul2: 7, aug: 8, sep2: 9, oct: 10, nov2: 11, dec: 12,
}

function namaBulan(kata) {
  let k = String(kata || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!k) return 0
  // Buang angka di UJUNG kata ("agustus2018" -> "agustus"), tapi angka di TENGAH
  // dibiarkan karena itu typo yang harus diperbaiki ("n0vember" -> "november").
  k = k.replace(/\d+$/, '')
  if (!k) return 0
  // Perbaiki typo umum: angka yang menyerupai huruf (0->o, 1->i, 5->s, 3->e)
  k = k.replace(/0/g, 'o').replace(/1/g, 'i').replace(/5/g, 's').replace(/3/g, 'e')
  // "n0vember" -> "november" sudah tertangani; "noiember" (kalau 1->i) juga
  k = k.replace(/noiember/g, 'november')
  if (BULAN[k]) return BULAN[k]
  // Coba tanpa vokal ganda / ejaan mirip
  const alias = {
    agustus: 8, agust: 8, agus: 8, ags: 8, agu: 8,
    pebruari: 2, pebruari2: 2, febru: 2,
    nopember: 11, nop: 11,
    okto: 10, oktober2: 10,
    des: 12, dsb: 12,
  }
  if (alias[k]) return alias[k]
  // Cocokkan 3 huruf pertama
  for (const [nama, no] of Object.entries(BULAN)) {
    if (nama.length >= 3 && k.startsWith(nama.slice(0, 3)) && Math.abs(k.length - nama.length) <= 2) return no
  }
  return 0
}

function sah(y, m, d) {
  if (!(y >= 1900 && y <= 2100)) return null
  if (!(m >= 1 && m <= 12)) return null
  if (!(d >= 1 && d <= 31)) return null
  const cek = new Date(Date.UTC(y, m - 1, d))
  if (cek.getUTCFullYear() !== y || cek.getUTCMonth() !== m - 1 || cek.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function lengkapiTahun(y) {
  const n = Number(y)
  if (String(y).length === 4) return n
  if (String(y).length === 2) return n > 30 ? 1900 + n : 2000 + n
  return n
}

function parseTanggalLahir(nilai) {
  if (nilai === null || nilai === undefined) return null
  const asli = String(nilai).trim()
  if (!asli) return null

  // 1. Sudah ISO
  let m = asli.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return sah(+m[1], +m[2], +m[3])

  // 2. D-M-YYYY atau D/M/YYYY (angka semua)
  m = asli.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (m) {
    const d = +m[1], mo = +m[2], y = lengkapiTahun(m[3])
    // Kalau angka kedua > 12, kemungkinan formatnya M-D-Y
    if (mo > 12 && d <= 12) return sah(y, d, mo)
    return sah(y, mo, d)
  }

  // 3. Ada nama bulan: ambil angka & kata.
  // Kata harus boleh memuat angka di tengah ("N0vember") supaya typo tidak memecah kata.
  const angka = asli.match(/\d+/g) || []
  const kata = (asli.match(/[A-Za-z][A-Za-z0-9]*/g) || [])
  const bulanKata = kata.find(k => namaBulan(k) > 0)

  if (bulanKata) {
    const mo = namaBulan(bulanKata)
    // Angka: bisa [hari, tahun] atau [tahun, hari]
    const nums = angka.map(Number)
    if (nums.length >= 2) {
      // Tahun = angka 4 digit, atau angka 2 digit yang bukan hari
      let tahun = nums.find(n => String(n).length === 4)
      let hari = nums.find(n => n !== tahun && n >= 1 && n <= 31)
      if (tahun === undefined) {
        // dua digit: mana yang tahun?
        const dua = nums.filter(n => String(n).length === 2)
        if (dua.length >= 2) { tahun = lengkapiTahun(dua[dua.length - 1]); hari = dua[0] }
        else if (dua.length === 1) { tahun = lengkapiTahun(dua[0]); hari = nums.find(n => n !== dua[0]) }
      }
      if (tahun !== undefined && hari !== undefined) {
        const hasil = sah(Number(tahun), mo, Number(hari))
        if (hasil) return hasil
        // Tanggal mustahil (31 Februari): JANGAN biarkan Date meluber ke bulan lain.
        return null
      }
    }
  }

  // 4. Serahkan ke Date sebagai upaya terakhir (hanya kalau ada nama bulan Inggris)
  if (bulanKata) {
    const coba = new Date(asli)
    if (!isNaN(coba.getTime())) {
      const y = coba.getFullYear(), mo = coba.getMonth() + 1, d = coba.getDate()
      const hasil = sah(y, mo, d)
      if (hasil) return hasil
    }
  }

  return null
}

module.exports = { parseTanggalLahir, namaBulan }

// Uji mandiri
if (require.main === module) {
  const uji = [
    '28 JULI 2018', '06-Sep-16', '11-April-2015', '01-NOV-2012', '18-okt 16',
    '11-juni 16', '30 AGUSTUS2018', '24 Agustus2017', '9 N0vember 2016',
    '2012-03-13', '31-Jan-16', '07-Des-16', '2 Agustus 2017', '4 juli 2017',
  ]
  console.log('=== UJI PARSER ===')
  for (const u of uji) console.log(`  ${JSON.stringify(u).padEnd(22)} -> ${parseTanggalLahir(u)}`)
}
