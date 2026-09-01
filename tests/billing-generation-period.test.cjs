const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'TagihanPage.tsx'), 'utf8')
const start = server.indexOf("app.post('/api/tagihan/generate'")
const end = server.indexOf("app.put('/api/tagihan/:id/bayar'", start)
const route = server.slice(start, end)

test('dialog mewajibkan satu bulan dan tahun eksplisit', () => {
  assert.match(page, /if \(!genForm\.bulan\)/)
  assert.match(page, /if \(!genForm\.tahun\s*\|\|/)
  assert.match(page, /<select value=\{genForm\.bulan\}/)
})

test('API generate menolak bulan atau tahun kosong dan hanya menyimpan periode tunggal', () => {
  assert.match(route, /Bulan wajib diisi/)
  assert.match(route, /Tahun wajib diisi/)
  assert.match(route, /const normalizedBulan/)
  assert.match(route, /ins\.run\(uuidv4\(\), s\.id, jenis_tagihan_id, normalizedBulan, normalizedTahun/)
  assert.doesNotMatch(route, /for\s*\([^)]*bulan/i)
})

test('API mengembalikan periode dan target agar UI dapat mengonfirmasi hasil', () => {
  assert.match(route, /periode:\s*\{\s*bulan:\s*normalizedBulan,\s*tahun:\s*normalizedTahun\s*\}/)
  assert.match(route, /target_count:\s*siswaList\.length/)
})
