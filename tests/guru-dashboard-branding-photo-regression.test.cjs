const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const server = read('server/index.cjs')
const dashboard = read('src/pages/guru/GuruDashboard.tsx')
const avatar = read('src/components/ui/Avatar.tsx')
const gtkPage = read('src/pages/admin/DataGTKPage.tsx')
const main = read('src/main.tsx')

test('dashboard guru hanya memakai jadwal mapel hari Jakarta tanpa fallback hari lain', () => {
  const route = server.match(/app\.get\('\/api\/guru\/dashboard'[\s\S]*?\n}\)\n/)?.[0] || ''
  assert.match(route, /lower\(j\.hari\)=\?/) 
  assert.match(route, /j\.jenis_kegiatan = 'mapel'/)
  assert.doesNotMatch(route, /if \(!jadwal\.length\)/)
  assert.match(route, /absensi_hari_ini/)
  assert.match(route, /catatan_count/)
  assert.match(route, /siswa_rombel_count/)
})

test('empat kartu guru menunjukkan jadwal, absensi, catatan, dan siswa rombel jadwal', () => {
  assert.match(dashboard, /label="Jadwal Guru Hari Ini"/)
  assert.match(dashboard, /label="Absensi Siswa"/)
  assert.match(dashboard, /data\.absensi_hari_ini/)
  assert.match(dashboard, /label="Catatan Kepribadian"/)
  assert.match(dashboard, /data\.catatan_count/)
  assert.match(dashboard, /label="Siswa Rombel Jadwal"/)
  assert.match(dashboard, /data\.siswa_rombel_count/)
  assert.doesNotMatch(dashboard, /label="Jurnal Disetujui"|label="Jurnal Pending"|label="Rombel Diampu"/)
})

test('foto GTK rusak turun ke inisial, bukan ikon gambar rusak', () => {
  assert.match(avatar, /onError/)
  assert.match(gtkPage, /onError/)
})

test('logo tenant ikut menyegarkan ikon PWA dan favicon memakai URL versi terbaru', () => {
  const logoRoute = server.match(/app\.post\('\/api\/settings\/logo'[\s\S]*?\n}\)\n/)?.[0] || ''
  assert.match(logoRoute, /SELECT logo, pwa_icon/)
  assert.match(logoRoute, /pwa_icon=CASE/)
  assert.match(server, /updated_at FROM settings WHERE tenant_id=\? ORDER BY updated_at DESC LIMIT 1/)
  assert.match(server, /withAssetVersion/)
  assert.match(main, /data\.version/)
})
