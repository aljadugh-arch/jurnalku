const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server', 'index.cjs'), 'utf8')
const siswaPage = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
const scanPage = fs.readFileSync(path.join(root, 'src', 'pages', 'guru', 'GuruAbsensiSiswaQRPage.tsx'), 'utf8')

test('kolom rfid_uid dimigrasi + tersimpan di impor & edit siswa', () => {
  assert.match(server, /\['siswa', 'rfid_uid', 'TEXT'\]/, 'migrasi kolom rfid_uid')
  // INSERT bulk-import menyertakan rfid_uid
  const bi = server.slice(server.indexOf("app.post('/api/siswa/bulk-import'"))
  const biEnd = bi.indexOf('\napp.')
  assert.match(bi.slice(0, biEnd > -1 ? biEnd : bi.length), /rfid_uid/, 'bulk-import menyimpan rfid_uid')
  // PUT /api/siswa/:id mengizinkan rfid_uid
  assert.match(server, /'kerja_wali', 'rfid_uid',/, 'PUT siswa menerima rfid_uid')
})

test('endpoint absensi RFID + device (API key) ada', () => {
  assert.match(server, /app\.post\('\/api\/absensi-siswa\/rfid-scan'/, 'route rfid-scan')
  assert.match(server, /app\.post\('\/api\/external\/v1\/absensi\/scan', apiKeyMiddleware/, 'route device scan ber-API-key')
  assert.match(server, /function resolveStudentByScan/, 'helper resolveStudentByScan')
})

test('endpoint pemetaan UID kartu ada', () => {
  assert.match(server, /app\.get\('\/api\/siswa\/rfid'/, 'list RFID')
  assert.match(server, /app\.put\('\/api\/siswa\/:id\/rfid'/, 'set UID')
})

test('UI: kolom RFID UID di impor siswa + mode RFID di halaman scan', () => {
  assert.match(siswaPage, /'RFID UID': 'rfid_uid'/, 'columnMap RFID UID')
  assert.match(scanPage, /rfid-scan/, 'halaman scan memanggil rfid-scan')
  assert.match(scanPage, /setMode\('rfid'\)/, 'tombol mode RFID')
})

test('template Excel impor siswa memuat kolom RFID UID', () => {
  const XLSX = require('xlsx')
  const wb = XLSX.readFile(path.join(root, 'public', 'templates', 'template-import-siswa.xlsx'))
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  assert.ok(rows[0].map(h => String(h).trim()).includes('RFID UID'), 'header RFID UID ada di template')
})
