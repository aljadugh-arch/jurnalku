'use strict'
// Kontrak geometri sampul rapor & buku induk.
//
// Latar: pernah terjadi DUA cacat tata letak yang hanya ketahuan dari
// pemeriksaan visual/koordinat, bukan dari tes unit:
//   1. Logo lembaga ditaruh di 21.4% (di ATAS judul) sehingga menutupi
//      "R A P O R" dan "MADRASAH ..." sepanjang ~105pt.
//   2. Kotak identitas terlalu tinggi sehingga garis bawahnya menembus
//      kaki halaman (KEMENTERIAN AGAMA) — tumpang tindih 17.4pt.
// Tes ini mengunci proporsi sehingga kesalahan itu tidak bisa terulang.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const H = 841.89 // tinggi A4 dalam pt (PDFKit)

// Ambil nilai dari `H * 0.xxx` pada baris tertentu.
function ambilAngka(teks, pola) {
  const m = teks.match(pola)
  return m ? Number(m[1]) : null
}

// ---------- SAMPUL RAPOR ----------

test('sampul rapor: logo lembaga TIDAK di atas judul', () => {
  const s = baca('server/rapor-mtsplus-pdf-service.cjs')
  const kemenag = ambilAngka(s, /doc\.image\(logo\.kemenagPath, W \/ 2 - 67, H \* ([\d.]+)/)
  const lembaga = ambilAngka(s, /doc\.image\(logo\.lembagaLogoPath, W \/ 2 - 67, H \* ([\d.]+)/)
  assert.ok(kemenag !== null && lembaga !== null, 'kedua logo harus digambar')
  // Dokumen acuan: logo Kemenag 7.3%, logo lembaga 53.3%.
  assert.ok(Math.abs(kemenag - 0.073) < 0.02, `logo Kemenag harus ~7.3%, dapat ${kemenag}`)
  assert.ok(Math.abs(lembaga - 0.533) < 0.02, `logo lembaga harus ~53.3%, dapat ${lembaga}`)

  // Yang paling penting: logo lembaga harus berada DI BAWAH seluruh blok
  // judul, jenjang, nama lembaga, dan NSM/NPSN — di dokumen acuan logo itu
  // duduk di antara baris NSM/NPSN (47.7%) dan kotak identitas.
  const judul = ambilAngka(s, /doc\.text\('R A P O R', M, H \* ([\d.]+)/)
  const nsm = ambilAngka(s, /doc\.text\(idn, M, H \* ([\d.]+)/)
  assert.ok(judul !== null && nsm !== null, 'judul & NSM harus ada')
  const logoAtas = lembaga * H
  assert.ok(logoAtas > nsm * H,
    `logo lembaga (${(lembaga * 100).toFixed(1)}%) harus di BAWAH NSM/NPSN (${(nsm * 100).toFixed(1)}%)`)
  assert.ok(logoAtas > (judul + 0.20) * H,
    `logo harus jauh di bawah judul (${(judul * 100).toFixed(1)}%)`)
})

test('sampul rapor: tinggi logo sesuai dokumen acuan (121 / 132 pt)', () => {
  const s = baca('server/rapor-mtsplus-pdf-service.cjs')
  assert.ok(/kemenagPath[\s\S]{0,120}fit: \[135, 121\]/.test(s), 'logo Kemenag 135x121')
  assert.ok(/lembagaLogoPath[\s\S]{0,120}fit: \[135, 132\]/.test(s), 'logo lembaga 135x132')
})

test('sampul rapor: kotak identitas tidak menembus kaki halaman', () => {
  const s = baca('server/rapor-mtsplus-pdf-service.cjs')
  const by = ambilAngka(s, /const boxY = H \* ([\d.]+)/)
  const bh = ambilAngka(s, /const boxH = (\d+)/)
  assert.ok(by !== null && bh !== null, 'boxY & boxH harus ada')
  const kotakBawah = by * H + bh
  const kaki = H - 120 // doc.text(instansi, M, H - 120, ...)
  assert.ok(kaki - kotakBawah >= 8,
    `jarak kotak ke kaki hanya ${(kaki - kotakBawah).toFixed(1)}pt (minimal 8pt)`)
})

test('sampul rapor: logo lembaga tidak menyentuh kotak identitas', () => {
  const s = baca('server/rapor-mtsplus-pdf-service.cjs')
  const lembaga = ambilAngka(s, /doc\.image\(logo\.lembagaLogoPath, W \/ 2 - 67, H \* ([\d.]+)/)
  const by = ambilAngka(s, /const boxY = H \* ([\d.]+)/)
  const logoBawah = lembaga * H + 132
  const kotakAtas = by * H
  assert.ok(kotakAtas - logoBawah >= 8,
    `jarak logo ke kotak hanya ${(kotakAtas - logoBawah).toFixed(1)}pt (minimal 8pt)`)
})

// ---------- SAMPUL BUKU INDUK ----------

test('sampul buku induk: proporsi sama dengan rapor', () => {
  const s = baca('server/buku-induk-pdf-service.cjs')
  const kemenag = ambilAngka(s, /doc\.image\(logo\.kemenagPath, W \/ 2 - 67, H \* ([\d.]+)/)
  const lembaga = ambilAngka(s, /doc\.image\(logo\.lembagaLogoPath, W \/ 2 - 67, H \* ([\d.]+)/)
  assert.ok(Math.abs(kemenag - 0.073) < 0.02, `logo Kemenag harus ~7.3%, dapat ${kemenag}`)
  assert.ok(Math.abs(lembaga - 0.533) < 0.02, `logo lembaga harus ~53.3%, dapat ${lembaga}`)
})

test('sampul buku induk: kotak tidak menembus kaki dan tidak menyentuh logo', () => {
  const s = baca('server/buku-induk-pdf-service.cjs')
  const by = ambilAngka(s, /const boxY = H \* ([\d.]+)/)
  const bh = ambilAngka(s, /const boxH = (\d+)/)
  const lembaga = ambilAngka(s, /doc\.image\(logo\.lembagaLogoPath, W \/ 2 - 67, H \* ([\d.]+)/)
  assert.ok(by !== null && bh !== null, 'boxY & boxH harus ada')
  const kotakAtas = by * H
  const kotakBawah = kotakAtas + bh
  const kaki = H - 120
  assert.ok(kaki - kotakBawah >= 8,
    `jarak kotak ke kaki hanya ${(kaki - kotakBawah).toFixed(1)}pt`)
  const logoBawah = lembaga * H + 132
  assert.ok(kotakAtas - logoBawah >= 8,
    `jarak logo ke kotak hanya ${(kotakAtas - logoBawah).toFixed(1)}pt`)
})

test('kedua sampul memakai posisi kaki halaman yang sama', () => {
  const r = baca('server/rapor-mtsplus-pdf-service.cjs')
  const b = baca('server/buku-induk-pdf-service.cjs')
  assert.ok(/doc\.text\(instansi\.toUpperCase\(\), M, H - 120/.test(r), 'rapor: kaki di H-120')
  assert.ok(/H - 120/.test(b), 'buku induk: kaki di H-120')
})

test('jenjang diambil dari settings, bukan hardcode MTs', () => {
  const r = baca('server/rapor-mtsplus-pdf-service.cjs')
  assert.ok(/settings\.jenjang/.test(r), 'jenjang harus dari settings')
  assert.ok(!/doc\.text\('MADRASAH TSANAWIYAH', M, H \* 0\.316/.test(r), 'jangan hardcode MTs di sampul')
  const b = baca('server/buku-induk-pdf-service.cjs')
  assert.ok(/namaJenjang\(settings\.jenjang\)/.test(b), 'buku induk juga pakai jenjang')
})
