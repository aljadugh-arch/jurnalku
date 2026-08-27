const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
const dashboard = read('src/pages/guru/GuruDashboard.tsx')
const statCard = read('src/components/ui/StatCard.tsx')
const attendance = read('src/pages/guru/GuruAbsensiSiswaPage.tsx')
const personality = read('src/pages/guru/GuruCatatanKepribadianPage.tsx')
const assessment = read('src/pages/guru/GuruPenilaianHarianPage.tsx')
const schedule = read('src/pages/guru/GuruJadwalPage.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const bottomNavigation = read('src/components/layout/BottomNavigation.tsx')
const menuItems = read('src/lib/menuItems.tsx')
const users = read('src/pages/admin/UserManagementPage.tsx')
const server = read('server/index.cjs')

function teacherMenuBlock(source, marker, endMarker) {
  const start = source.indexOf(marker)
  const end = source.indexOf(endMarker, start)
  return start >= 0 && end > start ? source.slice(start, end) : ''
}

test('empat kartu dashboard guru sama tinggi dan memakai tindakan sesuai jadwal hari ini', () => {
  assert.match(dashboard, /grid-cols-2 sm:grid-cols-4[^"\n]*auto-rows-fr/)
  assert.match(dashboard, /className="h-full[^"\n]*"[\s\S]*?<StatCard/)
  assert.match(statCard, /h-full/)
  assert.match(dashboard, /Jadwal Mengajar Hari Ini/)
  assert.match(dashboard, /Nilai\/Penilaian Siswa/)
  assert.match(dashboard, /navigate\('\/guru\/penilaian-harian'\)/)
  assert.doesNotMatch(dashboard, /Siswa Rombel Jadwal/)
  assert.doesNotMatch(dashboard, /length \+ ' JP'/)
})

test('fitur guru mengambil konteks jadwal harian tanpa fallback seluruh rombel tenant', () => {
  for (const source of [attendance, personality, assessment]) {
    assert.match(source, /\/guru\/jadwal-context/)
  }
  assert.doesNotMatch(attendance, /api\.get\('\/rombel'\)/)
  assert.doesNotMatch(personality, /api\.get\('\/siswa'\)/)
  assert.doesNotMatch(assessment, /api\.get\('\/guru\/pengajar-saya'\)/)
  assert.match(personality, /placeholder="Cari nama \/ NIS/)
  assert.match(schedule, /Jadwal mengajar selama satu pekan/)
})

test('backend menyediakan konteks jadwal mapel guru per tanggal dan siswa aktif tenant tersebut', () => {
  assert.match(server, /app\.get\('\/api\/guru\/jadwal-context'/)
  assert.match(server, /resolveGtkForUser\(req\.user\.id, req\.tenantId\)/)
  assert.match(server, /j\.gtk_id=\?[^`]*j\.tenant_id=\?[^`]*j\.jenis_kegiatan='mapel'/s)
  assert.match(server, /COALESCE\(s\.status,'aktif'\)='aktif'/)
  assert.match(server, /jadwal_id/)
  assert.match(server, /teacherCanAccessStudentOnDate/)
  assert.match(server, /app\.post\('\/api\/catatan-kepribadian'/)
  assert.match(server, /Siswa tidak sesuai jadwal mengajar Anda pada tanggal tersebut/)
})

test('menu kelas wali hanya ditampilkan untuk role wali_kelas', () => {
  const sidebarGuruMenu = teacherMenuBlock(sidebar, 'const guruMenuItems', 'const siswaMenuItems')
  assert.doesNotMatch(sidebarGuruMenu, /Kelas Wali Saya|\/guru\/rombel/)
  assert.match(sidebar, /user\?\.role === 'wali_kelas'.*\/guru\/rombel/s)

  const sharedMenu = teacherMenuBlock(menuItems, 'export const guruMenuItems', 'export const siswaMenuItems')
  assert.doesNotMatch(sharedMenu, /Kelas Wali Saya|\/guru\/rombel/)
  assert.match(menuItems, /role === 'wali_kelas'.*\/guru\/rombel/s)

  const bottomGuru = teacherMenuBlock(bottomNavigation, "if (role === 'guru' || role === 'wali_kelas')", "if (role === 'siswa')")
  assert.match(bottomGuru, /role === 'wali_kelas'.*\/guru\/rombel/s)
})

test('manajemen pengguna memakai kontrol penuh-lebar dan kartu responsif sampai tablet', () => {
  assert.match(users, /grid-cols-1 sm:grid-cols-2/)
  assert.match(users, /lg:hidden/)
  assert.match(users, /hidden lg:block overflow-x-auto/)
  assert.match(users, /w-full min-w-0 h-11/)
  assert.match(users, /min-h-\[/)
})

test('dashboard menampilkan sapaan Pak atau Ibu dari jenis kelamin GTK', () => {
  assert.match(dashboard, /teacherDisplayName/)
  assert.match(dashboard, /jenis_kelamin/)
  assert.match(dashboard, /Pak/)
  assert.match(dashboard, /Ibu/)
})
