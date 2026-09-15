const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')
const serverSource = read('server/index.cjs')
const jadwalPage = read('src/pages/admin/JadwalPage.tsx')
const settingsPage = read('src/pages/admin/SettingsPage.tsx')

test('server tidak lagi menghardcode Jumat sebagai default hari_libur di schema', () => {
  assert.doesNotMatch(serverSource, /hari_libur['"],\s*"TEXT DEFAULT '\[\\?"jumat\\?"\]'"/,
    'kolom settings.hari_libur tidak boleh berdefault ["jumat"] — tenant baru harus mulai tanpa hari libur mingguan sampai admin mengatur sendiri')
})

test('isHolidayDate tidak lagi fallback hardcode Jumat/Minggu ketika tenantId kosong', () => {
  const idx = serverSource.indexOf('function isHolidayDate(')
  assert.ok(idx > -1, 'isHolidayDate harus ada')
  const block = serverSource.slice(idx, idx + 500)
  assert.doesNotMatch(block, /\['jumat',\s*'minggu'\]\.includes/,
    'isHolidayDate tidak boleh mengandalkan hari hardcode; setiap tenant wajib mengikuti hari_libur miliknya sendiri')
})

test('JadwalPage tidak lagi memaksa fallback Jumat ketika settings tenant kosong/belum dimuat', () => {
  assert.doesNotMatch(jadwalPage, /hari_libur\s*\|\|\s*'\["jumat"\]'/,
    'JadwalPage tidak boleh menampilkan Jumat sebagai hari libur default sebelum settings tenant tersedia')
  assert.doesNotMatch(jadwalPage, /catch\s*\{\s*return\s*\['jumat'\]\s*\}/,
    'JadwalPage tidak boleh fallback ke Jumat saat parsing hari_libur gagal')
})

test('SettingsPage tidak lagi memaksa fallback Jumat pada state awal atau saat memuat settings', () => {
  assert.doesNotMatch(settingsPage, /hari_libur:\s*\['jumat'\]\s*as string\[\]/,
    'SettingsPage tidak boleh menginisialisasi form dengan Jumat sebagai hari libur sebelum data tenant dimuat')
  assert.doesNotMatch(settingsPage, /hari_libur\s*\|\|\s*'\["jumat"\]'/,
    'SettingsPage tidak boleh fallback ke Jumat ketika field hari_libur API kosong')
})
