'use strict'
// Setelah deploy, halaman yang sudah terbuka tidak boleh mati karena chunk lama
// hilang ("Failed to fetch dynamically imported module"). Dua lapis:
//  1. Deploy mempertahankan chunk lama (30 hari) sehingga URL lama tetap ada.
//  2. Klien menyegarkan halaman sekali bila import dinamis tetap gagal.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const promote = fs.readFileSync(path.join(root, 'scripts/promote-live.sh'), 'utf8')
const boundary = fs.readFileSync(path.join(root, 'src/components/ErrorBoundary.tsx'), 'utf8')
const main = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8')
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8')

test('promote mempertahankan aset lama agar chunk yang sudah terbuka tetap ada', () => {
  assert.match(promote, /cp -an "\$SUMBER\/\." "\$D\/assets\/"/,
    'menyalin aset lama tanpa menimpa aset baru')
  assert.match(promote, /find "\$D\/assets" -type f -mtime \+30 -delete/,
    'aset lebih tua dari 30 hari dibersihkan')
  const posisiSalin = promote.indexOf('cp -an "$SUMBER/.')
  const posisiHapus = promote.indexOf('rm -rf "$LIVE/dist" "$SECONDARY_LIVE/dist"')
  assert.ok(posisiSalin > 0 && posisiSalin < posisiHapus, 'penyalinan dilakukan sebelum dist diganti')
})

test('ErrorBoundary menyegarkan sekali saat chunk hilang, bukan menampilkan error', () => {
  assert.match(boundary, /dynamically imported module/)
  assert.match(boundary, /export function segarkanSekali/)
  assert.match(boundary, /Date\.now\(\) - terakhir < JEDA_RELOAD_MS\) return false/,
    'ada jeda agar tidak terjadi loop reload')
  assert.match(boundary, /window\.location\.reload\(\)/)
  assert.match(boundary, /Menyegarkan halaman…/)
})

test('import dinamis di luar render juga ditangkap', () => {
  assert.match(main, /addEventListener\('unhandledrejection'/)
  assert.match(main, /segarkanSekali\(\)/)
  assert.match(main, /tagName === 'SCRIPT'/)
})

test('cache service worker dinaikkan agar entri lama dibuang', () => {
  assert.match(sw, /const CACHE = 'jurnalku-v11'/)
})
