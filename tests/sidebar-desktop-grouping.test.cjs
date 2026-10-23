'use strict'
// Kontrak: sidebar desktop mengelompokkan menu sesuai PERAN, bukan admin.
//
// Regresi yang pernah terjadi (commit 00bd645): getGroupedMenus dipanggil
// dengan adminMenuGroups, padahal loop render mengiterasi grupAktif (grup
// khusus peran). Untuk guru/siswa/proktor/superadmin nama grupnya berbeda
// (UTAMA, MENGAJAR, ABSENSI, ...), sehingga semua lookup balik array kosong
// dan sidebar desktop mereka hanya menampilkan "BELUM TERKELOMPOK" — menu
// lengkap hilang di desktop.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('getGroupedMenus memakai grupAktif (grup per peran), bukan adminMenuGroups', () => {
  const s = baca('src/components/layout/Sidebar.tsx')
  // Pemanggilan pengelompokan WAJIB memakai grupAktif.
  assert.ok(/getGroupedMenus\(grupAktif\)/.test(s), 'harus getGroupedMenus(grupAktif)')
  // Pemanggilan lama yang salah harus hilang dari KODE (komentar penjelas
  // boleh menyebutnya, jadi uji baris yang diawali indentasi const).
  const barisKode = s.split('\n').filter(l => /const groupedMenus = showGrouping/.test(l))
  assert.ok(barisKode.length >= 1, 'baris groupedMenus harus ada')
  assert.ok(barisKode.every(l => l.includes('grupAktif')), 'baris kode harus memakai grupAktif, bukan adminMenuGroups')
})

test('setiap peran punya grup sendiri (tidak semua memakai adminMenuGroups)', () => {
  const s = baca('src/components/layout/Sidebar.tsx')
  assert.ok(/guruMenuGroups/.test(s), 'grup guru ada')
  assert.ok(/siswaMenuGroups/.test(s), 'grup siswa ada')
  assert.ok(/proktorMenuGroups/.test(s), 'grup proktor ada')
  assert.ok(/superAdminMenuGroups/.test(s), 'grup superadmin ada')
  assert.ok(/adminMenuGroups/.test(s), 'grup admin ada')
})

test('grupAktif dipilih berdasarkan role, dan getGroupedMenus menerima bentuk yang sama', () => {
  const s = baca('src/components/layout/Sidebar.tsx')
  assert.ok(/const grupAktif = user\?\.role === 'guru'/.test(s), 'grupAktif memilih per peran')
  // Tanda fungsi pengelompokan bersifat generik (menerima daftar grup apa pun),
  // bukan dikunci ke satu daftar.
  assert.ok(/const getGroupedMenus = \(groups:/.test(s), 'getGroupedMenus harus menerima parameter')
})

test('sidebar desktop tampil hanya di lg+, bottom nav hanya di <lg (mobile/tablet)', () => {
  const lay = baca('src/components/layout/DashboardLayout.tsx')
  const sb = baca('src/components/layout/Sidebar.tsx')
  const bn = baca('src/components/layout/BottomNavigation.tsx')
  // Sidebar: hidden di bawah lg, tampil di lg+ (desktop).
  assert.ok(/hidden lg:flex/.test(sb), 'sidebar harus hidden di <lg, flex di lg+')
  // Bottom nav: tampil di <lg, hidden di lg+.
  assert.ok(/lg:hidden/.test(bn), 'bottom nav harus lg:hidden')
  // Keduanya dipasang bersamaan di layout (satu untuk desktop, satu mobile).
  assert.ok(lay.includes('<Sidebar />'), 'layout memasang Sidebar')
  assert.ok(lay.includes('<BottomNavigation />'), 'layout memasang BottomNavigation')
})
