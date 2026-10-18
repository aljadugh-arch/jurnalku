'use strict'
// Audit UX navigasi JURNALKU — dibaca dari sumber, bukan tebakan.
//
// Yang diperiksa:
//   1. Menu yang route-nya TIDAK ada di App.tsx  -> klik = halaman kosong/404
//   2. Route publik/staff yang TIDAK punya menu  -> fitur tak bisa ditemukan
//   3. Duplikasi item antara Sidebar dan BottomNavigation
//   4. Beban menu per peran (beban kognitif)
//   5. Grup yang terlalu gemuk (dropdown panjang)
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

const menuSrc = baca('src/lib/menuItems.tsx')
const appSrc = baca('src/App.tsx')
const sideSrc = baca('src/components/layout/Sidebar.tsx')
const bottomSrc = baca('src/components/layout/BottomNavigation.tsx')

// ---- 1. Kumpulkan path dari menu, per peran ----
const peran = {}
for (const m of menuSrc.matchAll(/(?:export )?const (\w+)\s*:\s*MenuItem\[\]\s*=\s*\[/g)) {
  const nama = m[1]
  const start = m.index + m[0].length - 1
  let depth = 0, i = start
  for (; i < menuSrc.length; i++) {
    if (menuSrc[i] === '[') depth++
    else if (menuSrc[i] === ']') { depth--; if (depth === 0) break }
  }
  peran[nama] = menuSrc.slice(start, i + 1)
}

// ---- 2. Route yang benar-benar terdaftar di App.tsx ----
const routes = new Set()
for (const m of appSrc.matchAll(/<Route\s+path="([^"]+)"/g)) routes.add(m[1])
// Route bersarang: <Route path="siswa" ...> di dalam /admin -> /admin/siswa
const bersarang = []
for (const m of appSrc.matchAll(/path="([a-z0-9-]+)"/g)) bersarang.push(m[1])

// Normalisasi path menu -> apakah mungkin dilayani
const pathMenu = new Set()
for (const blok of Object.values(peran)) {
  for (const m of blok.matchAll(/path:\s*'([^']+)'/g)) pathMenu.add(m[1])
}

// Path menu berbentuk '/admin/siswa' atau '/siswa#kehadiran' (hash = section di
// halaman yang sama, bukan route terpisah). Buang hash dulu.
const tanpaHash = (p) => p.split('#')[0]
const kandidat = [...pathMenu].map(tanpaHash).filter(p => p.startsWith('/'))

// Cocokkan: route statis persis, atau segmen terakhir ada sebagai route bersarang
const routeStatis = new Set()
for (const m of appSrc.matchAll(/path="(\/[^"]*)"/g)) routeStatis.add(m[1])
const segmenAda = new Set(bersarang)

const takKetemu = kandidat.filter(p => {
  if (routeStatis.has(p)) return false
  const seg = p.split('/').filter(Boolean).pop() || ''
  if (segmenAda.has(seg)) return false
  // rute dinamis /posting/:id dsb
  if (/:\w+/.test(p)) return false
  return true
})

console.log('=== 1. MENU TANPA ROUTE (klik = halaman kosong) ===')
if (takKetemu.length === 0) console.log('  (tidak ada — semua menu punya route)')
else for (const p of [...new Set(takKetemu)].sort()) console.log('  ✖ ' + p)

// ---- 3. Duplikasi Sidebar vs BottomNavigation ----
const pathBottom = [...bottomSrc.matchAll(/path:\s*'([^']+)'/g)].map(m => m[1])
const labelBottom = [...bottomSrc.matchAll(/label:\s*'([^']+)'/g)].map(m => m[1])
console.log('\n=== 2. BOTTOM NAVIGATION ===')
console.log('  jumlah item:', pathBottom.length, '| unik:', new Set(pathBottom).size)
const dobelBottom = pathBottom.filter((p, i) => pathBottom.indexOf(p) !== i)
if (dobelBottom.length) console.log('  ✖ path dobel di bottom nav:', [...new Set(dobelBottom)])
else console.log('  ✓ tidak ada path dobel di bottom nav')

// Item bottom nav yang juga ada di menu sidebar peran yang sama = wajar (shortcut),
// TAPI kalau labelnya berbeda untuk path sama, itu membingungkan.
const labelSide = new Map()
for (const blok of Object.values(peran)) {
  for (const m of blok.matchAll(/label:\s*'([^']+)'[\s\S]{0,80}?path:\s*'([^']+)'/g)) {
    if (!labelSide.has(m[2])) labelSide.set(m[2], new Set())
    labelSide.get(m[2]).add(m[1])
  }
}
console.log('\n=== 3. LABEL BERBEDA UNTUK PATH YANG SAMA (membingungkan) ===')
let beda = 0
for (const [p, labels] of labelSide) {
  if (labels.size > 1) {
    beda++
    console.log('  ⚠ ' + p + '  ->  ' + [...labels].join(' / '))
  }
}
if (!beda) console.log('  (tidak ada)')

// ---- 4. Beban menu per peran ----
console.log('\n=== 4. BEBAN MENU PER PERAN ===')
const ringkas = []
for (const [nama, blok] of Object.entries(peran)) {
  const item = [...blok.matchAll(/path:\s*'/g)].length
  const grup = [...blok.matchAll(/children:\s*\[/g)].length
  ringkas.push({ nama, item, grup })
}
ringkas.sort((a, b) => b.item - a.item)
for (const r of ringkas) {
  const tanda = r.item > 40 ? '  <-- TERLALU BANYAK' : r.item > 25 ? '  <-- padat' : ''
  console.log('  ' + r.nama.padEnd(22) + String(r.item).padStart(3) + ' item, ' + r.grup + ' grup' + tanda)
}

// ---- 5. Grup gemuk ----
console.log('\n=== 5. GRUP DENGAN ANAK TERLALU BANYAK ===')
for (const m of menuSrc.matchAll(/label:\s*'([^']+)',\s*icon:[^,]+,\s*children:\s*\[([\s\S]*?)\]\s*\}/g)) {
  const anak = [...m[2].matchAll(/path:\s*'/g)].length
  if (anak >= 6) console.log('  ⚠ ' + m[1] + ': ' + anak + ' anak (dropdown panjang)')
}

// ---- 6. Statistik route ----
console.log('\n=== 6. ROUTE vs MENU ===')
console.log('  route terdaftar di App.tsx :', routes.size)
console.log('  path unik di menu          :', pathMenu.size)
