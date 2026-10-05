const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const GURU = 'src/pages/guru/MobileGuruDashboard.tsx'
const ADMIN = 'src/pages/admin/MobileAdminDashboard.tsx'
const SISWA = 'src/pages/siswa/MobileSiswaDashboard.tsx'
const HEADER = 'src/components/MobileHeader.tsx'
const DASH_HEADER = 'src/components/MobileDashboardHeader.tsx'

/* ── Header lembaga (dipakai dashboard admin & guru) ── */

test('header dashboard menampilkan logo + nama lembaga dan lonceng notifikasi', () => {
  const src = read(DASH_HEADER)
  assert.match(src, /data-dashboard-header="true"/)
  assert.match(src, /settings\.nama_lembaga/)
  assert.match(src, /logo/)
  // Latar kotak memakai warna/aksen dari Pengaturan.
  assert.match(src, /heroColors\(settings, dark\)/)
  assert.match(src, /style=\{\{ background: accent \}\}/)
  assert.match(src, /NotifBell/)
})

test('header dashboard menaruh nama besar dan peran di bawah header lembaga', () => {
  const src = read(DASH_HEADER)
  assert.match(src, /user\?\.nama/)
  assert.match(src, /text-2xl font-bold/)
  assert.match(src, /ROLE_LABEL/)
})

test('kotak header dashboard tidak memotong panel dropdown', () => {
  const src = read(DASH_HEADER)
  // Kotak berwarna TIDAK boleh overflow-hidden: panel lonceng & menu akun keluar
  // dari kotak dan akan terpotong tepat di batas bawahnya.
  assert.match(src, /className="relative rounded-2xl px-4 py-3\.5 shadow-sm"/)
  assert.doesNotMatch(src, /relative overflow-hidden rounded-2xl px-4 py-3\.5/)
  // Dekorasi tetap dipotong di wadahnya sendiri supaya sudut tetap rapi.
  assert.match(src, /pointer-events-none absolute inset-0 overflow-hidden rounded-2xl/)
})

/* ── Guru dashboard ── */

test('guru dashboard memakai header lembaga dan menampilkan peran GURU', () => {
  const src = read(GURU)
  assert.match(src, /<MobileDashboardHeader/)
  assert.match(src, /GURU/)
  assert.match(src, /WALI MURID/)
})

test('guru dashboard menata dua grid utama: Ceklok Kehadiran dan Jadwal Mengajar', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-main-grid="true"/)
  assert.match(src, /grid-cols-2/)
  assert.match(src, /data-guru-ceklok-card="true"/)
  assert.match(src, /Ceklok Kehadiran/)
  assert.match(src, /data-guru-jadwal-card="true"/)
  assert.match(src, /Jadwal Mengajar/)
})

test('jadwal mengajar hari ini menyediakan tombol MASUK KELAS hijau dan SELESAI KELAS merah', () => {
  const src = read(GURU)
  assert.match(src, /Jadwal Mengajar Hari Ini/)
  // Hijau = masuk kelas, merah = selesai kelas.
  assert.match(src, /bg-emerald-600[^"']*"[\s\S]{0,120}MASUK KELAS/)
  assert.match(src, /bg-red-600[^"']*"[\s\S]{0,120}SELESAI KELAS/)
})

test('baris jadwal guru memaparkan blok waktu, mata pelajaran, dan aksi', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-schedule-row="true"/)
  assert.match(src, /data-guru-schedule-time="true"/)
  assert.match(src, /data-guru-schedule-action="true"/)
})

/* ── Admin dashboard ── */

test('admin dashboard memakai header lembaga dan identitas pengguna', () => {
  const src = read(ADMIN)
  assert.match(src, /<MobileDashboardHeader/)
})

test('admin dashboard menampilkan menu grid 4x2 dengan ubin Lainnya', () => {
  const src = read(ADMIN)
  assert.match(src, /data-admin-menu-grid="true"/)
  assert.match(src, /grid-cols-4/)
  assert.match(src, /menuTerbuka\.slice\(0, 7\)/)
  assert.match(src, /data-admin-menu-more="true"/)
  assert.match(src, /Lainnya/)
  // Ubin Lainnya membuka menu lengkap.
  assert.match(src, /data-admin-menu-more="true"[\s\S]{0,200}setMenuOpen\(true\)/)
  // Tulisan "Semua Menu" dihapus: fungsinya sudah diwakili ubin Lainnya.
  assert.doesNotMatch(src, /Semua Menu/)
})

test('admin dashboard menampilkan kartu Jadwal Sholat', () => {
  const src = read(ADMIN)
  assert.match(src, /data-admin-sholat-card="true"/)
  assert.match(src, /Jadwal Sholat/)
  assert.match(src, /api\.get\('\/jadwal-sholat'\)/)
  for (const waktu of ['subuh', 'syuruq', 'dzuhur', 'ashar', 'maghrib', 'isya']) assert.match(src, new RegExp(waktu))
})

test('admin dashboard menampilkan kartu Statistik Monitoring Live', () => {
  const src = read(ADMIN)
  assert.match(src, /data-admin-monitoring-card="true"/)
  assert.match(src, /Statistik Monitoring Live/)
  assert.match(src, /api\.get\('\/admin\/monitoring'\)/)
  assert.match(src, /to="\/admin\/monitoring"/)
})

test('admin dashboard tetap menjaga gerbang peran pada pintasan', () => {
  const src = read(ADMIN)
  assert.match(src, /bisaBukaHalaman\(user\?\.role, item\.path\)/)
})

test('admin dashboard menampilkan statistik monitoring live tanpa kartu kelengkapan', () => {
  const src = read(ADMIN)
  assert.match(src, /data-admin-monitoring-card="true"/)
  // Tiga isi yang diminta: absensi siswa + rombel belum absen, ceklok GTK, jadwal guru.
  assert.match(src, /data-monitoring-absensi="true"/)
  assert.match(src, /Belum absen/)
  assert.match(src, /rombel_attendance/)
  assert.match(src, /data-monitoring-ceklok="true"/)
  assert.match(src, /Ceklok GTK Hari Ini/)
  assert.match(src, /data-monitoring-jadwal="true"/)
  assert.match(src, /Jadwal Guru Hari Ini/)
  // Kartu kelengkapan data dihapus agar tidak dobel dengan halaman monitoring.
  assert.doesNotMatch(src, /Kelengkapan Data Lembaga/)
  assert.doesNotMatch(src, /kelengkapan\.prioritas/)
})

test('admin dashboard menautkan grid ke menu lengkap dan meneruskan kelengkapan', () => {
  const src = read(ADMIN)
  assert.match(src, /onClick=\{\(\) => setMenuOpen\(true\)\}/)
  assert.match(src, /<MobileMenuSheet open=\{menuOpen\}/)
})

/* ── Header global & navigasi ── */

test('mobile header renders avatar, name, and bell', () => {
  const header = read(HEADER)
  assert.match(header, /Avatar/)
  assert.match(header, /user\?\.nama/)
  assert.match(header, /Bell/)
})

test('mobile header supports switch role for kepala with can_teach', () => {
  const header = read(HEADER)
  assert.match(header, /user\?\.role === 'kepala' && !!user\?\.can_teach/)
  assert.match(header, /Mode Manajemen/)
  assert.match(header, /Mode Guru/)
})

test('dashboard admin dan guru memakai header lembaga, siswa tetap memakai MobileHeader', () => {
  for (const file of [GURU, ADMIN]) assert.match(read(file), /<MobileDashboardHeader/)
  assert.match(read(SISWA), /<MobileHeader/)
})
