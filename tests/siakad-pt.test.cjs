// SIAKAD PT: KRS, nilai per mata kuliah, KHS/IPK. Hanya jenjang perguruan tinggi.
// Fungsi bobotNilai & hitungIpk murni (tanpa DB) sehingga bisa diuji langsung.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { bobotNilai, hitungIpk } = require('../server/siakad-pt.cjs')
const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('bobotNilai memetakan huruf & angka ke skala 4', () => {
  assert.equal(bobotNilai('A'), 4)
  assert.equal(bobotNilai('B'), 3)
  assert.equal(bobotNilai('C'), 2)
  assert.equal(bobotNilai(3.75), 3.75)
  assert.equal(bobotNilai('E'), 0)
  assert.equal(bobotNilai(''), null)
})

test('hitungIpk menghitung IP per semester + IPK kumulatif', () => {
  const rows = [
    { semester: 'Ganjil', sks: 3, nilai_huruf: 'A' },   // 4*3
    { semester: 'Ganjil', sks: 3, nilai_huruf: 'B' },   // 3*3
    { semester: 'Genap', sks: 2, nilai_angka: 4 },      // 4*2
  ]
  const r = hitungIpk(rows)
  // Ganjil: (12+9)/6 = 3.5 ; Genap: 8/2 = 4 ; IPK: (12+9+8)/8 = 3.625 -> 3.63
  assert.equal(r.khs.find(k => k.semester === 'Ganjil').ip, 3.5)
  assert.equal(r.khs.find(k => k.semester === 'Genap').ip, 4)
  assert.equal(r.ipk, 3.63)
  assert.equal(r.total_sks, 8)
})

test('tabel & route KRS/nilai ada', () => {
  const s = baca('server/siakad-pt.cjs')
  for (const t of ['krs', 'krs_item', 'krs_nilai']) assert.match(s, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`), `tabel ${t}`)
  for (const r of ['/api/krs', '/api/krs-nilai', '/api/krs-khs']) assert.match(s, new RegExp(`app\\.(get|post|put|delete)\\(['"\`]${r}`), `route ${r}`)
  assert.match(s, /PT_ONLY/, 'gerbang jenjang PT')
})

test('wiring + gerbang FE', () => {
  const idx = baca('server/index.cjs')
  assert.match(idx, /setupSiakadPtTables\(db\)/, 'setup')
  assert.match(idx, /registerSiakadPtRoutes\(app, \{ db, requireRole, getTenantSettings \}\)/, 'register')
  const sub = baca('server/subscription.cjs')
  assert.match(sub, /penilaian: \[[^\]]*'\/api\/krs'/, 'prefix penilaian mencakup /api/krs')
  const fa = baca('src/lib/featureAccess.ts')
  assert.match(fa, /jenjangPerguruanTinggi/, 'helper jenjang PT FE')
  assert.match(fa, /'\/admin\/siakad-pt'/, 'path siakad-pt di rules')
  assert.match(fa, /path\.startsWith\('\/admin\/siakad-pt'\)/, 'gate jenjang PT di pathEnabled')
})
