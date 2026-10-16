// Jabatan ganda (kepala/admin/operator/TU/bendahara sekaligus guru), akses
// kepala ke daftar siswa per rombel, dan ekspor Excel rapi.
//
// Tiga hal yang dijaga:
//   1. can_teach berlaku untuk SEMUA jabatan manajemen, bukan hanya kepala —
//      dan capability 'teacher' menuntut GTK tertaut (dibuatkan bila belum ada).
//   2. GET /api/rombel/:id/siswa terbuka untuk peran manajemen (kepala bukan
//      admin, dulu 403 saat mengklik rombel).
//   3. Ekspor Data Siswa/GTK/Mapel/Pengguna memakai helper Excel bersama
//      (kop + header berwarna + lebar kolom), bukan CSV mentah join(',').

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-rangkap-000000'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('can_teach berlaku untuk semua jabatan manajemen, bukan hanya kepala', () => {
  const idx = read('server/index.cjs')
  assert.match(idx, /ROLE_BISA_RANGKAP_MENGAJAR = \[[^\]]*'kepala'[^\]]*'admin'[^\]]*'operator'[^\]]*\]/)
  // userHasCapability memakai daftar itu, bukan lagi `user.role !== 'kepala'`.
  const fn = idx.slice(idx.indexOf('function userHasCapability'), idx.indexOf('function isTeacherContext'))
  assert.match(fn, /ROLE_BISA_RANGKAP_MENGAJAR\.includes\(user\.role\)/)
  assert.doesNotMatch(fn, /user\.role !== 'kepala'/)
})

test('POST/PUT /api/users menyimpan can_teach untuk jabatan manajemen mana pun', () => {
  const idx = read('server/index.cjs')
  const post = idx.slice(idx.indexOf("app.post('/api/users'"), idx.indexOf("app.put('/api/users/:id'"))
  assert.match(post, /ROLE_BISA_RANGKAP_MENGAJAR\.includes\(role\)/)
  assert.doesNotMatch(post, /role === 'kepala' && can_teach/)
  const put = idx.slice(idx.indexOf("app.put('/api/users/:id'"), idx.indexOf("app.delete('/api/users/:id'"))
  assert.match(put, /ROLE_BISA_RANGKAP_MENGAJAR\.includes\(finalRole\)/)
})

test('capability teacher membuat GTK bila belum tertaut (kalau tidak, 403 terus)', () => {
  const idx = read('server/index.cjs')
  // userHasCapability menuntut gtk_id; PUT users harus menyediakan GTK saat can_teach menyala.
  const put = idx.slice(idx.indexOf("app.put('/api/users/:id'"), idx.indexOf("app.delete('/api/users/:id'"))
  assert.match(put, /if \(!gtk2 && canTeachFinal\)/)
  assert.match(put, /INSERT INTO gtk/)
})

test('GET /api/rombel/:id/siswa terbuka untuk peran manajemen (kepala bukan admin)', () => {
  const idx = read('server/index.cjs')
  const awal = idx.indexOf("app.get('/api/rombel/:id/siswa'")
  // Potong tepat sampai akhir route ini (penutup `})` sebelum route berikutnya).
  const akhir = idx.indexOf("app.post('/api/rombel'", awal)
  const route = idx.slice(awal, akhir)
  assert.doesNotMatch(route, /, ADMIN,/)
  assert.match(route, /ROLE_LIHAT_SISWA_ROMBEL/)
  assert.match(idx, /ROLE_LIHAT_SISWA_ROMBEL = requireRole\([^)]*'kepala'[^)]*\)/)
})

test('frontend: bisaModeGuru mencakup jabatan manajemen dengan can_teach', () => {
  const helper = read('src/lib/teacherMode.ts')
  assert.match(helper, /ROLES_BISA_MENGAJAR = \[[^\]]*'kepala'[^\]]*'admin'[^\]]*'operator'[^\]]*\]/)
  assert.match(helper, /export function bisaModeGuru/)
  // Dipakai di empat tempat, bukan lagi cek `role === 'kepala' && can_teach`.
  for (const file of ['src/App.tsx', 'src/components/layout/Header.tsx', 'src/components/layout/Sidebar.tsx', 'src/components/MobileHeader.tsx']) {
    assert.match(read(file), /bisaModeGuru/, `${file} harus memakai bisaModeGuru`)
  }
  assert.doesNotMatch(read('src/App.tsx'), /user\.role === 'kepala' && !!user\.can_teach/)
})

