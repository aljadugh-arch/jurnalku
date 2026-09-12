const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const jadwalPage = read('src/pages/admin/JadwalPage.tsx')

// Bug: kotak "Pilih GTK valid" (select bulk-assign guru) berada dalam
// <div className="flex flex-wrap gap-2"> tanpa constraint lebar/min-w-0.
// Elemen flex child default punya min-width:auto, sehingga <select> memaksa
// lebar mengikuti opsi nama guru terpanjang dan overflow/terpotong di
// viewport sempit (mobile/tablet). Perbaikan: select dan tombol memakai
// w-full di mobile, w-auto di layar >=sm, plus min-w-0 pada select supaya
// boleh menyusut di bawah lebar konten intrinsiknya.
test('kotak Pilih GTK valid tidak overflow di mobile/tablet', () => {
  const from = jadwalPage.indexOf('Pilih GTK valid')
  assert.notEqual(from, -1, 'select Pilih GTK valid tidak ditemukan')
  const containerStart = jadwalPage.lastIndexOf('<div', from)
  const containerEnd = jadwalPage.indexOf('</div>', from) + '</div>'.length
  const block = jadwalPage.slice(containerStart, containerEnd)

  // Container membolehkan stack vertikal penuh-lebar di mobile.
  assert.match(block, /flex-col sm:flex-row/)
  // Select boleh menyusut (min-w-0) dan penuh lebar di mobile, auto di >=sm.
  assert.match(block, /<select[\s\S]*?className="w-full sm:w-auto min-w-0\b/)
  // Tombol "Tetapkan guru" juga full-width di mobile agar sejajar rapi.
  assert.match(block, /<button[\s\S]*?className="w-full sm:w-auto\b[\s\S]*?>Tetapkan guru/)
})
