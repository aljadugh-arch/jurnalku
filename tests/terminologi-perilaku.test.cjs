'use strict'
// Uji PERILAKU (bukan regex sumber) untuk pemetaan jenjang -> tipe institusi
// dan sebutan. Fungsi murni ditranspilasi dengan typescript.transpileModule
// supaya bisa di-require langsung di node --test.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')

const root = path.join(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jurnalku-terminologi-'))

function transpile(rel, outName) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  fs.writeFileSync(path.join(tmp, outName), js)
}

transpile('src/lib/jenjang.ts', 'jenjang.js')
transpile('src/lib/terminologi-peta.ts', 'terminologi-peta.js')

const jenjang = require(path.join(tmp, 'jenjang.js'))
const peta = require(path.join(tmp, 'terminologi-peta.js'))

test('labelInstitusi: MTs (bukan hanya MTS besar) tetap Madrasah', () => {
  assert.equal(jenjang.labelInstitusi('MTs'), 'Madrasah')
  assert.equal(jenjang.labelInstitusi('MTS'), 'Madrasah')
  assert.equal(jenjang.labelInstitusi('MI'), 'Madrasah')
  assert.equal(jenjang.labelInstitusi('MA'), 'Madrasah')
  assert.equal(jenjang.labelInstitusi('SD'), 'Sekolah')
  assert.equal(jenjang.labelInstitusi('SMP'), 'Sekolah')
  assert.equal(jenjang.labelInstitusi('PT'), 'Perguruan Tinggi')
  assert.equal(jenjang.labelInstitusi('NF'), 'Lembaga')
})

test('deriveTipeInstitusi memetakan jenjang dengan benar', () => {
  assert.equal(peta.deriveTipeInstitusi('MTs'), 'madrasah')
  assert.equal(peta.deriveTipeInstitusi('MI'), 'madrasah')
  assert.equal(peta.deriveTipeInstitusi('SD'), 'sekolah')
  assert.equal(peta.deriveTipeInstitusi('SMA'), 'sekolah')
  assert.equal(peta.deriveTipeInstitusi('PT'), 'perguruan_tinggi')
  assert.equal(peta.deriveTipeInstitusi('Perguruan Tinggi'), 'perguruan_tinggi')
  assert.equal(peta.deriveTipeInstitusi('Pesantren'), 'pesantren')
  assert.equal(peta.deriveTipeInstitusi('NF'), 'diklat')
})

test('sebutan per tipe sesuai (siswa/guru/mapel/rombel)', () => {
  const pt = peta.terminologiUntuk('perguruan_tinggi')
  assert.equal(pt.siswa, 'Mahasiswa')
  assert.equal(pt.guru, 'Dosen')
  assert.equal(pt.mapel, 'Mata Kuliah')
  assert.equal(pt.nis, 'NIM')

  const santri = peta.terminologiUntuk('pesantren')
  assert.equal(santri.siswa, 'Santri')
  assert.equal(santri.guru, 'Ustadz/Ustadzah')

  const karyawan = peta.terminologiUntuk('perusahaan')
  assert.equal(karyawan.siswa, 'Karyawan')
  assert.equal(karyawan.guru, 'Trainer')

  assert.equal(peta.terminologiUntuk('madrasah').siswa, 'Siswa')
  assert.equal(peta.terminologiUntuk('tidak-dikenal').siswa, 'Peserta Didik')
})

test('terapkanTerminologi mengganti label menu', () => {
  const pt = peta.terminologiUntuk('perguruan_tinggi')
  assert.equal(peta.terapkanTerminologi('Data Siswa', pt), 'Data Mahasiswa')
  assert.equal(peta.terapkanTerminologi('Data GTK', pt), 'Data Dosen')
  assert.equal(peta.terapkanTerminologi('Mata Pelajaran', pt), 'Mata Kuliah')
  assert.equal(peta.terapkanTerminologi('Rombongan Belajar', pt), 'Kelas')

  const santri = peta.terminologiUntuk('pesantren')
  assert.equal(peta.terapkanTerminologi('Data Siswa', santri), 'Data Santri')
  assert.equal(peta.terapkanTerminologi('Rombongan Belajar', santri), 'Halaqah')

  const umum = peta.terminologiUntuk('umum')
  assert.equal(peta.terapkanTerminologi('Data Siswa', umum), 'Data Peserta')
})

test('pilihan tipe lembaga mencakup jenis yang diminta', () => {
  const nilai = peta.TIPE_INSTITUSI_OPTIONS.map(o => o.value)
  for (const t of ['madrasah', 'sekolah', 'pesantren', 'perguruan_tinggi', 'diklat', 'kursus', 'bimbel', 'perusahaan', 'swasta', 'umum']) {
    assert.ok(nilai.includes(t), 'tipe harus ada: ' + t)
  }
})
