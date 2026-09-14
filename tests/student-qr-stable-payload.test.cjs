const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
const printPage = fs.readFileSync(path.join(root, 'src/pages/admin/AbsensiSiswaPage.tsx'), 'utf8')

test('QR baru memakai siswa.id yang stabil, bukan NIS/NISN', () => {
  const route = server.slice(server.indexOf("app.get('/api/siswa/qr-identifiers'"), server.indexOf("app.get('/api/guru/absensi-saya'"))
  assert.match(route, /identifier:\s*siswa\.id/)
  assert.match(route, /identifier_type:\s*'ID SISWA'/)
  assert.doesNotMatch(route, /identifier:\s*studentActiveIdentifier\(siswa\)/)
  assert.match(printPage, /QRCode\.toCanvas\(source, student\.identifier/)
})

test('QR lama tetap kompatibel melalui tabel mapping historis', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS qr_siswa_identifiers/)
  assert.match(server, /INSERT OR IGNORE INTO qr_siswa_identifiers/)
  const route = server.slice(server.indexOf("app.post('/api/absensi-siswa/qr-scan'"), server.indexOf('// ==================== ABSENSI GURU'))
  assert.match(route, /FROM qr_siswa_identifiers WHERE tenant_id=\? AND token=\?/)
  assert.match(route, /Fallback tambahan untuk QR lama\/manual/)
  assert.match(server, /rememberStudentQrIdentifiers\(siswa, req\.tenantId\)/)
})

test('mapping QR lama diisi sebelum perubahan NIS/NISN dan riwayat absensi tetap memakai siswa_id', () => {
  assert.match(server, /function backfillLegacyQrIdentifiers\(\)/)
  assert.match(server, /studentActiveIdentifier\(siswa\)/)
  assert.match(server, /qr_siswa_identifiers.*siswa_id/s)
  assert.match(server, /writeDailyAttendanceSession\(db, \{[\s\S]*siswaId: siswa\.id/)
})
