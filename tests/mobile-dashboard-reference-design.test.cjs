const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const GURU = 'src/pages/guru/MobileGuruDashboard.tsx'
const ADMIN = 'src/pages/admin/MobileAdminDashboard.tsx'

/* ── Guru dashboard must match /home/jeuma/Pictures/redesign/dashboard_guru.png ── */

test('guru hero renders the Fokus Hari Ini focus card with jurnal CTA', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-focus-card="true"/)
  assert.match(src, /Fokus Hari Ini/)
  assert.match(src, /Jurnal Mengajar/)
  assert.match(src, /Catat kegiatan pembelajaran hari ini/)
})

test('guru focus card nests a white next-class card with green Masuk Kelas action', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-next-class="true"/)
  assert.match(src, /Masuk Kelas/)
  // green is the single-purpose action color in the reference
  assert.match(src, /bg-emerald-600/)
  assert.match(src, /sesi-kelas\/masuk/)
})

test('guru greeting header shows avatar, name, dated row and notification bell badge', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-greeting="true"/)
  assert.match(src, /Selamat (pagi|Pagi)/)
  assert.match(src, /data-guru-date-row="true"/)
  assert.match(src, /data-guru-bell="true"/)
  assert.match(src, /data-guru-bell-badge="true"/)
})

test('guru quick actions are a 2x2 grid of titled cards with subtitles and chevrons', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-quick-grid="true"/)
  assert.match(src, /grid-cols-2/)
  for (const label of ['Jadwal Mengajar', 'Ceklok Kehadiran', 'Absensi Siswa', 'Penilaian Siswa']) {
    assert.match(src, new RegExp(label))
  }
  assert.match(src, /data-guru-quick-subtitle="true"/)
})

test('guru schedule list rows expose time block, subject and Masuk pill', () => {
  const src = read(GURU)
  assert.match(src, /Jadwal Mengajar Hari Ini/)
  assert.match(src, /data-guru-schedule-row="true"/)
  assert.match(src, /data-guru-schedule-time="true"/)
  assert.match(src, /data-guru-schedule-action="true"/)
  assert.match(src, /Lihat Semua/)
})

/* ── Admin dashboard must match /home/jeuma/Pictures/redesign/dashboard_admin.png ── */

test('admin header shows school identity tile and Admin Sekolah subtitle', () => {
  const src = read(ADMIN)
  assert.match(src, /data-admin-school-header="true"/)
  assert.match(src, /Admin Sekolah/)
})

test('admin greeting block is plain text above the hero, not a translucent chip', () => {
  const src = read(ADMIN)
  assert.match(src, /data-admin-greeting="true"/)
  assert.match(src, /Semoga hari ini berjalan dengan lancar dan penuh keberkahan/)
})

test('admin hero is a green Total Siswa card with active count and chevron', () => {
  const src = read(ADMIN)
  assert.match(src, /data-admin-hero="true"/)
  assert.match(src, /Total Siswa/)
  assert.match(src, /data-admin-hero-value="true"/)
  assert.match(src, /aktif/)
})

test('admin quick action row exposes the four reference shortcuts', () => {
  const src = read(ADMIN)
  assert.match(src, /data-admin-quick-row="true"/)
  for (const label of ['Kelola Siswa', 'Kelola GTK', 'Jadwal', 'Laporan']) {
    assert.match(src, new RegExp(label))
  }
})

test('admin Menu Layanan keeps the four reference service tiles', () => {
  const src = read(ADMIN)
  assert.match(src, /Menu Layanan/)
  assert.match(src, /data-admin-menu-grid="true"/)
  for (const label of ['Absensi Siswa', 'Ceklok GTK', 'Penilaian', 'Keuangan']) {
    assert.match(src, new RegExp(label))
  }
})

test('admin renders a Notifikasi Terbaru card with rows and timestamps', () => {
  const src = read(ADMIN)
  assert.match(src, /Notifikasi Terbaru/)
  assert.match(src, /data-admin-notif-card="true"/)
  assert.match(src, /data-admin-notif-row="true"/)
  assert.match(src, /data-admin-notif-time="true"/)
})

/* ── shared guarantees carried over from the overlap fix ── */

test('reference dashboards keep account actions on their own row', () => {
  for (const file of [GURU, ADMIN]) {
    const src = read(file)
    assert.match(src, /data-mobile-account-row="true"/)
    assert.match(src, /<MobileHeader/)
  }
})

test('reference dashboards render exactly one notification bell', () => {
  // MobileHeader ships its own bell; pages that draw the reference bell must suppress it
  const header = read('src/components/MobileHeader.tsx')
  assert.match(header, /showBell\s*=\s*true/)
  assert.match(header, /\{showBell && \(/)

  for (const file of [GURU, ADMIN]) {
    const src = read(file)
    assert.match(src, /showBell=\{false\}/)
    assert.match(src, /variant="light"/)
  }
})

test('light header variant keeps the theme toggle reachable inside the account menu', () => {
  const header = read('src/components/MobileHeader.tsx')
  // standalone toggle is hidden on the light variant to free header width for the name
  assert.match(header, /\{!light && \(/)
  // but the action itself must still exist inside the dropdown
  assert.match(header, /\{light && \([\s\S]{0,400}toggleDark\(\)/)
  assert.match(header, /Mode Terang/)
  assert.match(header, /Mode Gelap/)
})
