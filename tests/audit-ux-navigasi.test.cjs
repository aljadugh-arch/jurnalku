'use strict'
// Kontrak UX navigasi yang diperbaiki dari hasil audit.
//
// Temuan audit (dibuktikan scripts/audit-nav.cjs dan scripts/audit-ia.cjs):
//   1. Menu guru 19 item DATAR di sidebar (tanpa grup) -> mata harus memindai
//      seluruh daftar untuk menemukan satu menu. Diperbaiki: 4 grup.
//   2. Label berbeda untuk path yang sama (/admin/wa-gateway punya
//      'Konfigurasi Gateway' dan 'Sambungkan WA Platform') -> user bingung
//      apakah itu menu yang sama. Diperbaiki: satu label.
//   3. Menu 'Kelola Website' membuka https://fazacloud.my.id — domain proyek
//      LAIN, bukan website lembaga. Dua tempat (sidebar + bottom nav).
//   4. Sidebar hanya mengelompokkan peran manajemen; guru & siswa datar.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('menu guru dikelompokkan, bukan 19 item datar', () => {
  const s = baca('src/lib/menuItems.tsx')
  const i = s.indexOf('export const guruMenuItems')
  const j = s.indexOf('export const proktorMenuItems')
  const blok = s.slice(i, j)
  // Harus ada grup (children) untuk Mengajar / Absensi / Penilaian
  const grup = [...blok.matchAll(/children:\s*\[/g)].length
  assert.ok(grup >= 3, `menu guru harus punya minimal 3 grup, ditemukan ${grup}`)
  // Path tidak boleh hilang saat pengelompokan
  const paths = [...blok.matchAll(/path:\s*'([^']+)'/g)].map(m => m[1])
  assert.ok(paths.length >= 20, `path guru tidak boleh berkurang, ditemukan ${paths.length}`)
})

test('satu path hanya punya SATU label (tidak membingungkan)', () => {
  const s = baca('src/lib/menuItems.tsx')
  const peta = new Map()
  // Hanya item DAUN: label + icon + path dalam satu objek, TANPA children di
  // antaranya. Kalau regex dibuat longgar, label GRUP (mis. 'Keuangan') ikut
  // terbaca sebagai label untuk path anak pertamanya -> positif palsu.
  for (const m of s.matchAll(/\{ label: '([^']+)', icon: [^}]*?path: '([^']+)'/g)) {
    if (!peta.has(m[2])) peta.set(m[2], new Set())
    peta.get(m[2]).add(m[1])
  }
  const bentrok = [...peta.entries()].filter(([, labels]) => labels.size > 1)
  assert.strictEqual(bentrok.length, 0,
    'path dengan label berbeda: ' + bentrok.map(([p, l]) => `${p} -> ${[...l].join(' / ')}`).join('; '))
})

test('menu website tidak menunjuk ke domain proyek lain', () => {
  for (const f of ['src/lib/menuItems.tsx', 'src/components/layout/BottomNavigation.tsx']) {
    const s = baca(f)
    assert.ok(!s.includes('fazacloud.my.id'),
      `${f} tidak boleh membuka fazacloud.my.id — itu domain proyek lain, bukan website lembaga`)
  }
})

test('sidebar mengelompokkan guru dan siswa juga, bukan hanya manajemen', () => {
  const s = baca('src/components/layout/Sidebar.tsx')
  assert.ok(/guruMenuGroups/.test(s), 'harus ada grup untuk guru')
  assert.ok(/siswaMenuGroups/.test(s), 'harus ada grup untuk siswa')
  assert.ok(/grupAktif/.test(s), 'harus memilih grup sesuai peran')
  // Peran guru & siswa harus masuk daftar yang mendapat grouping
  const m = s.match(/const managementRoles = \[([^\]]+)\]/)
  assert.ok(m, 'managementRoles harus ada')
  for (const r of ['guru', 'wali_kelas', 'siswa']) {
    assert.ok(m[1].includes(`'${r}'`), `peran ${r} harus mendapat grouping`)
  }
})

test('landing page tidak mengulang info yang sama di beberapa seksi', () => {
  const s = baca('src/pages/LandingPage.tsx')
  // "alasan" diringkas jadi strip, bukan seksi penuh yang mengulang manfaat fitur
  assert.ok(/ALASAN \(strip ringkas/.test(s), 'alasan harus jadi strip ringkas, bukan seksi penuh berulang')
  // FAQ dipangkas ke <= 6 pertanyaan inti
  const jumlahFaq = [...s.matchAll(/\{ t: '/g)].length
  assert.ok(jumlahFaq <= 6, `FAQ maksimal 6 pertanyaan, ditemukan ${jumlahFaq}`)
})
