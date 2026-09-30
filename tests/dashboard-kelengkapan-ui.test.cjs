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

test('dashboard mobile menerima kelengkapan dan menaut ke halaman monitoring', () => {
  const mobile = baca('src/pages/admin/MobileAdminDashboard.tsx')
  assert.ok(mobile.includes('kelengkapan?: any'), 'props kelengkapan tidak ada di mobile dashboard')
  assert.ok(mobile.includes('Kelengkapan Data Lembaga'), 'judul kelengkapan tidak ada di mobile')
  assert.ok(mobile.includes('prioritas'), 'prioritas tidak dipakai di mobile')
  assert.ok(mobile.includes('to="/admin/monitoring"'), 'tautan ke halaman monitoring tidak ada di mobile')
})

test('dashboard admin meneruskan kelengkapan ke versi mobile', () => {
  const src = baca('src/pages/admin/AdminDashboard.tsx')
  assert.ok(
    src.includes('<MobileAdminDashboard stats={stats} loading={loading} kelengkapan={kelengkapan} />'),
    'MobileAdminDashboard harus menerima prop kelengkapan'
  )
})