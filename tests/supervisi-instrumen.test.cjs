// Menu Supervisi (kepala lembaga) — uji inti tanpa HTTP.
// Fokus: bank instrumen bawaan (akademik + manajerial) idempoten, hitung nilai
// sesi (total/persen/predikat + clamp skor), dan render laporan cetak.

const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const crypto = require('node:crypto')

const {
  setupSupervisiTables, seedInstrumenBawaan, daftarInstrumen, hitungSesi,
  predikatDari, labelAspek, buildLaporanHtml, ASPEK,
} = require('../server/supervisi.cjs')

const TENANT = 'tenant-uji'
const makeId = () => crypto.randomUUID()

function makeDb() {
  const db = new Database(':memory:')
  setupSupervisiTables(db)
  return db
}

test('seed instrumen bawaan: 2 aspek (akademik+manajerial), masing-masing berbutir, idempoten', () => {
  const db = makeDb()
  seedInstrumenBawaan(db, TENANT, makeId)
  const list = daftarInstrumen(db, TENANT)
  assert.equal(list.length, 2)
  assert.deepEqual(list.map(i => i.aspek).sort(), ['akademik', 'manajerial'])
  for (const ins of list) assert.ok(ins.butir.length >= 6, `${ins.aspek} harus punya butir`)

  seedInstrumenBawaan(db, TENANT, makeId) // tidak menggandakan
  assert.equal(daftarInstrumen(db, TENANT).length, 2)
  assert.deepEqual(ASPEK, ['akademik', 'manajerial'])
})

test('hitungSesi: total, persen, predikat; skor di-clamp ke rentang 0..max', () => {
  const butir = [
    { id: 'b1', max_skor: 4 }, { id: 'b2', max_skor: 4 }, { id: 'b3', max_skor: 4 }, { id: 'b4', max_skor: 4 },
  ]
  const penuh = hitungSesi(butir, butir.map(b => ({ butir_id: b.id, skor: 4 })))
  assert.equal(penuh.skor_total, 16)
  assert.equal(penuh.skor_maks, 16)
  assert.equal(penuh.persen, 100)
  assert.match(penuh.predikat, /^A/)

  const tengah = hitungSesi(butir, [{ butir_id: 'b1', skor: 3 }, { butir_id: 'b2', skor: 3 }])
  assert.equal(tengah.skor_total, 6)
  assert.equal(tengah.persen, 37.5)
  assert.match(tengah.predikat, /^D/)

  // skor melebihi max -> dipangkas; negatif -> 0; butir asing -> diabaikan
  const clamp = hitungSesi(butir, [{ butir_id: 'b1', skor: 99 }, { butir_id: 'b2', skor: -5 }, { butir_id: 'x', skor: 4 }])
  assert.equal(clamp.skor_total, 4)
})

test('predikatDari mengikuti ambang A>=90, B>=80, C>=70, D<70', () => {
  assert.match(predikatDari(90), /^A/)
  assert.match(predikatDari(80), /^B/)
  assert.match(predikatDari(70), /^C/)
  assert.match(predikatDari(69.9), /^D/)
  assert.match(predikatDari(0), /^D/)
  assert.equal(labelAspek('akademik'), 'Supervisi Akademik')
  assert.equal(labelAspek('manajerial'), 'Supervisi Manajerial')
})

test('buildLaporanHtml memuat identitas, butir, skor, predikat, rekomendasi, tindak lanjut', () => {
  const db = makeDb()
  seedInstrumenBawaan(db, TENANT, makeId)
  const ins = daftarInstrumen(db, TENANT).find(i => i.aspek === 'akademik')
  const skor = ins.butir.map(b => ({ butir_id: b.id, skor: 4, catatan: 'baik' }))
  const nilai = hitungSesi(ins.butir, skor)
  const sesi = {
    aspek: 'akademik', nama_terperiksa: 'Budi Santoso', jabatan: 'Guru Kelas VI',
    supervisor_nama: 'H. Ahmad Fauzi', tanggal: '2026-10-16',
    skor_total: nilai.skor_total, skor_maks: nilai.skor_maks, persen: nilai.persen, predikat: nilai.predikat,
    catatan: 'Pembelajaran berjalan baik', rekomendasi: 'Tingkatkan variasi media', tindak_lanjut: 'Dibina 1 bulan',
  }
  const html = buildLaporanHtml({ sesi, butir: ins.butir, skor, settings: { nama_lembaga: 'MI Uji', kota_cetak: 'Bondowoso' } })
  assert.match(html, /^<!doctype html>/i)
  assert.match(html, /LAPORAN SUPERVISI AKADEMIK/)
  assert.match(html, /Budi Santoso/)
  assert.match(html, /Tingkatkan variasi media/)
  assert.match(html, /Dibina 1 bulan/)
  assert.match(html, new RegExp(`${nilai.skor_total}/${nilai.skor_maks}`))
})

test('data klien pada laporan di-escape (tidak ada tag mentah)', () => {
  const html = buildLaporanHtml({
    sesi: { aspek: 'akademik', nama_terperiksa: '<img src=x onerror=alert(1)>', catatan: '<b>x</b>' },
    butir: [{ id: 'b1', pertanyaan: 'P1', indikator: '', max_skor: 4 }],
    skor: [{ butir_id: 'b1', skor: 4 }],
    settings: {},
  })
  assert.ok(!/<img src=x/.test(html))
  assert.ok(!/<b>x<\/b>/.test(html))
})