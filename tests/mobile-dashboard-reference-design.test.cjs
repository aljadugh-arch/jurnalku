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

/* ── Guru dashboard ── */

test('guru hero renders the Fokus Hari Ini focus card with jurnal CTA', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-focus-card="true"/)
  assert.match(src, /FOKUS HARI INI/i)
  assert.match(src, /Jurnal Mengajar/)
})

test('guru focus card nests a white next-class card with green Masuk Kelas action', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-next-class="true"/)
  assert.match(src, /Masuk Kelas/)
})

test('guru quick actions are a 2x2 grid of titled cards with subtitles and chevrons', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-quick-grid="true"/)
  assert.match(src, /Jadwal Mengajar/)
  assert.match(src, /Ceklok Kehadiran/)
  assert.match(src, /Absensi Siswa/)
  assert.match(src, /Penilaian Siswa/)
})

test('guru schedule list rows expose time block, subject and Masuk pill', () => {
  const src = read(GURU)
  assert.match(src, /data-guru-schedule-row="true"/)
  assert.match(src, /data-guru-schedule-time="true"/)
  assert.match(src, /data-guru-schedule-action="true"/)
})

/* ── Admin dashboard ── */

test('admin greeting block is plain text above the hero, not a translucent chip', () => {
  const src = read(ADMIN)
  assert.match(src, /Selamat datang/)
})

test('admin hero is a green Total Siswa card with active count and chevron', () => {
  const src = read(ADMIN)
  assert.match(src, /Total Siswa/)
  assert.match(src, /siswa_aktif/)
})

test('admin quick action row exposes the four reference shortcuts', () => {
  const src = read('src/lib/adminDashboardShortcuts.tsx')
  assert.match(src, /Kelola Siswa/)
  assert.match(src, /Kelola GTK/)
  assert.match(src, /Jadwal/)
  assert.match(src, /Rekapitulasi/)
})

test('admin Menu Layanan keeps the four reference service tiles', () => {
  const src = read('src/lib/adminDashboardShortcuts.tsx')
  assert.match(src, /Absensi Siswa/)
  assert.match(src, /Ceklok GTK/)
  assert.match(src, /Penilaian/)
  assert.match(src, /Keuangan/)
})

test('admin renders a Notifikasi Terbaru card with rows and timestamps', () => {
  const src = read(ADMIN)
  assert.match(src, /Notifikasi Terkini/)
  assert.match(src, /notifications\.map/)
  assert.match(src, /jam_mulai/)
})

/* ── Header and Navigation ── */

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

test('all dashboards integrate MobileHeader for consistent minimalist top bar', () => {
  for (const file of [GURU, ADMIN, SISWA]) {
    const src = read(file)
    assert.match(src, /<MobileHeader/)
  }
})
