'use strict'
// Kontrak: pintasan dashboard siswa mereferensikan HALAMAN (navigate), bukan
// scroll ke seksi beranda — supaya halaman jadwal/nilai/tugas/ekskul/dst bisa
// dijangkau dan tidak kosong.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('kartu pintasan dashboard siswa menavigasi ke halaman, bukan scroll seksi', () => {
  const dash = baca('src/pages/siswa/SiswaDashboard.tsx')
  for (const [label, path_] of [
    ['Tabungan', '/siswa/tabungan'],
    ['Tagihan', '/siswa/tagihan'],
    ['Nilai', '/siswa/nilai'],
    ['Tugas', '/siswa/tugas'],
    ['Ekskul', '/siswa/ekskul'],
    ['Jadwal', '/siswa/jadwal'],
    ['Perpus Digital', '/siswa/perpustakaan'],
    ['Kehadiran', '/siswa/absensi'],
  ]) {
    const rx = new RegExp(`\\['${label}', \\(\\) => navigate\\('${path_}'\\),`)
    assert.ok(rx.test(dash), `kartu ${label} harus navigate('${path_}')`)
  }
  // Tidak boleh ada kartu yang cuma scroll ke seksi (goSection).
  assert.doesNotMatch(dash, /goSection\('(tabungan|tagihan|nilai|tugas|catatan)'\)/, 'kartu tidak boleh memakai goSection')
})

test('menu & bottom-nav siswa mengarah ke route yang sama (konsisten)', () => {
  const menu = baca('src/lib/menuItems.tsx')
  const nav = baca('src/components/layout/BottomNavigation.tsx')
  for (const p of ['/siswa/absensi', '/siswa/jadwal', '/siswa/nilai', '/siswa/tugas', '/siswa/tagihan', '/siswa/tabungan', '/siswa/ekskul', '/siswa/perpustakaan']) {
    assert.ok(menu.includes(p), `menu siswa harus memuat ${p}`)
  }
  assert.ok(nav.includes('/siswa/absensi') && nav.includes('/siswa/tabungan'), 'bottom-nav siswa harus memuat absensi & tabungan')
})

test('setiap halaman siswa yang direferensikan terdaftar sebagai route', () => {
  const app = baca('src/App.tsx')
  for (const p of ['absensi', 'jadwal', 'nilai', 'tugas', 'tagihan', 'tabungan', 'ekskul', 'perpustakaan']) {
    assert.ok(new RegExp(`path="${p}"`).test(app), `route /siswa/${p} harus ada`)
  }
})
