// Dashboard siswa/wali — jaminan data yang tampil.
//
// Regresi yang dijaga berkas ini:
//   1. Akun siswa WAJIB punya baris user_students. Halaman Nilai Siswa dan
//      seluruh portal (tabungan/tagihan/QRIS/kantin) membaca siswa dari tabel
//      itu; sebelumnya akun yang dibuat otomatis dari Data Siswa hanya mengisi
//      users.siswa_id/nis, sehingga dashboard siswa tampak KOSONG ("Akun siswa
//      harus tertaut tepat satu siswa") padahal nilai/tagihan/tabungannya ada.
//   2. Nilai harian dibulatkan ke 0-100 di server (bukan hanya lewat min/max
//      kolom input HTML) supaya 909/1001 tidak pernah tersimpan & tampil.
//   3. Dashboard siswa mengirim nilai harian, absensi, tagihan, tabungan,
//      tugas, jadwal, dan catatan kepribadian.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-siswa-00000000000'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('akun siswa otomatis ditautkan ke user_students', () => {
  const idx = read('server/index.cjs')
  const start = idx.indexOf('function ensureStudentUser(')
  const blok = idx.slice(start, idx.indexOf('\n// Migrate jadwal.mapel_id', start))
  assert.match(blok, /INSERT OR IGNORE INTO user_students/)
  assert.match(blok, /const tautkan = userId =>/)
  // Dipanggil di KEDUA jalur: akun baru maupun akun yang sudah ada.
  assert.equal((blok.match(/tautkan\(/g) || []).length, 2, 'tautkan harus dipanggil di jalur baru & jalur lama')
})

