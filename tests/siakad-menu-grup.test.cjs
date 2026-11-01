'use strict'
// Kontrak: menu "SIAKAD (KRS & IPK)" terkelompok di grup PENILAIAN & EVALUASI
// (bukan jatuh ke safety-net "BELUM TERKELOMPOK" di dasar sidebar), sehingga
// mudah terlihat pada tenant PT/demo-kampus.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/layout/Sidebar.tsx'), 'utf8')

test('SIAKAD (KRS & IPK) ada di grup PENILAIAN & EVALUASI', () => {
  const m = src.match(/name: 'PENILAIAN & EVALUASI', labels: \[([^\]]+)\]/)
  assert.ok(m, 'grup PENILAIAN & EVALUASI harus ada')
  assert.match(m[1], /SIAKAD \(KRS & IPK\)/, 'SIAKAD harus terdaftar di grup PENILAIAN & EVALUASI')
})

test('menu SIAKAD juga ada di daftar menu (menuItems)', () => {
  const mi = fs.readFileSync(path.join(__dirname, '..', 'src/lib/menuItems.tsx'), 'utf8')
  assert.match(mi, /SIAKAD \(KRS & IPK\)/, 'SIAKAD ada di menuItems')
})
