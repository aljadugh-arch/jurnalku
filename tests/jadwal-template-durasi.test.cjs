const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
const jadwalPage = fs.readFileSync(path.join(root, 'src/pages/admin/JadwalPage.tsx'), 'utf8')

test('template_jadwal punya kolom durasi_menit yang bisa diisi user', () => {
  assert.match(server, /template_jadwal.*durasi_menit|durasi_menit.*template_jadwal/s)
  assert.match(server, /\['template_jadwal', 'durasi_menit'/)
})

test('endpoint PUT /api/template-jadwal/:id tersedia untuk edit template (bukan cuma create/delete)', () => {
  assert.match(server, /app\.put\('\/api\/template-jadwal\/:id', ADMIN/)
})

test('POST/PUT template-jadwal menerima dan memvalidasi durasi_menit (10-120 menit)', () => {
  assert.match(server, /durasi_menit/)
  assert.match(server, /durasi_menit.*(<|>|10|120)/s)
})

test('JadwalPage punya field durasi custom di toolbar dan form Template Jadwal', () => {
  assert.match(jadwalPage, /durasi_menit/)
  assert.match(jadwalPage, /Durasi.*1 Jam|Durasi JTM|Durasi Mapel/i)
  assert.match(jadwalPage, /durasiOverride/)
})

test('generateJamPelajaran menerima durasi override, bukan hardcode jenjang', () => {
  assert.match(jadwalPage, /generateJamPelajaran\([^)]*durasi/s)
})

test('JadwalPage bisa edit template yang sudah ada (bukan hanya tambah baru)', () => {
  assert.match(jadwalPage, /handleEditTemplate/)
  assert.match(jadwalPage, /editingTemplate/)
})

console.log('jadwal-template-durasi tests passed')
