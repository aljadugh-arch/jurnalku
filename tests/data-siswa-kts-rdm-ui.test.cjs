'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')

test('Data Siswa memiliki pilih semua dan filter jenis kelamin', () => {
  const source = fs.readFileSync('src/pages/admin/DataSiswaPage.tsx', 'utf8')
  assert.match(source, /Pilih Semua/)
  assert.match(source, /Filter jenis kelamin/)
  assert.match(source, /value="L".*Laki-laki/s)
  assert.match(source, /value="P".*Perempuan/s)
})

test('Data Siswa menyediakan menu Sinkron SAS RDM dengan preview dan commit', () => {
  const source = fs.readFileSync('src/pages/admin/DataSiswaPage.tsx', 'utf8')
  assert.match(source, /Sinkron SAS RDM/)
  assert.match(source, /Ambil Data RDM/)
  assert.match(source, /handleRdmCommit/)
  assert.match(source, /\/rapor\/rdm\/sas/)
})
