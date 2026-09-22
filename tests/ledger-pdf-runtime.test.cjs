const test = require('node:test')
const assert = require('node:assert/strict')
const { createLedgerPdf } = require('../server/ledger-service.cjs')

test('createLedgerPdf menghasilkan dokumen PDF valid (buffer non-kosong)', async () => {
  const rows = [
    { siswa_id: 's-a', siswa_nama: 'Ani', siswa_nis: '1001', mapel_id: 'm-a', mapel_nama: 'Matematika',
      nilai_harian: 73, nilai_sts: 0, nilai_sas: 90, nilai_akhir_sts: null, nilai_akhir_sas: null },
    { siswa_id: 's-b', siswa_nama: 'Budi', siswa_nis: '1002', mapel_id: 'm-b', mapel_nama: 'IPA',
      nilai_harian: 0, nilai_sts: null, nilai_sas: null, nilai_akhir_sts: null, nilai_akhir_sas: null },
  ]
  const doc = createLedgerPdf(rows, { rombelNama: '7A', tahunAjaran: '2026/2027', semester: 'ganjil' })
  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise(resolve => doc.on('end', resolve))
  doc.end()
  await done
  const buf = Buffer.concat(chunks)
  assert.ok(buf.length > 500)
  assert.equal(buf.subarray(0, 4).toString(), '%PDF')
})

test('createLedgerPdf tidak error dengan banyak baris (memicu page break)', async () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    siswa_id: `s-${i}`, siswa_nama: `Siswa ${i}`, siswa_nis: String(1000 + i), mapel_id: 'm-a', mapel_nama: 'Matematika',
    nilai_harian: i, nilai_sts: i, nilai_sas: null, nilai_akhir_sts: null, nilai_akhir_sas: null,
  }))
  const doc = createLedgerPdf(rows, { rombelNama: '7A', tahunAjaran: '2026/2027', semester: 'genap' })
  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise(resolve => doc.on('end', resolve))
  doc.end()
  await done
  const buf = Buffer.concat(chunks)
  assert.ok(buf.length > 1000)
  assert.equal(buf.subarray(0, 4).toString(), '%PDF')
})
