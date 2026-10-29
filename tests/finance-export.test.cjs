'use strict'
// Kontrak ekspor laporan keuangan (Excel + PDF) untuk bendahara/admin.
//
// Mengunci:
//   1. Rentang tanggal bebas (mulai/selesai) untuk laporan harian/mingguan —
//      satu bentuk `rentangTanggal` dipakai tagihan, tabungan, dan buku kas.
//   2. Endpoint baru `/api/tabungan/laporan` — mutasi lintas siswa + nama/NIS.
//   3. Saldo buku kas tetap dihitung atas SEMUA baris (posisi akhir periode),
//      bukan hanya baris yang lolos filter rentang.
//   4. Frontend punya PeriodeFilter (hari/minggu/bulan) dan financeReport
//      (dokumen cetak bersama), dan keempat halaman keuangan memakainya.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const server = baca('server/index.cjs')

function ekstrakFn(sumber, nama) {
  const awal = sumber.indexOf(`function ${nama}`)
  assert.ok(awal >= 0, `fungsi ${nama} harus ada di sumber`)
  const isi = sumber.slice(awal, sumber.indexOf('\n}\n', awal) + 2)
  return new Function(`${isi}; return ${nama}`)()
}

// ---------------- rentangTanggal ----------------
test('rentangTanggal: bentuk dan normalisasi', () => {
  const fn = ekstrakFn(server, 'rentangTanggal')
  assert.deepEqual(fn('2026-10-14', '2026-10-14'), { awal: '2026-10-14', akhir: '2026-10-14' })
  assert.deepEqual(fn('2026-10-20', '2026-10-14'), { awal: '2026-10-14', akhir: '2026-10-20' }, 'rentang terbalik dinormalisasi')
  assert.deepEqual(fn('2026-10-14', 'bukan-tanggal'), { awal: '2026-10-14', akhir: '2026-10-14' }, 'selesai tidak valid -> pakai mulai')
  assert.equal(fn('', ''), null, 'kosong -> null')
  assert.equal(fn('2026-13-01', '2026-10-01'), null, 'bulan tidak valid -> null')
  assert.equal(fn('2026-02-30', ''), null, 'tanggal mustahil -> null')
})

test('rentangTanggal dipakai di /api/tagihan, /api/buku-kas, /api/tabungan/laporan', () => {
  // tagihan: rentang bebas untuk tanggal_bayar (laporan pembayaran harian/mingguan)
  assert.ok(/rentangTanggal\(req\.query\.mulai, req\.query\.selesai\)/.test(server), 'tagihan memakai rentangTanggal')
  // buku kas: rentang hanya menyaring tampilan, saldo tetap dihitung penuh
  const bkBlok = server.slice(server.indexOf("app.get('/api/buku-kas'"), server.indexOf("app.post('/api/buku-kas'"))
  assert.ok(bkBlok.includes('rentangTanggal'), 'buku kas memakai rentangTanggal')
  assert.ok(bkBlok.includes('saldo += debet - kredit') && bkBlok.includes('continue'), 'saldo buku kas dihitung atas semua baris sebelum penyaringan')
})

test('endpoint /api/tabungan/laporan ada dan join siswa+rombel', () => {
  const i = server.indexOf("'/api/tabungan/laporan'")
  assert.ok(i >= 0, 'rute /api/tabungan/laporan harus ada')
  const blok = server.slice(i, server.indexOf('// Ringkasan tabungan per bulan'))
  assert.ok(blok.includes('LEFT JOIN siswa'), 'join siswa untuk nama/NIS')
  assert.ok(blok.includes('LEFT JOIN rombel'), 'join rombel')
  assert.ok(blok.includes('rentangBulan(req.query.bulan)'), 'bulan tetap didukung')
  assert.ok(blok.includes('rentangTanggal(req.query.mulai'), 'rentang bebas didukung')
})

// ---------------- frontend ----------------
test('PeriodeFilter (hari/minggu/bulan) dan labelPeriode ada', () => {
  const pf = baca('src/components/PeriodeFilter.tsx')
  for (const nama of ['rentangPeriode', 'labelPeriode', 'seninMinggu', 'tanggalLokal']) {
    assert.ok(pf.includes(`export function ${nama}`), `PeriodeFilter harus mengekspor ${nama}`)
  }
  for (const mode of ['hari', 'minggu', 'bulan']) {
    assert.ok(pf.includes(`'${mode}'`), `mode ${mode} harus ada`)
  }
})

test('financeReport adalah satu pembangun dokumen cetak bersama', () => {
  const fr = baca('src/utils/financeReport.ts')
  assert.ok(fr.includes('export function financeReportHtml'), 'financeReportHtml diekspor')
  assert.ok(fr.includes('export function openFinanceReport'), 'openFinanceReport diekspor')
  assert.ok(fr.includes('signatureBlockHtml'), 'memakai blok tanda tangan bersama')
  assert.ok(fr.includes('SIGNATURE_CSS'), 'memakai CSS tanda tangan bersama')
  assert.ok(fr.includes("leftTitle: opts.signerTitle || 'Bendahara'"), 'penandatangan kiri default Bendahara')
})

test('keempat halaman keuangan memakai financeReport + unduhExcel', () => {
  const halaman = [
    'src/pages/admin/TagihanPage.tsx',
    'src/pages/admin/TabunganPage.tsx',
    'src/pages/admin/BukuKasPage.tsx',
    'src/pages/admin/LaporanKeuanganPage.tsx',
  ]
  for (const p of halaman) {
    const isi = baca(p)
    assert.ok(isi.includes('openFinanceReport'), `${p} harus memakai openFinanceReport (PDF)`)
    assert.ok(isi.includes('unduhExcel'), `${p} harus memakai unduhExcel (Excel)`)
    assert.ok(isi.includes('PeriodeFilter'), `${p} harus memakai PeriodeFilter`)
  }
})