test('server mem-backfill tautan user_students untuk akun siswa lama', () => {
  const idx = read('server/index.cjs')
  assert.match(idx, /Backfill tautan user_students/)
  const blok = idx.slice(idx.indexOf('// Backfill tautan user_students'))
  assert.match(blok.slice(0, 900), /INSERT OR IGNORE INTO user_students/)
  assert.match(blok.slice(0, 900), /WHERE u\.role='siswa' AND u\.siswa_id IS NOT NULL/)
  // Jalur kedua lewat NIS/NISN untuk akun yang siswa_id-nya belum terisi.
  assert.match(blok.slice(0, 1600), /s\.nis=u\.nis OR \(u\.nisn IS NOT NULL/)
})

test('route nilai siswa memakai fallback tautan, bukan query mentah', () => {
  const idx = read('server/index.cjs')
  assert.match(idx, /function linkedStudentIdsFor\(tenantId, userId, role, nis\)/)
  for (const route of ["app.get('/api/siswa/penilaian'", "app.get('/api/siswa/penilaian/rekap'"]) {
    const start = idx.indexOf(route)
    assert.ok(start > 0, `${route} harus ada`)
    const blok = idx.slice(start, start + 700)
    assert.match(blok, /linkedStudentIdsFor\(req\.tenantId, req\.user\.id, req\.user\.role, req\.user\.nis\)/)
    assert.doesNotMatch(blok, /SELECT student_id FROM user_students/)
  }
})

test('portal cashless punya fallback tautan siswa', () => {
  const portal = read('server/portal-cashless.cjs')
  const start = portal.indexOf('const linkedStudentIds = (db, t, u) => {')
  assert.ok(start > 0, 'linkedStudentIds harus jadi fungsi dengan fallback')
  const blok = portal.slice(start, start + 1100)
  assert.match(blok, /users WHERE id=\? AND tenant_id=\?/)
  assert.match(blok, /row\.siswa_id/)
  assert.match(blok, /row\.role === 'siswa' && row\.nis/)
})

test('nilai harian dibulatkan ke 0-100 di server pada semua jalur tulis', () => {
  const idx = read('server/index.cjs')
  for (const route of [
    "app.post('/api/penilaian-harian'",
    "app.post('/api/penilaian-harian/bulk'",
    "app.put('/api/penilaian-harian/:id'",
  ]) {
    const start = idx.indexOf(route)
    assert.ok(start > 0, `${route} harus ada`)
    const blok = idx.slice(start, start + 1600)
    assert.match(blok, /clampNilai\(/, `${route} harus memakai clampNilai`)
  }
})

test('clampNilai benar-benar membatasi 0-100', () => {
  const { clampNilai } = require('../server/nilai-import-service.cjs')
  assert.equal(clampNilai(909), 100)
  assert.equal(clampNilai(1001), 100)
  assert.equal(clampNilai(-5), 0)
  assert.equal(clampNilai(87.6), 88)
  assert.equal(clampNilai('90'), 90)
  assert.equal(clampNilai(undefined), 0)
})

test('dashboard siswa mengirim nilai, absensi, tagihan, tabungan, tugas, jadwal', () => {
  const idx = read('server/index.cjs')
  const start = idx.indexOf("app.get('/api/siswa/dashboard'")
  const blok = idx.slice(start, idx.indexOf('// ==================== SISWA JADWAL', start))
  for (const key of ['nilai_detail', 'tagihan_detail', 'tabungan_detail', 'absensi_detail', 'tugas', 'jadwal_hari_ini', 'catatan_kepribadian']) {
    assert.ok(blok.includes(key), `payload dashboard harus memuat ${key}`)
  }
  // Rekap per kategori kehadiran disebar dari studentAttendance (bukan ditulis
  // literal di payload) — pastikan spread-nya masih ada.
  assert.match(blok, /\.\.\.attendance/)
  assert.match(read('server/attendance-summary.cjs'), /rekap_kehadiran: \{/)
  // Nilai rapor dipakai sebagai cadangan bila penilaian harian belum ada.
  assert.match(blok, /nilaiAll = nilai_detail\.length \? nilai_detail : nilaiRapor/)
})

test('dashboard wali murid memilih anak pertama sebagai default', () => {
  const idx = read('server/index.cjs')
  const start = idx.indexOf("app.get('/api/siswa/dashboard'")
  const blok = idx.slice(start, idx.indexOf('// ==================== SISWA JADWAL', start))
  // Wali dengan >1 anak tidak boleh menerima payload kosong.
  assert.match(blok, /req\.user\.role === 'wali_murid' && linked\.length >= 1/)
})

test('dashboard siswa mobile menampilkan nilai, tagihan, dan tabungan', () => {
  const mobile = read('src/pages/siswa/MobileSiswaDashboard.tsx')
  assert.ok(mobile.includes('data?.nilai_detail'), 'kartu ringkasan nilai harus ada')
  assert.ok(mobile.includes('data?.tagihan?.belum_bayar'), 'ringkasan tagihan harus ada')
  assert.ok(mobile.includes('data?.tabungan?.saldo'), 'ringkasan saldo tabungan harus ada')
  assert.match(mobile, /rupiahSingkat/)
  assert.match(mobile, /Nilai Terbaru/)
})

test('UI dashboard siswa merender setiap blok data', () => {
  const page = read('src/pages/siswa/SiswaDashboard.tsx')
  for (const key of ['data.nilai_detail', 'data.tagihan_detail', 'data.tabungan_detail', 'data.rekap_kehadiran', 'data.tugas', 'data.jadwal_hari_ini', 'data.catatan_kepribadian']) {
    assert.ok(page.includes(key), `SiswaDashboard harus memakai ${key}`)
  }
  const mobile = read('src/pages/siswa/MobileSiswaDashboard.tsx')
  // Mobile: 8 pintasan termasuk Nilai, Tugas, Keuangan, Tabungan.
  for (const label of ["'Nilai'", "'Tugas'", "'Keuangan'", "'Tabungan'"]) {
    assert.ok(mobile.includes(label), `MobileSiswaDashboard harus punya pintasan ${label}`)
  }
})

test('halaman Nilai Siswa memuat riwayat harian & rekap per mapel', () => {
  const page = read('src/pages/siswa/SiswaNilaiPage.tsx')
  assert.match(page, /api\.get\('\/siswa\/penilaian'\)/)
  assert.match(page, /api\.get\('\/siswa\/penilaian\/rekap'\)/)
  assert.match(page, /Riwayat Penilaian Harian/)
})

test('halaman tabungan & tagihan siswa tersedia di route dan menu', () => {
  const app = read('src/App.tsx')
  for (const r of ['path="tabungan"', 'path="tagihan"', 'path="nilai"', 'path="tugas"']) {
    assert.ok(app.includes(r), `route ${r} harus ada`)
  }
  const menu = read('src/lib/menuItems.tsx')
  // Kontrak diperbarui: anchor hash (/siswa#tabungan) dihapus karena mati di
  // WaliDashboardPage dan diganti route nyata. Menu siswa & wali memakai route
  // asli /siswa/tabungan dan /siswa/tagihan.
  assert.ok(menu.includes("'/siswa/tabungan'") && menu.includes("'/siswa/tagihan'"))
})

test('tagihan siswa bisa dibayar QRIS dari halaman tagihan', () => {
  const page = read('src/pages/siswa/SiswaSectionPage.tsx')
  assert.match(page, /QrisPayModal/)
  assert.match(page, /JALUR_PORTAL/)
  assert.match(page, /ref_type: 'tagihan'/)
  // Tombol bayar hanya tampil bila gateway lembaga aktif.
  assert.match(page, /portal\/payment-gateway/)
  assert.match(page, /gatewayAktif && siswaId/)
  assert.match(page, /Pembayaran online belum diaktifkan lembaga/)
})

test('intent tagihan portal mengunci ke siswa tertaut (bukan student_id kiriman)', () => {
  const gw = read('server/payment-gateway-routes.cjs')
  const start = gw.indexOf("app.post('/api/portal/payment-intent'")
  const blok = gw.slice(start, start + 1400)
  assert.match(blok, /ref_type === 'tagihan'/)
  assert.match(blok, /studentId = tg\.siswa_id/)
  assert.match(blok, /if \(!anak\.has\(studentId\)\) return res\.status\(403\)/)
})

test('pembayaran tagihan sukses menandai lunas + metode qris (idempoten)', () => {
  const gw = read('server/payment-gateway.cjs')
  assert.match(gw, /UPDATE tagihan SET status='lunas'/)
  assert.match(gw, /metode_bayar='qris'/)
  assert.match(gw, /function applierTagihan/)
  assert.match(gw, /if \(intent\.ref_type === 'tagihan'\) return applierTagihan\(db, intent\)/)
})
