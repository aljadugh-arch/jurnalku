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
const CLOCK = read('src/pages/admin/MobileCeklok.tsx')
const SETTINGS = read('src/pages/admin/SettingsPage.tsx')
const SERVER = read('server/index.cjs')

test('admin home has configurable eight shortcuts, notifications and charts', () => {
  assert.match(DASH, /dashboard_quick_menus/)
  for (const label of ['Kelola Siswa', 'Kelola GTK', 'Jadwal', 'Rekapitulasi', 'Absensi Siswa', 'Ceklok GTK', 'Penilaian', 'Keuangan']) assert.match(SHORTCUTS, new RegExp(label))
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
})

test('calendar selection loads configured teaching schedule', () => {
  assert.match(CAL, /Jadwal Hari Ini/)
  assert.match(CAL, /selectedDate/)
  assert.match(CAL, /\/jadwal\/tanggal/)
  assert.match(SERVER, /\/api\/jadwal\/tanggal/)
})

test('presence summary has four statuses and per-rombel percentages', () => {
  assert.match(PRES, /Presensi Siswa/)
  for (const status of ['Hadir', 'Sakit', 'Izin', 'Alpha']) assert.match(PRES, new RegExp(status))
  assert.match(PRES, /Persentase Tiap Kelas\/Rombel/)
  assert.match(PRES, /\/absensi-siswa\/ringkasan/)
})

test('staff clock has tabs, digital clock, and today/week histories', () => {
  assert.match(CLOCK, /'masuk', 'pulang'/)
  assert.match(CLOCK, /toLocaleTimeString/)
  assert.match(CLOCK, /Riwayat Ceklok Hari Ini/)
  assert.match(CLOCK, /Riwayat Ceklok Pekan Ini/)
})

test('bottom navigation has Home Calendar Presensi Ceklok and Lainnya for admin kepala', () => {
  for (const label of ['Home', 'Kalender', 'Presensi', 'Ceklok']) assert.match(NAV, new RegExp(`label: '${label}'`))
  assert.match(NAV, />Lainnya</)
  assert.match(NAV, /variant="settings"/)
})

test('other menu groups institution and system management links', () => {
  for (const label of ['Identitas Lembaga', 'Manajemen Sistem', 'Profil Sekolah', 'Jenjang & Kurikulum', 'Tahun Ajaran', 'Hari Libur', 'Tampilan & Theme', 'PWA', 'Ceklok Setting', 'Fitur Aktif\/Nonaktif', 'Backup & Restore', 'Konfigurasi WhatsApp', 'Cashless', 'Developer Mode']) assert.match(MENUS, new RegExp(label.replace('&', '\\&')))
})
