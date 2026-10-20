'use strict'
// Kontrak filter per bulan untuk dashboard bendahara.
//
// Alasan kontrak ini ada: sebelumnya laporan keuangan memakai dua input tanggal
// bebas, tagihan tidak punya filter periode sama sekali, dan kartu dashboard
// hanya mengenal "bulan ini" yang ditanam di SQL. Bendahara tidak bisa menjawab
// pertanyaan sederhana seperti "SPP Oktober terkumpul berapa" tanpa menghitung
// manual. Kontrak ini mengunci tiga hal:
//
//   1. Satu bentuk parameter periode untuk semua endpoint: `bulan=YYYY-MM`.
//   2. Tagihan membedakan periode TAGIHAN dan periode PEMBAYARAN — dua angka
//      yang berbeda dan keduanya dipakai untuk keputusan berbeda.
//   3. Filter periode tidak boleh mengubah arti saldo: saldo adalah posisi
//      terkini, mutasi adalah angka per bulan.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const server = baca('server/index.cjs')

// ---------------- bentuk parameter ----------------
test('semua endpoint laporan keuangan menerima parameter bulan YYYY-MM', () => {
  for (const rute of [
    '/api/keuangan/laporan',
    '/api/bendahara/dashboard',
    '/api/tagihan',
    '/api/tabungan',
    '/api/tabungan/ringkasan-bulanan',
  ]) {
    assert.ok(server.includes(`'${rute}'`), `rute ${rute} harus ada`)
  }
  // Helper periode harus dipakai, bukan regex ad-hoc di tiap rute.
  assert.ok(server.includes('function normalisasiBulan'), 'harus ada normalisasiBulan')
  assert.ok(server.includes('function rentangBulan'), 'harus ada rentangBulan')
  assert.ok(server.includes('function bulanTeks'), 'harus ada bulanTeks untuk tagihan (bulan disimpan sebagai teks)')
})

test('normalisasiBulan hanya menerima YYYY-MM yang valid', () => {
  // Diekstrak dari sumber, bukan diimpor: server/index.cjs punya efek samping
  // (membuka DB, listen port) sehingga tidak bisa di-require di tes unit.
  const isi = server.slice(server.indexOf('function normalisasiBulan'), server.indexOf('function rentangBulan'))
  const fn = new Function(`${isi}; return normalisasiBulan`)()
  assert.equal(fn('2026-10'), '2026-10')
  assert.equal(fn('2026-1'), '', 'bulan satu digit harus ditolak')
  assert.equal(fn('2026-13'), '', 'bulan 13 harus ditolak')
  assert.equal(fn(''), '')
  assert.equal(fn('oktober'), '')
  assert.equal(fn(null), '')
})

test('rentangBulan menghitung akhir bulan dengan benar termasuk Februari kabisat', () => {
  const isiNorm = server.slice(server.indexOf('function normalisasiBulan'), server.indexOf('function rentangBulan'))
  const isi = server.slice(server.indexOf('function rentangBulan'), server.indexOf('function bulanTeks'))
  const fn = new Function(`${isiNorm}; ${isi}; return rentangBulan`)()
  assert.deepEqual(fn('2026-10'), { awal: '2026-10-01', akhir: '2026-10-31' })
  assert.deepEqual(fn('2026-02'), { awal: '2026-02-01', akhir: '2026-02-28' })
  assert.deepEqual(fn('2024-02'), { awal: '2024-02-01', akhir: '2024-02-29' }, '2024 kabisat')
  assert.deepEqual(fn('2026-04'), { awal: '2026-04-01', akhir: '2026-04-30' })
  assert.equal(fn(''), null)
})

test('bulanTeks memetakan YYYY-MM ke nama bulan Indonesia', () => {
  const isi = server.slice(server.indexOf('const NAMA_BULAN_ID'), server.indexOf('app.get(\'/api/keuangan/laporan\''))
  const fn = new Function(`${isi}; return bulanTeks`)()
  assert.deepEqual(fn('2026-10'), { bulan: 'Oktober', tahun: '2026' })
  assert.deepEqual(fn('2026-01'), { bulan: 'Januari', tahun: '2026' })
  assert.deepEqual(fn('2026-12'), { bulan: 'Desember', tahun: '2026' })
  assert.equal(fn(''), null)
})

// ---------------- tagihan: dua dasar periode ----------------
test('tagihan membedakan bulan tagihan dan bulan bayar', () => {
  const blok = server.slice(server.indexOf("app.get('/api/tagihan'"), server.indexOf("app.post('/api/tagihan/generate'"))
  assert.ok(blok.includes("req.query.bulan"), 'harus membaca bulan tagihan')
  assert.ok(blok.includes("req.query.bulan_bayar"), 'harus membaca bulan bayar')
  assert.ok(/lower\(trim\(t\.bulan\)\)\s*=\s*lower\(\?\)/.test(blok), 'filter bulan tagihan harus case-insensitive')
  assert.ok(blok.includes('t.tanggal_bayar >='), 'filter bulan bayar memakai tanggal_bayar')
  // Alasan pemisahan ini ditulis di kode supaya tidak "dirapikan" nanti.
  assert.ok(/TAGIHAN/.test(blok) && /PEMBAYARAN/.test(blok), 'alasan dua dasar harus terdokumentasi')
})