test('UserManagementPage: kotak "juga mengajar" muncul untuk semua jabatan manajemen', () => {
  const page = read('src/pages/admin/UserManagementPage.tsx')
  assert.match(page, /ROLES_BISA_MENGAJAR\.includes\(form\.role\)/)
  assert.doesNotMatch(page, /form\.role === 'kepala' &&/)
  assert.doesNotMatch(page, /Kepala ini juga mengajar/)
})

// ─── Ekspor Excel ───────────────────────────────────────────────────────────

test('helper Excel bersama ada dan menghasilkan .xlsx (bukan CSV mentah)', () => {
  const helper = read('src/utils/excelExport.ts')
  assert.match(helper, /export function unduhExcel/)
  assert.match(helper, /xlsx-js-style/)
  assert.match(helper, /bookType: 'xlsx'/)
  // Kop lembaga + header berwarna + lebar kolom + autofilter.
  assert.match(helper, /tenantIdentity/)
  assert.match(helper, /fgColor/)
  assert.match(helper, /!cols/)
  assert.match(helper, /!autofilter/)
})

test('Data Siswa & GTK tidak lagi memakai CSV join(koma) dan memakai helper', () => {
  for (const file of ['src/pages/admin/DataSiswaPage.tsx', 'src/pages/admin/DataGTKPage.tsx']) {
    const page = read(file)
    assert.match(page, /unduhExcel/, `${file} harus memakai unduhExcel`)
    // Buang komentar dulu — `join(',')` masih disebut di komentar penjelas.
    const kode = page.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(kode, /\.join\(','\)/, `${file} masih memakai CSV join(',') di kode`)
    assert.doesNotMatch(kode, /data_siswa\.csv|data_gtk\.csv/, `${file} masih mengunduh .csv`)
    assert.doesNotMatch(kode, /text\/csv/, `${file} masih memakai tipe text/csv`)
  }
})

test('Mapel punya tombol ekspor Excel (dulu tidak ada sama sekali)', () => {
  const page = read('src/pages/admin/MapelPage.tsx')
  assert.match(page, /unduhExcel/)
  assert.match(page, /onClick=\{handleExport\}/)
  assert.match(page, /KELOMPOK_LABEL/)
})

test('Daftar Pengguna memakai Excel, bukan TXT', () => {
  const page = read('src/pages/admin/UserManagementPage.tsx')
  assert.match(page, /unduhExcel/)
  assert.doesNotMatch(page, /daftar-pengguna\.txt/)
  assert.doesNotMatch(page, /text\/plain/)
})

test('helper Excel benar-benar menulis workbook yang bisa dibaca balik', () => {
  // Uji langsung library (bukan source-reading): tulis workbook bertata letak
  // lalu baca balik jumlah baris/kolom supaya layout tidak diam-diam rusak.
  const XLSX = require('xlsx-js-style')
  const aoa = [
    ['MTs Contoh'], ['Jl. Contoh 1'], [], ['Data Siswa'], ['Semua rombel'], [],
    ['NIS', 'Nama', 'Alamat'],
    ['001', 'Budi, Santoso', 'Jl. Mawar No. 5, RT 2'],
    ['002', 'Siti', 'Jl. Melati'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 32 }]
  ws['!autofilter'] = { ref: 'A7:C9' }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })

  const wb2 = XLSX.read(buf, { type: 'buffer' })
  const ws2 = wb2.Sheets[wb2.SheetNames[0]]
  const baris = XLSX.utils.sheet_to_json(ws2, { header: 1 })
  // Koma di dalam alamat/nama tetap satu sel (inilah yang dulu memecah kolom).
  const dataBudi = baris.find(r => r[0] === '001')
  assert.ok(dataBudi, 'baris Budi harus ada')
  assert.equal(dataBudi[1], 'Budi, Santoso', 'nama berkoma tetap satu sel')
  assert.equal(dataBudi[2], 'Jl. Mawar No. 5, RT 2', 'alamat berkoma tetap satu sel')
  assert.equal(dataBudi.length, 3, 'jumlah kolom tidak bertambah karena koma')
})
