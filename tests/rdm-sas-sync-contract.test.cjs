// Sinkron SAS dari RDM — kontrak klien↔server.
//
// Yang dijaga berkas ini:
//   - kedua endpoint SAS (options & sas) menjalankan penjaga SSRF sebelum
//     memanggil base_url yang diisi admin tenant (pendaftaran tenant terbuka,
//     jadi admin tenant BUKAN batas kepercayaan);
//   - endpoint options mengembalikan tahunajaran_id/semester_id supaya UI bisa
//     mengisi kolom wajib "Tahun Ajaran" otomatis — tanpa itu commit SAS selalu
//     ditolak validasi dan fitur tampak "tidak work";
//   - halaman admin benar-benar memanggil kedua endpoint.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-sas-000000000000'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

function blokSas(nama) {
  const idx = read('server/index.cjs')
  const start = idx.indexOf(`app.post('/api/rapor/rdm/${nama}'`)
  assert.ok(start > 0, `route /api/rapor/rdm/${nama} harus ada`)
  const end = idx.indexOf('app.', start + 10)
  return idx.slice(start, end > 0 ? end : start + 4000)
}

test('endpoint SAS RDM memakai penjaga SSRF sebelum memanggil base_url', () => {
  const idx = read('server/index.cjs')
  assert.match(idx, /async function jagaBaseUrlRdm/)
  assert.match(idx, /await assertSafeOutboundUrl\(String\(base_url \|\| ''\), 'URL tenant RDM'\)/)
  for (const nama of ['options', 'sas']) {
    const blok = blokSas(nama)
    const posisiJaga = blok.indexOf('await jagaBaseUrlRdm(base_url)')
    const posisiPanggil = blok.indexOf('createRdmClient(')
    assert.ok(posisiJaga > 0, `/api/rapor/rdm/${nama} harus memanggil penjaga SSRF`)
    assert.ok(posisiPanggil > posisiJaga, `penjaga SSRF harus jalan SEBELUM createRdmClient di ${nama}`)
  }
})

test('endpoint options mengembalikan konteks ajar (tahun ajaran & semester)', () => {
  const blok = blokSas('options')
  assert.match(blok, /tahunajaran_id:/)
  assert.match(blok, /semester_id:/)
  assert.match(blok, /nama_kelas:/)
})

test('UI memilih ajar lewat handler yang mengisi tahun ajaran & semester', () => {
  const page = read('src/pages/admin/DataSiswaPage.tsx')
  assert.match(page, /const pilihAjarRdm = \(ajarId: string\)/)
  assert.match(page, /tahunajaran_id/)
  assert.match(page, /onChange=\{e => pilihAjarRdm\(e\.target\.value\)\}/)
  // Tahun ajaran tidak boleh dibiarkan kosong tanpa fallback manual.
  assert.match(page, /tahun_ajaran: taId \? `\$\{taId\}\/\$\{Number\(taId\) \+ 1\}` : v\.tahun_ajaran/)
})

test('halaman admin memanggil kedua endpoint SAS RDM', () => {
  const page = read('src/pages/admin/DataSiswaPage.tsx')
  assert.match(page, /api\.post\('\/rapor\/rdm\/options'/)
  assert.match(page, /api\.post\('\/rapor\/rdm\/sas', \{ \.\.\.rdmForm, commit: true \}\)/)
})

test('connector RDM tidak menyimpan password ke disk/log', () => {
  const conn = read('server/rdm-sas-connector.cjs')
  assert.doesNotMatch(conn, /writeFileSync\([^)]*password/)
  assert.doesNotMatch(conn, /console\.log\([^)]*password/)
})
