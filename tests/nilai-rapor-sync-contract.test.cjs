const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Kontrak alur nilai guru: simpan -> tersimpan -> terbaca ulang -> rapor terbarui.
// Tes membaca sumber karena index.cjs hanya bisa dijalankan sebagai server.
const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server', 'index.cjs'), 'utf8')
const service = fs.readFileSync(path.join(root, 'server', 'rapor-grade-service.cjs'), 'utf8')

test('GET /api/rapor menerima jenis asesmen kanonik sts/sas dan alias sumatif', () => {
  assert.match(server, /function validateRaporPeriod[\s\S]{0,400}'sts'[\s\S]{0,120}'sas'/, 'validasi menerima sts/sas')
  assert.match(server, /jenis === 'sumatif'[\s\S]{0,200}IN \('sts','sas'\)|IN \('sts', 'sas'\)/, 'alias sumatif membaca baris sts+sas')
})

test('penulisan nilai asesmen melaporkan jumlah tersimpan dan item yang dilewati', () => {
  const endpoint = server.match(/app\.post\('\/api\/rapor\/asesmen'[\s\S]*?\n\}\)\n/)?.[0] || ''
  assert.ok(endpoint, 'endpoint asesmen ditemukan')
  assert.match(endpoint, /skipped/, 'endpoint melaporkan item yang tidak tersimpan')
  assert.match(endpoint, /count/, 'endpoint melaporkan jumlah tersimpan')
})

test('nilai sumatif menghitung count hanya untuk item yang benar-benar tersimpan', () => {
  const endpoint = server.match(/app\.post\('\/api\/rapor\/nilai-sumatif'[\s\S]*?\n\}\)\n/)?.[0] || ''
  assert.ok(endpoint, 'endpoint sumatif ditemukan')
  assert.match(endpoint, /if \(!written\) \{ skipped\+\+; continue \}/, 'item tanpa nilai tidak dihitung')
})

test('setiap penulisan nilai menghitung ulang rapor yang sudah digenerate', () => {
  assert.match(server, /refreshGeneratedRapor/, 'service sinkronisasi dipakai index.cjs')
  const writes = [
    /app\.post\('\/api\/penilaian-harian'[\s\S]*?\n\}\)\n/,
    /app\.post\('\/api\/penilaian-harian\/bulk'[\s\S]*?\n\}\)\n/,
    /app\.put\('\/api\/penilaian-harian\/:id'[\s\S]*?\n\}\)\n/,
    /app\.delete\('\/api\/penilaian-harian\/:id'[\s\S]*?\n\}\)\n/,
    /app\.post\('\/api\/rapor\/asesmen'[\s\S]*?\n\}\)\n/,
    /app\.post\('\/api\/rapor\/nilai-sumatif'[\s\S]*?\n\}\)\n/,
  ]
  for (const pattern of writes) {
    const block = server.match(pattern)?.[0]
    assert.ok(block, `blok endpoint ditemukan: ${pattern}`)
    assert.match(block, /refreshRaporSetelahNilaiBerubah|refreshGeneratedRapor/, `hitung ulang rapor ada di blok: ${pattern}`)
  }
})

test('service sinkronisasi mengekspor helper dan tidak pernah membuat rapor baru', () => {
  assert.match(service, /module\.exports = \{ generateRaporForRombel, refreshGeneratedRapor, periodFromTanggal \}/)
  const sync = service.match(/function refreshGeneratedRapor[\s\S]*?\n\}\n/)?.[0] || ''
  assert.ok(sync, 'helper refreshGeneratedRapor ada')
  assert.doesNotMatch(sync, /INSERT INTO rapor/, 'hitung ulang tidak boleh menyisipkan baris rapor baru')
  assert.match(sync, /UPDATE rapor SET/, 'hanya baris yang sudah ada yang diperbarui')
})
