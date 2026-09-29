'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSasImportItems } = require('../server/rdm-sas-connector.cjs')

test('buildSasImportItems memetakan SAS RDM ke siswa Jurnalku berdasarkan NIS', () => {
  const result = buildSasImportItems({
    rdmRows: [
      { nis: '250001', nisn: '111', nama: 'A', nilaiSas: 80 },
      { nis: '250002', nisn: '222', nama: 'B', nilaiSas: null },
    ],
    jurnalkuSiswa: [
      { id: 's-1', nis: '250001', nama: 'A' },
      { id: 's-2', nis: '250002', nama: 'B' },
    ],
    mapelId: 'm-1',
  })
  assert.deepEqual(result.items, [{ siswa_id: 's-1', mapel_id: 'm-1', nilai: 80 }])
  assert.equal(result.unmatched.length, 0)
  assert.equal(result.emptyValue.length, 1)
})

test('buildSasImportItems tidak menebak ketika NIS RDM ganda atau tidak ditemukan', () => {
  const result = buildSasImportItems({
    rdmRows: [
      { nis: '1', nama: 'RDM A', nilaiSas: 70 },
      { nis: '1', nama: 'RDM B', nilaiSas: 71 },
      { nis: '9', nama: 'Tidak Ada', nilaiSas: 80 },
    ],
    jurnalkuSiswa: [{ id: 's-1', nis: '1', nama: 'J A' }],
    mapelId: 'm-1',
  })
  assert.equal(result.items.length, 0)
  assert.deepEqual(result.ambiguous.map(x => x.nis), ['1'])
  assert.deepEqual(result.unmatched.map(x => x.nis), ['9'])
})

test('buildSasImportItems menolak mapel kosong dan nilai di luar rentang', () => {
  assert.throws(() => buildSasImportItems({ rdmRows: [], jurnalkuSiswa: [], mapelId: '' }), /mapelId/)
  assert.throws(() => buildSasImportItems({
    rdmRows: [{ nis: '1', nilaiSas: 101 }], jurnalkuSiswa: [{ id: 's', nis: '1' }], mapelId: 'm',
  }), /0 sampai 100/)
})
