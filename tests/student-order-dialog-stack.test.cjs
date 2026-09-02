const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const server = read('server/index.cjs')
const tenant = read('server/tenant.cjs')
const modal = read('src/components/ui/Modal.tsx')
const siswa = read('src/pages/admin/DataSiswaPage.tsx')
const gtk = read('src/pages/admin/DataGTKPage.tsx')
const rombel = read('src/pages/admin/RombelPage.tsx')

test('data siswa menempatkan siswa tanpa rombel valid paling bawah', () => {
  const localRoute = server.slice(server.indexOf("app.get('/api/siswa'"), server.indexOf("app.post('/api/siswa'"))
  const foundationRoute = tenant.slice(tenant.indexOf("app.get('/api/foundation/students'"), tenant.indexOf("app.get('/api/foundation/gtk'"))
  assert.match(localRoute, /ORDER BY CASE WHEN r\.id IS NULL THEN 1 ELSE 0 END, s\.nama COLLATE NOCASE/)
  assert.match(foundationRoute, /LEFT JOIN rombel r ON r\.id=s\.rombel_id AND r\.tenant_id=s\.tenant_id/)
  assert.match(foundationRoute, /ORDER BY CASE WHEN r\.id IS NULL THEN 1 ELSE 0 END, s\.nama COLLATE NOCASE/)
})

test('modal bersama dipasang ke document.body dan berada di atas dialog detail lama', () => {
  assert.match(modal, /createPortal\(/)
  assert.match(modal, /document\.body/)
  assert.match(modal, /z-\[120\]/)
  assert.match(modal, /items-center/)
  assert.match(modal, /max-h-\[calc\(100dvh-2rem\)\]/)
})

test('dialog edit dari popup detail memakai modal portal terbaru', () => {
  assert.match(siswa, /<Modal[\s\S]*?open=\{showModal\}/)
  assert.match(gtk, /<Modal[\s\S]*?open=\{showModal\}/)
  assert.match(rombel, /<Modal[\s\S]*?open=\{!!showEditSiswa\}/)
  assert.match(rombel, /<Modal[\s\S]*?open=\{!!showPindah\}/)
})

test('QR masuk dan pulang menulis kolom sesi masing-masing secara langsung', () => {
  const qr = server.slice(server.indexOf("app.post('/api/absensi-siswa/qr-scan'"), server.indexOf('// ==================== ABSENSI GURU'))
  assert.match(qr, /status_pulang=\?, waktu_pulang=\?/) 
  assert.match(qr, /status=\?, waktu_masuk=\?, waktu_absen=\?/) 
  assert.match(qr, /sesi: 'pulang'/)
  assert.match(qr, /sesi: 'masuk'/)
})
