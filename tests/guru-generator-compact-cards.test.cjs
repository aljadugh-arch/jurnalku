const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/guru/GuruModulAjarPage.tsx'), 'utf8')

test('menu generator memakai kartu pipih responsif tanpa grid lima kolom yang sempit', () => {
  assert.match(source, /grid-cols-1[^"\n]*sm:grid-cols-2[^"\n]*lg:grid-cols-3/)
  assert.doesNotMatch(source, /xl:grid-cols-5/)
  assert.match(source, /min-h-\[64px\][^"\n]*items-center/)
})

test('isi kartu menu menjaga ikon dan teks agar tidak bertabrakan', () => {
  assert.match(source, /shrink-0[^>]*><FileText/)
  assert.match(source, /min-w-0[^>]*><strong/)
  assert.match(source, /line-clamp-1/)
  assert.match(source, /aria-pressed=\{form\.type === item\.value\}/)
})
