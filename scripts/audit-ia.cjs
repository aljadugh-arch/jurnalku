'use strict'
// Audit IA sidebar PER PERAN: berapa menu masuk grup yang benar vs tercecer ke
// "LAINNYA". Ini yang menentukan apakah user bisa menemukan fitur.
const fs = require('node:fs')
const path = require('node:path')
const AKAR = path.join(__dirname, '..')
const menuSrc = fs.readFileSync(path.join(AKAR, 'src/lib/menuItems.tsx'), 'utf8')
const sideSrc = fs.readFileSync(path.join(AKAR, 'src/components/layout/Sidebar.tsx'), 'utf8')

// Ambil blok per peran
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

// Label top-level (induk) per peran — anak tidak dihitung karena dirender
// di dalam induknya, bukan sebagai grup terpisah.
function labelInduk(blok) {
  const hasil = []
  // label yang TIDAK berada di dalam children
  const tanpaChildren = blok.replace(/children:\s*\[[\s\S]*?\]\s*\}/g, '')
  for (const m of tanpaChildren.matchAll(/label:\s*'([^']+)'/g)) hasil.push(m[1])
  return hasil
}

// Grup sidebar
const grupBlok = sideSrc.match(/const adminMenuGroups[\s\S]*?\n  \]/)
const grupRaw = grupBlok ? grupBlok[0] : ''
const grup = []
for (const m of grupRaw.matchAll(/\{\s*name:\s*'([^']+)',\s*labels:\s*\[([\s\S]*?)\]\s*\}/g)) {
  const labels = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1])
  grup.push({ name: m[1], labels })
}
const semuaLabelGrup = new Set(grup.flatMap(g => g.labels))

console.log('=== GRUP SIDEBAR (' + grup.length + ' grup, ' + semuaLabelGrup.size + ' label) ===')
for (const g of grup) console.log('  ' + g.name.padEnd(26) + g.labels.length + ' label')

// Label grup yang tidak ada di menu mana pun = entri mati
const semuaLabelMenu = new Set(Object.values(peran).flatMap(labelInduk))
const mati = [...semuaLabelGrup].filter(l => !semuaLabelMenu.has(l))
console.log('\n=== LABEL GRUP MATI (tidak ada menunya, sia-sia) ===')
if (!mati.length) console.log('  (tidak ada)')
else mati.forEach(l => console.log('  - ' + l))

// Per peran: berapa yang tercecer
console.log('\n=== PER PERAN: menu tercecer ke "LAINNYA" ===')
for (const [nama, blok] of Object.entries(peran)) {
  const induk = labelInduk(blok)
  const tercecer = induk.filter(l => !semuaLabelGrup.has(l))
  const persen = induk.length ? Math.round((tercecer.length / induk.length) * 100) : 0
  console.log('\n  ' + nama + ': ' + induk.length + ' menu induk, ' + tercecer.length + ' tercecer (' + persen + '%)')
  if (tercecer.length) console.log('    ' + tercecer.join(', '))
}
