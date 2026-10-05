'use strict'
// Penjaga regresi tata letak: wadah scroll horizontal (overflow-x-auto) yang
// memakai margin negatif (-mx-N) akan menonjol keluar dari kartu ber-overflow
// hidden sehingga isinya terpotong di mobile/tablet. Pola ini pernah dipakai di
// 11 tempat (semua tabel absensi/rekap) dan menyebabkan tabel terpotong ~8px.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', 'src')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.bak')) out.push(p)
  }
  return out
}

test('tidak ada wadah scroll dengan margin negatif (menyebab terpotong di mobile)', () => {
  const pelanggar = []
  for (const f of walk(ROOT)) {
    const isi = fs.readFileSync(f, 'utf8')
    isi.split('\n').forEach((line, i) => {
      // overflow-x-auto digabung -mx-N dalam satu className
      if (/overflow-(x-)?auto[^"'`]*\s-mx-\d/.test(line)) pelanggar.push(`${path.relative(ROOT, f)}:${i + 1}`)
    })
  }
  assert.deepEqual(pelanggar, [], `wadah scroll bermargin negatif: ${pelanggar.join(', ')}`)
})

test('setiap tabel pada halaman admin dibungkus wadah scroll horizontal', () => {
  const tanpa = []
  for (const f of walk(path.join(ROOT, 'pages'))) {
    const isi = fs.readFileSync(f, 'utf8')
    // Hanya tabel JSX yang relevan; <table> di dalam template literal (mis.
    // dokumen cetak window.print) tidak dirender di halaman.
    let adaTableJsx = false
    let idx = -1
    while ((idx = isi.indexOf('<table', idx + 1)) !== -1) {
      const backticksBefore = (isi.slice(0, idx).match(/`/g) || []).length
      if (backticksBefore % 2 === 0) { adaTableJsx = true; break }
    }
    if (!adaTableJsx) continue
    if (!/overflow-(x-)?auto/.test(isi)) tanpa.push(path.relative(ROOT, f))
  }
  assert.deepEqual(tanpa, [], `halaman dengan <table> tanpa overflow-x-auto: ${tanpa.join(', ')}`)
})
