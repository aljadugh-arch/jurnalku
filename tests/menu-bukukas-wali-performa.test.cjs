'use strict'
// Kontrak empat perbaikan:
//  1. menu Rapor tidak duplikat (3 entri jadi satu grup)
//  2. Buku Kas punya filter bulan, dan saldo tetap posisi akhir periode
//  3. dashboard wali murid ada dan dipakai untuk peran wali_murid
//  4. jalur awal (modulepreload) tetap ringan
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('menu Rapor tidak duplikat: tiga entri digabung jadi satu grup', () => {
  const menu = baca('src/lib/menuItems.tsx')
  // Hitung kemunculan label tingkat-atas (bukan anak menu).
  const jumlahRaporSiswa = (menu.match(/label: 'Rapor Siswa'/g) || []).length
  const jumlahCetak = (menu.match(/label: 'Cetak & Ekspor Rapor'/g) || []).length
  const jumlahBukuInduk = (menu.match(/label: 'Buku Induk'/g) || []).length
  // Satu untuk admin, satu untuk kepala = 2 masing-masing (sebagai anak grup).
  assert.strictEqual(jumlahRaporSiswa, 2, `Rapor Siswa harus tepat 2 (admin+kepala), dapat ${jumlahRaporSiswa}`)
  assert.strictEqual(jumlahCetak, 2, `Cetak & Ekspor harus tepat 2, dapat ${jumlahCetak}`)
  assert.strictEqual(jumlahBukuInduk, 2, `Buku Induk harus tepat 2, dapat ${jumlahBukuInduk}`)
  // Tidak boleh ada lagi entri tingkat-atas dengan path rapor yang berdiri sendiri.
  const baris = menu.split('\n').filter(l => !l.trim().startsWith('//'))
  const liar = baris.filter(l => /^\s*\{ label: 'Rapor Siswa', icon:/.test(l))
  assert.strictEqual(liar.length, 0, 'Rapor Siswa tidak boleh jadi item tingkat-atas lagi')
})

test('Buku Kas menerima parameter bulan', () => {
  const svc = baca('server/index.cjs')
  const blok = svc.slice(svc.indexOf("app.get('/api/buku-kas'"), svc.indexOf("app.post('/api/buku-kas'"))
  assert.ok(blok.includes('normalisasiBulan(req.query.bulan)'), 'endpoint harus membaca ?bulan=YYYY-MM')
  // Saldo dihitung SEBELUM filter — kalau tidak, "saldo" jadi "mutasi bulan ini".
  const iSaldo = blok.indexOf('saldo += debet - kredit')
  const iFilter = blok.indexOf('if (bulan && !String(row.tanggal')
  assert.ok(iSaldo > 0 && iFilter > 0, 'harus ada akumulasi saldo dan filter bulan')
  assert.ok(iSaldo < iFilter, 'saldo harus diakumulasi SEBELUM baris disaring')
})

test('Buku Kas memakai MonthFilter di UI', () => {
  const ui = baca('src/pages/admin/BukuKasPage.tsx')
  assert.ok(ui.includes('MonthFilter'), 'harus memakai MonthFilter')
  assert.ok(ui.includes('izinkanSemua'), 'harus menyediakan pilihan semua periode')
  assert.ok(/params: bulan \? \{ bulan \}/.test(ui), 'bulan harus dikirim ke API')
})

test('dashboard wali murid ada dan dipakai untuk peran wali_murid', () => {
  const p = path.join(AKAR, 'src/pages/siswa/WaliDashboardPage.tsx')
  assert.ok(fs.existsSync(p), 'WaliDashboardPage harus ada')
  const app = baca('src/App.tsx')
  assert.ok(app.includes('WaliDashboardPage'), 'harus diimpor di App.tsx')
  assert.ok(/user\?\.role === 'wali_murid'\) return <WaliDashboardPage/.test(app),
    'rute index /siswa harus memilih dashboard wali untuk peran wali_murid')
  const wali = baca('src/pages/siswa/WaliDashboardPage.tsx')
  // Pemilih anak wajib: wali bisa punya lebih dari satu anak.
  assert.ok(wali.includes('student_id'), 'harus bisa memilih anak lewat student_id')
  assert.ok(wali.includes('children'), 'harus membaca daftar anak dari API')
  assert.ok(wali.includes('anak.length > 1'), 'pemilih anak muncul bila lebih dari satu')
})

test('jalur awal (modulepreload) tetap ringan', () => {
  const idx = path.join(AKAR, 'dist/index.html')
  if (!fs.existsSync(idx)) return // build belum jalan — lewati
  const html = fs.readFileSync(idx, 'utf8')
  const berkas = [...html.matchAll(/href="(\/assets\/[^"]+)"/g)].map(m => m[1])
  assert.ok(berkas.length > 0, 'harus ada berkas yang di-preload')
  let total = 0
  for (const b of berkas) {
    const f = path.join(AKAR, 'dist', b.replace(/^\//, ''))
    if (!fs.existsSync(f)) continue
    total += zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length
  }
  const kb = Math.round(total / 1024)
  // Anggaran: 250 KB gzip. Sebelum perbaikan 782 KB.
  assert.ok(kb <= 250, `jalur awal harus <= 250 KB gzip, dapat ${kb} KB`)
  // Library berat tidak boleh ikut di preload.
  for (const berat of ['xlsx', 'exceljs', 'tiptap', 'RichEditor', 'recharts', 'BarChart', 'leaflet', 'tesseract']) {
    assert.ok(!berkas.some(b => b.toLowerCase().includes(berat.toLowerCase())),
      `${berat} tidak boleh ada di jalur awal`)
  }
})

test('manualChunks tidak menangkap @tiptap/react sebagai React', () => {
  const v = baca('vite.config.ts')
  const kode = v.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  // Pola lama `id.includes('/react/')` cocok dengan node_modules/@tiptap/react/.
  assert.ok(!/id\.includes\('\/react\/'\)/.test(kode),
    'jangan pakai includes(\'/react/\') — itu menangkap @tiptap/react')
  assert.ok(kode.includes("node_modules/react/"), 'pencocokan React harus menyertakan node_modules/')
})

test('dateFormat tidak menarik xlsx ke jalur awal', () => {
  const df = baca('src/lib/dateFormat.ts')
  // Komentar boleh menyebut xlsx (untuk menjelaskan kenapa dilarang), jadi
  // yang diperiksa hanya baris kode.
  const kode = df.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.ok(!/from ['"]xlsx['"]|require\(['"]xlsx['"]\)/.test(kode), 'dateFormat tidak boleh mengimpor xlsx')
  assert.ok(kode.includes('serialExcelKeIso'), 'harus punya pengganti parse_date_code')
})
