// Penegakan kuota siswa/GTK per tenant (freemium default 100 siswa / 20 GTK).
//
// Sebelumnya max_siswa/max_gtk HANYA disimpan di data tenant, tidak pernah
// ditegakkan — siswa ke-101+ tetap bisa dibuat walau kuota tertulis 100.
// Sekarang: pembuatan siswa (tunggal & bulk) dan GTK ditolak (403) bila kuota
// habis. Nilai max <= 0 berarti TANPA kuota (unlimited).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const idx = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8')

test('helper kuota ada dan menghitung siswa aktif / gtk', () => {
  assert.match(idx, /function cekKuotaTenant\(db, tenantId, jenis\)/, 'helper kuota')
  assert.match(idx, /COALESCE\(status,'aktif'\)='aktif'/, 'hitung siswa AKTIF saja')
  assert.match(idx, /SELECT COUNT\(\*\) c FROM gtk WHERE tenant_id=\?/, 'hitung gtk')
  assert.match(idx, /if \(!batas \|\| batas <= 0\) return \{ batas: 0, aktif: 0, sisa: Infinity \}/, '0 = unlimited')
})

test('pembuatan siswa tunggal menolak saat kuota habis', () => {
  const awal = idx.indexOf("app.post('/api/siswa', ADMIN")
  const blok = idx.slice(awal, idx.indexOf("app.put('/api/siswa/:id'", awal))
  assert.match(blok, /kuotaSiswa\.sisa <= 0/, 'tolak bila kuota habis')
  assert.match(blok, /Kuota siswa lembaga ini sudah penuh/, 'pesan jelas')
})

test('bulk import menolak bila melebihi sisa kuota', () => {
  const awal = idx.indexOf("app.post('/api/siswa/bulk-import'")
  const blok = idx.slice(awal, idx.indexOf("app.post('/api/siswa', ADMIN", awal))
  assert.match(blok, /students\.length > kuota\.sisa/, 'cek ukuran batch vs sisa')
  assert.match(blok, /Kuota tersisa \$\{kuota\.sisa\} siswa/, 'pesan menyebut sisa')
})

test('pembuatan GTK menolak saat kuota habis', () => {
  const awal = idx.indexOf("app.post('/api/gtk', ADMIN")
  const blok = idx.slice(awal, idx.indexOf("app.put('/api/gtk/:id'", awal))
  assert.match(blok, /kuotaGtk\.sisa <= 0/, 'tolak bila kuota habis')
  assert.match(blok, /Kuota GTK lembaga ini sudah penuh/, 'pesan jelas')
})
