/**
 * Kontrak UI monitoring kelengkapan data.
 *
 * Arsitektur saat ini: detail monitoring sengaja DIPISAH dari dashboard ke
 * halaman sendiri (/admin/monitoring) supaya dashboard tetap jadi ringkasan
 * harian. Dashboard admin & kepala (halaman sama via AdminIndexRoute) hanya
 * menyisakan kartu ringkas yang menaut ke halaman monitoring.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const baca = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

const HALAMAN = 'src/pages/admin/MonitoringDataPage.tsx'
const GERBANG = 'src/lib/halamanTindakan.ts'
const MENU = 'src/lib/menuItems.tsx'
const SIDEBAR = 'src/components/layout/Sidebar.tsx'

test('halaman monitoring memuat data, merender grafik, dan tautan tindakan', () => {
  const src = baca(HALAMAN)
  assert.ok(src.includes("api.get('/dashboard/kelengkapan')"), 'halaman harus memanggil /dashboard/kelengkapan')
  assert.ok(src.includes('<BarChart'), 'harus ada BarChart untuk kelengkapan')
  assert.ok(src.includes('dataKey="persen"'), 'Bar harus memakai dataKey persen')
  assert.ok(src.includes('prioritas'), 'daftar prioritas harus dirender')
  assert.ok(src.includes('tautan'), 'tautan tindakan harus dirender')
  assert.ok(src.includes('skor_keseluruhan'), 'skor keseluruhan harus dirender')
  // Semua kategori harus tampil sebagai kartu rinci, bukan cuma grafik.
  assert.ok(src.includes('items.map'), 'semua item harus dirender')
})

test('menu "Monitoring Data" ada di bawah Dashboard untuk admin dan kepala', () => {
  const menu = baca(MENU)
  const sisi = baca(SIDEBAR)

  for (const [nama, src] of [['menuItems.tsx', menu], ['Sidebar.tsx', sisi]]) {
    const baris = src.split('\n')
    const iDashboard = baris.findIndex(l => l.includes("label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' }"))
    assert.ok(iDashboard > -1, `menu Dashboard tidak ditemukan di ${nama}`)

    // Baris pertama yang berisi isi menu setelah Dashboard harus Monitoring Data.
    const sesudah = baris.slice(iDashboard + 1).find(l => l.includes("label:") && l.includes("path: '/admin"))
    assert.ok(sesudah, `tidak ada menu setelah Dashboard di ${nama}`)
    assert.ok(
      sesudah.includes("label: 'Monitoring Data'") && sesudah.includes("path: '/admin/monitoring'"),
      `menu Monitoring Data tidak tepat di bawah Dashboard di ${nama}: ${sesudah.trim()}`
    )
  }

  // Grup sidebar admin: masuk grup DASHBOARD supaya tidak jatuh ke "LAINNYA".
  assert.ok(
    sisi.includes("labels: ['Dashboard', 'Monitoring Data', 'Posting']"),
    'Monitoring Data belum masuk grup DASHBOARD'
  )
})

test('menu mobile mengelompokkan Monitoring Data ke Manajemen Data', () => {
  const mobile = baca('src/components/MobileMenuSheet.tsx')
  assert.ok(/Monitoring/.test(mobile), 'kategori menu mobile belum mengenali Monitoring Data')
})

test('route /admin/monitoring terdaftar dan lazy-loaded', () => {
  const app = baca('src/App.tsx')
  assert.ok(app.includes("import('./pages/admin/MonitoringDataPage')"), 'halaman monitoring belum lazy-loaded')
  assert.ok(app.includes('<Route path="monitoring" element={<MonitoringDataPage />} />'), 'route monitoring belum terdaftar di /admin')
})

test('tautan khusus admin disembunyikan dari peran non-admin', () => {
  const app = baca('src/App.tsx')
  const hal = baca(HALAMAN)
  const gerbang = baca(GERBANG)
  const backend = baca('server/dashboard-kelengkapan.cjs')

  // Semua tautan yang dikirim backend harus ikut dipertimbangkan.
  const tautan = [...backend.matchAll(/tautan:\s*'(\/admin\/[a-z-]+)'/g)].map(m => m[1])
  assert.ok(tautan.length >= 10, `peta tautan backend tidak terbaca (${tautan.length})`)

  // Daftar di modul gerbang bersama (satu sumber kebenaran untuk semua UI).
  const digate = new Set([...gerbang.matchAll(/'(?:\/admin\/[a-z-]+)'/g)].map(m => m[0].slice(1, -1)))

  // Sebuah halaman "hanya admin" bila route-nya tidak mengizinkan kepala.
  // Pencarian dibatasi sampai '>' pertama agar tidak menyeberang ke route
  // berikutnya (route tanpa guard sering diikuti route ber-guard).
  const hanyaAdmin = (path) => {
    const nama = path.replace('/admin/', '')
    const m = app.match(new RegExp('<Route path="' + nama + '"[^>]{0,240}?allowedRoles=\\{([^}]*)\\}'))
    if (!m) return false
    return m[1].includes("'admin'") && !m[1].includes("'kepala'") && !m[1].includes("'operator'")
  }

  const wajibDigate = tautan.filter(hanyaAdmin)
  assert.ok(wajibDigate.length > 0, 'tidak ada halaman khusus admin yang terdeteksi — cek parser route')

  for (const t of wajibDigate) {
    assert.ok(digate.has(t), `tautan ${t} hanya bisa dibuka admin tapi tetap dirender untuk kepala`)
  }
  // Jangan menutup tautan yang sebenarnya boleh dibuka peran lain.
  for (const t of tautan.filter(x => !hanyaAdmin(x))) {
    assert.ok(!digate.has(t), `tautan ${t} sebenarnya boleh dibuka kepala tapi ikut disembunyikan`)
  }

  // Gate-nya harus benar-benar dipakai saat merender (desktop & mobile).
  assert.ok(hal.includes('const bisaBuka ='), 'helper bisaBuka tidak ada di halaman monitoring')
  assert.ok(hal.includes('bisaBuka(item.tautan)'), 'tombol kartu tidak memakai gate')
  assert.ok(hal.includes('bisaBuka(p.tautan)'), 'tombol prioritas tidak memakai gate')
  assert.ok(hal.includes("useAuthStore(s => s.user?.role)"), 'peran pengguna tidak dibaca di halaman monitoring')

  const mobile = baca('src/pages/admin/MobileAdminDashboard.tsx')
  assert.ok(mobile.includes('bisaBukaHalaman(user?.role, item.path)'), 'pintasan mobile tidak memakai gate peran')

  // Fungsi gerbang sendiri harus benar untuk peran kepala.
  assert.ok(gerbang.includes("'/admin/settings'") && gerbang.includes("'/admin/rekap-nilai'"), 'daftar halaman khusus admin berubah')
  assert.ok(/PERAN_ADMIN = \['admin', 'super_admin'\]/.test(gerbang), 'peran admin tidak didefinisikan')
})

test('dashboard admin/kepala hanya ringkas dan menaut ke halaman monitoring', () => {
  const src = baca('src/pages/admin/AdminDashboard.tsx')
  assert.ok(src.includes("api.get('/dashboard/kelengkapan')"), 'AdminDashboard harus tetap memuat skor')
  assert.ok(src.includes('setKelengkapan'), 'AdminDashboard harus menyimpan hasil ke state')
  assert.ok(src.includes('Buka Monitoring Data'), 'tombol menuju halaman monitoring tidak ada')
  assert.ok(src.includes('to="/admin/monitoring"'), 'tautan ke /admin/monitoring tidak ada')
  // Daftar rinci per komponen + chart sudah pindah ke halaman monitoring.
  assert.ok(!src.includes('kelengkapan.items?.map'), 'daftar rinci masih tertinggal di dashboard')
})

test('dashboard kepala memakai halaman dashboard yang sama', () => {
  const app = baca('src/App.tsx')
  assert.ok(app.includes("user?.role === 'kepala'") || app.includes("'kepala'"), 'kepala harus termasuk peran dashboard admin')
  const idx = app.indexOf('function AdminIndexRoute()')
  assert.ok(idx > -1, 'AdminIndexRoute tidak ditemukan')
  const blok = app.substring(idx, app.indexOf('function ProtectedRoute', idx))
  assert.ok(blok.includes('return <AdminDashboard />'), 'kepala memakai AdminDashboard')

  // Endpoint di server harus mengizinkan peran kepala.
  const server = baca('server/index.cjs')
  const roleLine = server.split('\n').find(l => l.includes('const DASHBOARD_ROLES ='))
  assert.ok(roleLine, 'DASHBOARD_ROLES tidak ditemukan')
  assert.ok(roleLine.includes("'kepala'"), 'kepala harus boleh membaca endpoint kelengkapan')
  assert.ok(roleLine.includes("'admin'"), 'admin harus boleh membaca endpoint kelengkapan')
})

test('dashboard mobile menampilkan statistik monitoring live dan menaut ke halaman monitoring', () => {
  const mobile = baca('src/pages/admin/MobileAdminDashboard.tsx')
  assert.ok(mobile.includes('Statistik Monitoring Live'), 'judul statistik monitoring live tidak ada di mobile')
  // Isi kartu: absensi siswa + rombel yang belum absen, ceklok GTK, jadwal guru hari ini.
  assert.ok(mobile.includes('rombel_attendance'), 'absensi per rombel tidak dipakai di mobile')
  assert.ok(mobile.includes('Belum absen'), 'daftar rombel belum absen tidak ada di mobile')
  assert.ok(mobile.includes('Ceklok GTK Hari Ini'), 'ceklok GTK hari ini tidak ada di mobile')
  assert.ok(mobile.includes('Jadwal Guru Hari Ini'), 'jadwal guru hari ini tidak ada di mobile')
  assert.ok(mobile.includes('to="/admin/monitoring"'), 'tautan ke halaman monitoring tidak ada di mobile')
  // Kartu kelengkapan dihapus dari dashboard mobile supaya tidak dobel dengan monitoring.
  assert.ok(!mobile.includes('Kelengkapan Data Lembaga'), 'kartu kelengkapan masih tertinggal di mobile')
})

test('dashboard admin tidak lagi mengirim kelengkapan ke versi mobile', () => {
  const src = baca('src/pages/admin/AdminDashboard.tsx')
  assert.ok(
    src.includes('<MobileAdminDashboard stats={stats} />'),
    'MobileAdminDashboard hanya menerima prop stats'
  )
})