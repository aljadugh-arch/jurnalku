const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const DASH = read('src/pages/admin/MobileAdminDashboard.tsx')
const SHORTCUTS = read('src/lib/adminDashboardShortcuts.tsx')
const MENUS = read('src/components/MobileMenuSheet.tsx')
const NAV = read('src/components/layout/BottomNavigation.tsx')
const CAL = read('src/pages/admin/KalenderKBMPage.tsx')
const PRES = read('src/pages/admin/MobileAttendanceSummary.tsx')
const ABSENSI = read('src/pages/admin/AbsensiSiswaPage.tsx')
const APP = read('src/App.tsx')
const ROLE_MENUS = read('src/lib/menuItems.tsx')
const CLOCK = read('src/pages/admin/MobileCeklok.tsx')
const SETTINGS = read('src/pages/admin/SettingsPage.tsx')
const SERVER = read('server/index.cjs')

test('admin home has configurable eight shortcuts, notifications and charts', () => {
  assert.match(DASH, /dashboard_quick_menus/)
  for (const label of ['Kelola Siswa', 'Kelola GTK', 'Jadwal', 'Rekapitulasi', 'Absensi QR Siswa', 'Ceklok GTK', 'Penilaian', 'Keuangan']) assert.match(SHORTCUTS, new RegExp(label))
  assert.match(DASH, /Presensi Hari Ini/)
  assert.match(DASH, /Jadwal Mengajar Hari Ini/)
  assert.match(DASH, /Rekap Absensi Siswa \(7 Hari Terakhir\)/)
  assert.match(DASH, /Kehadiran Guru\/GTK \(7 Hari Terakhir\)/)
  assert.match(DASH, /ResponsiveContainer/)
})

test('all-menu sheet is categorized', () => {
  for (const category of ['Menu Layanan', 'Manajemen Data', 'Akademik & Kelas', 'Administrasi & Keuangan']) assert.match(MENUS, new RegExp(category.replace('&', '\\&')))
})

test('settings persists tenant-specific dashboard shortcut choices', () => {
  assert.match(SETTINGS, /Pintasan Dashboard/)
  assert.match(SETTINGS, /dashboard_quick_menus/)
  assert.match(SERVER, /dashboard_quick_menus/)
  assert.match(SERVER, /previousQuickMenus/)
})

test('calendar selection loads configured teaching schedule', () => {
  assert.match(CAL, /Jadwal Hari Ini/)
  assert.match(CAL, /selectedDate/)
  assert.match(CAL, /\/jadwal\/tanggal/)
  assert.match(SERVER, /\/api\/jadwal\/tanggal/)
})

test('presence summary has four statuses, clickable rombels, and QR entry below', () => {
  assert.match(PRES, /Presensi Siswa/)
  for (const status of ['Hadir', 'Sakit', 'Izin', 'Alpha']) assert.match(PRES, new RegExp(status))
  assert.match(PRES, /Persentase Tiap Kelas\/Rombel/)
  assert.match(PRES, /\/absensi-siswa\/ringkasan/)
  assert.match(PRES, /navigate\(`\/admin\/absensi-siswa\/kelas\/\$\{row\.id\}`\)/)
  assert.match(PRES, /to="\/admin\/absensi-qr-siswa"/)
  assert.match(PRES, /Scan QR Siswa/)
  assert.match(SERVER, /Math\.max\(0, Number\(row\.total_siswa\)/)
})

test('QR attendance uses the old complete scanner and student QR features', () => {
  assert.match(APP, /path="absensi-qr-siswa" element=\{<AbsensiSiswaPage qrMode/)
  assert.match(ABSENSI, /Scan Kamera/)
  assert.match(ABSENSI, /Scan Foto/)
  assert.match(ABSENSI, /Lihat QR Siswa/)
  assert.match(ABSENSI, /Unduh Semua/)
})

test('all-menu sheet derives from the complete role menu and retains settings and teaching schedule', () => {
  assert.match(MENUS, /flattenMenu\(menuForRole\(role\)\)/)
  assert.match(ROLE_MENUS, /label: 'Pengaturan'.*path: '\/admin\/settings'/)
  assert.match(ROLE_MENUS, /label: 'Kelola Jadwal'.*path: '\/admin\/jadwal'/)
  assert.match(ROLE_MENUS, /label: 'Pengajar'.*path: '\/admin\/pengajar'/)
  assert.match(ROLE_MENUS, /label: 'Absensi QR Siswa'.*path: '\/admin\/absensi-qr-siswa'/)
})

test('staff clock has tabs, digital clock, and today/week histories', () => {
  assert.match(CLOCK, /'masuk', 'pulang'/)
  assert.match(CLOCK, /toLocaleTimeString/)
  assert.match(CLOCK, /Riwayat Ceklok Hari Ini/)
  assert.match(CLOCK, /Riwayat Ceklok Pekan Ini/)
  assert.match(SERVER, /app\.get\('\/api\/guru\/absensi-saya', STAFF/)
  assert.match(SERVER, /UPDATE users SET gtk_id=\? WHERE id=\? AND tenant_id=\?/)
})

test('bottom navigation has Home Calendar Presensi Ceklok and Lainnya for admin kepala', () => {
  for (const label of ['Home', 'Kalender', 'Presensi', 'Ceklok']) assert.match(NAV, new RegExp(`label: '${label}'`))
  assert.match(NAV, />Lainnya</)
  assert.match(NAV, /variant="all"/)
})

test('other menu points to the complete existing feature set', () => {
  assert.match(MENUS, /flattenMenu\(menuForRole\(role\)\)/)
  assert.match(MENUS, /pathEnabled\(item\.path/)
  assert.match(ROLE_MENUS, /Absensi QR Siswa/)
  assert.match(ROLE_MENUS, /\/admin\/absensi-qr-siswa/)
  assert.match(ROLE_MENUS, /Pengaturan/)
  assert.match(ROLE_MENUS, /\/admin\/settings/)
})
