'use strict'
// Kontrak: terminologi (sebutan) mengikuti tipe institusi — "siswa" jadi
// "mahasiswa"/"santri"/"karyawan", "guru" jadi "dosen"/"ustadz"/"trainer", dst.
// Tipe institusi tersimpan di settings.tipe_institusi (fallback dari jenjang).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('terminologi.ts menyediakan peta sebutan + derive dari jenjang', () => {
  const src = baca('src/lib/terminologi-peta.ts')
  const hook = baca('src/lib/terminologi.ts')
  assert.match(src, /deriveTipeInstitusi/, 'harus ada deriveTipeInstitusi')
  assert.match(src, /terminologiUntuk/, 'harus ada terminologiUntuk')
  assert.match(hook, /useTerminologi/, 'harus ada useTerminologi hook')
  assert.match(hook, /export \* from '\.\/terminologi-peta'/, 'hook me-re-export peta')
  assert.match(src, /perguruan_tinggi: \{/, 'peta perguruan_tinggi harus ada')
  assert.match(src, /siswa: 'Mahasiswa'/, 'PT: siswa -> Mahasiswa')
  assert.match(src, /guru: 'Dosen'/, 'PT: guru -> Dosen')
  assert.match(src, /mapel: 'Mata Kuliah'/, 'PT: mapel -> Mata Kuliah')
  assert.match(src, /pesantren: \{/, 'peta pesantren harus ada')
  assert.match(src, /siswa: 'Santri'/, 'pesantren: siswa -> Santri')
  assert.match(src, /perusahaan: \{/, 'peta perusahaan harus ada')
  assert.match(src, /siswa: 'Karyawan'/, 'perusahaan: siswa -> Karyawan')
  assert.match(src, /madrasah: \{/, 'peta madrasah harus ada')
  assert.match(src, /sekolah: \{/, 'peta sekolah harus ada')
  assert.match(src, /diklat: \{/, 'peta diklat harus ada')
})

test('deriveTipeInstitusi memetakan jenjang ke tipe', () => {
  const src = baca('src/lib/terminologi-peta.ts')
  assert.match(src, /j === 'PT' .* return 'perguruan_tinggi'/, 'PT -> perguruan_tinggi')
  assert.match(src, /pesantren\|pondok/.test(src) ? /return 'pesantren'/ : /return 'pesantren'/, 'pesantren -> pesantren')
  assert.match(src, /return 'madrasah'/, 'MI/MTs/MA -> madrasah')
  assert.match(src, /return 'sekolah'/, 'SD/SMP/SMA -> sekolah')
})

test('menu & header memakai terminologi, bukan hardcoded', () => {
  const sidebar = baca('src/components/layout/Sidebar.tsx')
  const grid = baca('src/components/MobileMenuGrid.tsx')
  const sheet = baca('src/components/MobileMenuSheet.tsx')
  const siswa = baca('src/pages/admin/DataSiswaPage.tsx')
  const gtk = baca('src/pages/admin/DataGTKPage.tsx')
  assert.match(sidebar, /terapkanTerminologi\(item\.label, t\)/, 'sidebar pakai terminologi')
  assert.match(grid, /terapkanTerminologi\(item\.label, t\)/, 'mobile grid pakai terminologi')
  assert.match(sheet, /terapkanTerminologi\(item\.label, t\)/, 'mobile sheet pakai terminologi')
  assert.match(siswa, /t\.dataSiswa/, 'DataSiswaPage pakai t.dataSiswa')
  assert.match(gtk, /t\.dataGuru/, 'DataGTKPage pakai t.dataGuru')
})

test('server menyimpan tipe_institusi di settings + register', () => {
  const srv = baca('server/index.cjs')
  assert.match(srv, /\['settings', 'tipe_institusi', "TEXT DEFAULT ''"\]/, 'migrasi tipe_institusi ada')
  assert.match(srv, /tipe_institusi, hari_libur, kbm_auto_aktif/, 'INSERT settings sertakan tipe_institusi')
  assert.match(srv, /tipe_institusi=excluded\.tipe_institusi/, 'ON CONFLICT update tipe_institusi')
  assert.match(srv, /jenjang \|\| '', tipe_institusi \|\| '', JSON\.stringify\(hari_libur/, '.run() sertakan tipe_institusi')
  assert.match(srv, /jenjang, tipe_institusi \} = req\.body/, 'register destructure jenjang+tipe_institusi')
  assert.match(srv, /jenjang: jenjang \|\| '', tipe_institusi: tipe_institusi \|\| ''/, 'ensureTenantSettings register sertakan tipe')
})

test('settings UI punya pilihan Tipe Lembaga', () => {
  const ui = baca('src/pages/admin/SettingsPage.tsx')
  assert.match(ui, /TIPE_INSTITUSI_OPTIONS/, 'import TIPE_INSTITUSI_OPTIONS')
  assert.match(ui, /Tipe Lembaga \/ Institusi/, 'label selector ada')
  assert.match(ui, /form\.tipe_institusi/, 'form memakai tipe_institusi')
})
