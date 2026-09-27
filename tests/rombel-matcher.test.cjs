const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveRombel } = require('../server/rombel-matcher.cjs')

const rombels = [
  { id: 'i-1', nama: 'I-1' },
  { id: 'ii-a', nama: 'II-A' },
  { id: 'vii-a', nama: 'VII-A' },
  { id: 'vii-b', nama: 'VII-B' },
]

const rombelsAmbigu = [
  { id: 'i-1', nama: 'I-1' },
  { id: 'i-2', nama: 'I-2' },
]

test('angka tingkat tunggal dipetakan ke satu-satunya rombel tingkat yang cocok', () => {
  assert.deepEqual(resolveRombel('1', [{ id: 'kelas-1', nama: 'KELAS 1' }]), {
    id: 'kelas-1',
    nama: 'KELAS 1',
  })
})

test('angka tingkat tunggal tidak dipetakan jika ada beberapa kandidat', () => {
  assert.deepEqual(resolveRombel('1', rombelsAmbigu), {
    error: 'Rombel "1" ambigu. Gunakan nama lengkap: I-1, I-2',
  })
})

test('kode kelas angka dan huruf tetap cocok dengan romawi-huruf', () => {
  assert.deepEqual(resolveRombel('7a', rombels), { id: 'vii-a', nama: 'VII-A' })
})

test('nama rombel persis lebih diprioritaskan', () => {
  assert.deepEqual(resolveRombel('I-1', rombels), { id: 'i-1', nama: 'I-1' })
})

test('rombel yang tidak ada menampilkan kandidat yang relevan', () => {
  assert.deepEqual(resolveRombel('2', [{ id: 'kelas-1', nama: 'KELAS 1' }]), {
    error: 'Rombel "2" tidak ditemukan. Rombel tersedia: KELAS 1',
  })
})
