const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const page = read('src/pages/admin/PanduanAbsensiAlatPage.tsx')
const app = read('src/App.tsx')
const menu = read('src/lib/menuItems.tsx')

test('halaman Panduan Alat Absensi ada & terdaftar di route + menu', () => {
  assert.match(page, /Panduan Alat Absensi/, 'judul halaman')
  assert.match(app, /PanduanAbsensiAlatPage = lazy\(\(\) => import\('\.\/pages\/admin\/PanduanAbsensiAlatPage'\)\)/, 'lazy import')
  assert.match(app, /path="panduan-absensi-alat"/, 'route terdaftar')
  assert.match(menu, /Panduan Alat Absensi.*\/admin\/panduan-absensi-alat/, 'menu terdaftar')
})

test('panduan mencakup 4 jalur alat + endpoint device', () => {
  for (const k of ['QR — HP / Tablet / Kamera', 'Scanner USB', 'RFID — Reader USB', 'Alat Mandiri']) {
    assert.ok(page.includes(k), `bagian "${k}" ada`)
  }
  assert.match(page, /\/api\/external\/v1\/absensi\/scan/, 'endpoint device didokumentasikan')
  assert.match(page, /absensi:write/, 'izin absensi:write disebut')
  assert.match(page, /rfid_uid/, 'contoh payload rfid_uid')
})

test('panduan menautkan ke halaman terkait (Kartu RFID, Developer API, scan)', () => {
  assert.match(page, /to: '\/admin\/rfid'/, 'tautan Kartu RFID')
  assert.match(page, /to: '\/admin\/developer-api'/, 'tautan Developer API')
  assert.match(page, /to: '\/guru\/absensi-siswa'/, 'tautan halaman scan guru')
})

test('menu Kartu RFID ada di grup Absensi, bukan sebagai item top-level', () => {
  // Boleh muncul di >1 daftar menu (per role), tapi tidak boleh jadi item top-level (ber-ikon).
  assert.doesNotMatch(menu, /\{ label: 'Kartu RFID', icon:/, 'Kartu RFID bukan item top-level')
  const inAbsensi = menu.match(/'Absensi QR Siswa', path: '\/admin\/absensi-qr-siswa' \},\s*\n\s*\{ label: 'Kartu RFID'/g) || []
  assert.ok(inAbsensi.length >= 1, 'Kartu RFID berada tepat setelah Absensi QR Siswa (grup Absensi)')
})
