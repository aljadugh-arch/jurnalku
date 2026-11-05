'use strict'
// Pintasan papan tombol desktop: Ctrl/⌘+K (palet), Alt+1..9 (menu sesuai urutan
// sidebar peran), ? (bantuan). Harus mati saat mengetik dan di layar ponsel.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
const komponen = baca('src/components/KeyboardShortcuts.tsx')
const layout = baca('src/components/layout/DashboardLayout.tsx')
const header = baca('src/components/layout/Header.tsx')

test('palet perintah: Ctrl/⌘+K dan daftar menu mengikuti peran', () => {
  assert.match(komponen, /e\.ctrlKey \|\| e\.metaKey/, 'mendukung Ctrl dan ⌘')
  assert.match(komponen, /e\.key\.toLowerCase\(\) === 'k'/, 'tombol K')
  assert.match(komponen, /flattenMenu\(menuForRole\(role\)\)/, 'menu diambil dari peran pengguna')
  assert.match(komponen, /m\.label\.toLowerCase\(\)\.includes\(q\)/, 'pencarian berdasarkan label')
  assert.match(komponen, /if \(e\.key === 'Enter'\)/, 'Enter membuka hasil terpilih')
})

test('Alt+1..9 membuka menu ke-n dan tidak bentrok saat mengetik', () => {
  assert.match(komponen, /e\.altKey && !e\.ctrlKey && !e\.metaKey && \/\^\[1-9\]\$\//, 'hanya Alt + 1..9')
  assert.match(komponen, /const urut = Number\(e\.key\) - 1/, 'indeks menu dari angka')
  assert.match(komponen, /tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT' \|\| node\.isContentEditable/, 'abaikan saat fokus di kolom isian')
  assert.match(komponen, /window\.innerWidth < 1024/, 'tidak aktif di layar ponsel')
})

test('bantuan ? dan Esc, plus tombol di header', () => {
  assert.match(komponen, /e\.key === '\?'/, 'tombol ? membuka bantuan')
  assert.match(komponen, /e\.key === 'Escape'/, 'Esc menutup')
  assert.match(header, /jurnalku:bantuan-pintasan/, 'header mengirim event bantuan')
  assert.match(komponen, /addEventListener\('jurnalku:bantuan-pintasan'/, 'komponen mendengarkan event itu')
})

test('dipasang di layout dasbor dan menyebut menu pertama per peran', () => {
  assert.match(layout, /import KeyboardShortcuts from '\.\.\/KeyboardShortcuts'/, 'diimpor')
  assert.match(layout, /<KeyboardShortcuts \/>/, 'dirender di dalam layout')
  assert.match(komponen, /menu\.slice\(0, 9\)/, 'bantuan menampilkan sembilan menu pertama')
})

test('palet bisa dipilih dengan keyboard, bukan hanya klik', () => {
  // Navigasi harus berada SEBELUM penjaga "sedang mengetik", karena fokus
  // berada di kolom pencarian palet.
  const posisiNavigasi = komponen.indexOf("if (paletBuka) {")
  const posisiPenjaga = komponen.indexOf('if (sedangMengetik(e.target)) return')
  assert.ok(posisiNavigasi > 0, 'blok navigasi palet ada')
  assert.ok(posisiPenjaga > 0, 'penjaga pengetikan ada')
  assert.ok(posisiNavigasi < posisiPenjaga, 'navigasi palet diperiksa sebelum penjaga')

  assert.match(komponen, /e\.key === 'ArrowDown'/)
  assert.match(komponen, /e\.key === 'ArrowUp'/)
  assert.match(komponen, /e\.key === 'Enter'/)
  assert.match(komponen, /const pilih = hasil\[sorot\] \|\| hasil\[0\]/, 'Enter memilih baris tersorot')
  assert.match(komponen, /data-sorot=/, 'baris tersorot ditandai untuk digulir')
})
