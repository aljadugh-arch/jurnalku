const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const page = fs.readFileSync(path.join(root, 'src/pages/admin/JadwalUjianPage.tsx'), 'utf8')

test('JadwalUjianPage menyediakan tombol Import Excel', () => {
  assert.match(page, /import ImportExcel from/)
  assert.match(page, /<ImportExcel/)
})

test('Import jadwal ujian resolve nama Hari\\/Rombel\\/Mapel\\/Guru ke ID sebelum POST', () => {
  assert.match(page, /columnMap=\{\{/)
  assert.match(page, /rombels\.find/)
  assert.match(page, /\/jadwal-ujian/)
})

test('Import jadwal ujian tetap mengirim template_id yang sedang aktif dipilih', () => {
  const importBlock = page.match(/<ImportExcel[\s\S]*?\/>/)?.[0] || ''
  assert.match(importBlock, /selectedTemplate/)
})