// ---------------- dashboard: kartu ikut bulan ----------------
test('dashboard bendahara memakai parameter bulan, bukan bulan berjalan yang ditanam', () => {
  const blok = server.slice(server.indexOf("app.get('/api/bendahara/dashboard'"), server.indexOf("app.get('/api/panduan'"))
  assert.ok(blok.includes('normalisasiBulan(req.query.bulan)'), 'harus menerima bulan dari query')
  assert.ok(!blok.includes("strftime('%Y-%m','now')"), 'tidak boleh mengunci bulan berjalan di SQL')
  for (const kunci of ['tabungan_setor', 'tabungan_tarik', 'kas_masuk', 'kas_keluar', 'tagihan_bulan_ini', 'bulan_tersedia']) {
    assert.ok(blok.includes(kunci), `dashboard harus mengembalikan ${kunci}`)
  }
  // "Lunas" harus dari tanggal bayar: uang masuk saat dibayar.
  assert.ok(/tanggal_bayar >= \?/.test(blok), 'lunas dihitung dari tanggal_bayar')
})

test('laporan keuangan mengembalikan daftar bulan yang ada datanya', () => {
  const blok = server.slice(server.indexOf("app.get('/api/keuangan/laporan'"), server.indexOf("// ==================== BUKU KAS BENDAHARA"))
  assert.ok(blok.includes('bulan_tersedia'), 'pemilih bulan butuh daftar bulan berisi data')
  assert.ok(blok.includes('periode'), 'respons harus menyertakan periode yang dipakai')
})

// ---------------- tabungan: saldo vs mutasi ----------------
test('ringkasan tabungan bulanan memisahkan saldo terkini dari mutasi bulan', () => {
  const blok = server.slice(server.indexOf("app.get('/api/tabungan/ringkasan-bulanan'"), server.indexOf("app.get('/api/tabungan/saldo'"))
  assert.ok(blok.includes('saldo_total'), 'harus ada saldo total')
  assert.ok(/saldo_total[\s\S]*?WHERE tenant_id=\?/.test(blok), 'saldo total TIDAK boleh difilter bulan')
  assert.ok(blok.includes("tipe='setor' AND tanggal >= ?"), 'setoran difilter bulan')
  assert.ok(blok.includes('penabung'), 'jumlah siswa yang menabung per bulan')
})

// ---------------- frontend ----------------
test('satu komponen pemilih bulan dipakai semua halaman keuangan', () => {
  assert.ok(fs.existsSync(path.join(AKAR, 'src/components/MonthFilter.tsx')), 'MonthFilter harus ada')
  const komponen = baca('src/components/MonthFilter.tsx')
  assert.ok(komponen.includes('YYYY-MM') || komponen.includes('bulanSekarang'), 'harus memakai format YYYY-MM')
  assert.ok(komponen.includes('bulanSekarang'), 'harus menyediakan bulan berjalan lokal')
  // toISOString memakai UTC: tanggal 1 pagi WIB terbaca bulan sebelumnya.
  assert.ok(/getFullYear\(\)/.test(komponen), 'bulan berjalan harus dihitung dari waktu lokal, bukan toISOString')

  for (const [file, penanda] of [
    ['src/pages/admin/BendaharaDashboard.tsx', 'MonthFilter'],
    ['src/pages/admin/MobileBendaharaDashboard.tsx', 'MonthFilter'],
    ['src/pages/admin/LaporanKeuanganPage.tsx', 'MonthFilter'],
    ['src/pages/admin/TabunganPage.tsx', 'MonthFilter'],
    ['src/pages/admin/TagihanPage.tsx', 'MonthFilter'],
  ]) {
    const isi = baca(file)
    assert.ok(isi.includes(penanda), `${file} harus memakai MonthFilter`)
  }
})

test('dashboard bendahara mengirim bulan ke API dan menampilkan periode', () => {
  const isi = baca('src/pages/admin/BendaharaDashboard.tsx')
  assert.ok(isi.includes("api.get('/bendahara/dashboard', { params: { bulan"), 'harus mengirim parameter bulan')
  assert.ok(isi.includes('labelBulan'), 'harus menampilkan nama bulan, bukan kode YYYY-MM mentah')
})

test('halaman tagihan punya sakelar dasar periode', () => {
  const isi = baca('src/pages/admin/TagihanPage.tsx')
  assert.ok(isi.includes("dasarBulan"), 'harus ada state dasar perhitungan')
  assert.ok(isi.includes("params.bulan_bayar"), 'harus bisa mengirim bulan_bayar')
  assert.ok(isi.includes('Bulan tagihan') && isi.includes('Bulan bayar'), 'kedua pilihan harus terlihat')
})

test('pemilih bulan menandai bulan tanpa data', () => {
  const isi = baca('src/components/MonthFilter.tsx')
  assert.ok(isi.includes('kosong'), 'bulan tanpa data harus ditandai agar tidak menebak')
})
