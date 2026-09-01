const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
const adminPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'AbsensiGuruPage.tsx'), 'utf8')

function routeBody(start, end) {
  const from = server.indexOf(start)
  assert.notEqual(from, -1, `route tidak ditemukan: ${start}`)
  const to = server.indexOf(end, from)
  return server.slice(from, to === -1 ? server.length : to)
}

test('ceklok masuk hanya dianggap selesai bila waktu_masuk benar-benar terisi', () => {
  const route = routeBody("app.post('/api/guru/ceklok', STAFF", '// ==================== JAMAAH')
  assert.match(route, /if \(exists\?\.waktu_masuk\) return res\.status\(400\)\.json\(\{ error: 'Sudah ceklok masuk hari ini' \}\)/)
  assert.match(route, /if \(exists\)[\s\S]*UPDATE absensi_guru SET waktu_masuk=\?, status=\?, latitude=\?, longitude=\? WHERE id=\? AND tenant_id=\?/)
})

test('memuat jadwal guru tidak mengisi jam ceklok dari jam pelajaran', () => {
  assert.doesNotMatch(adminPage, /waktu_masuk: existing\?\.waktu_masuk \|\| g\.waktu_masuk/)
  assert.doesNotMatch(adminPage, /waktu_pulang: existing\?\.waktu_pulang \|\| g\.waktu_pulang/)
  assert.match(adminPage, /waktu_masuk: existing\?\.waktu_masuk \|\| ''/)
  assert.match(adminPage, /waktu_pulang: existing\?\.waktu_pulang \|\| ''/)
})

test('simpan batch jadwal tidak membuat waktu ceklok dari jadwal mengajar', () => {
  const route = routeBody("app.post('/api/absensi-guru/batch-jadwal', STAFF", '// ==================== JURNAL MENGAJAR')
  assert.doesNotMatch(route, /d\.waktu_masuk/)
  assert.doesNotMatch(route, /d\.waktu_pulang/)
  assert.match(route, /else if \(d\.status !== 'hadir'\)/)
  assert.match(adminPage, /status: existing\?\.status \|\| ''/)
})
