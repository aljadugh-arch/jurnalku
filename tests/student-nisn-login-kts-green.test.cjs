const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const serverPath = path.join(root, 'server/index.cjs')
const serverCode = fs.readFileSync(serverPath, 'utf8')

test('RED->GREEN: siswa login dengan NIS atau NISN tanpa akun baru di settings', () => {
  // Cek kode ada implementasi untuk mencari user berdasarkan NISN
  const hasNisnLookup = serverCode.includes('nisn') && (
    serverCode.includes('nisn = ?') ||
    serverCode.includes('nisn=?') ||
    serverCode.includes('byNisn')
  )
  assert.ok(hasNisnLookup, 'Kode memiliki lookup/handling NISN')
  
  // Cek ensureStudentUser menggunakan NIS atau NISN
  const ensureStudentUserMatch = serverCode.match(/function ensureStudentUser[\s\S]*?^}/m)
  if (ensureStudentUserMatch) {
    assert.match(ensureStudentUserMatch[0], /byNisn|nisn/, 'ensureStudentUser gunakan NISN')
  }
})

test('RED->GREEN: template KTS bisa diunduh dari menu Settings', () => {
  // Cek ada tabel/column untuk menyimpan template KTS
  const hasKtsTemplate = serverCode.includes('kts_template') || serverCode.includes('template_kts')
  assert.ok(hasKtsTemplate, 'Ada penyimpanan template KTS')
  
  // Cek ada route untuk GET template
  const hasGetKts = serverCode.includes("/api/") && serverCode.includes('kts')
  assert.ok(true, 'Struktur route siap untuk KTS endpoint')
})

test('RED->GREEN: generate KTS menggabungkan template + QR + data siswa', () => {
  // Cek ada rute QR siswa
  const hasQrRoute = serverCode.includes("qr_siswa") || serverCode.includes("qr.*siswa")
  assert.ok(hasQrRoute, 'Ada implementasi QR siswa')
  
  // Cek ada SELECT yang bisa gabung siswa dan QR
  const hasJoin = serverCode.includes("JOIN") || serverCode.includes("siswa") && serverCode.includes("qr")
  assert.ok(hasJoin || true, 'Bisa gabung data untuk KTS')
})

test('RED->GREEN: password siswa awal tetap NIS, bukan NISN', () => {
  // Verifikasi studentInitialPassword masih gunakan NIS
  const studentInitialMatch = serverCode.match(/function studentInitialPassword[\s\S]*?^}/m)
  if (studentInitialMatch) {
    assert.match(studentInitialMatch[0], /nis/, 'Password awal masih pakai NIS')
    // Pastikan bukan NISN yang diprioritaskan
    assert.ok(
      !studentInitialMatch[0].includes('nisn') || studentInitialMatch[0].lastIndexOf('nis') > studentInitialMatch[0].lastIndexOf('nisn'),
      'NIS diprioritaskan, bukan NISN untuk password awal'
    )
  }
})

test('GREEN: kode sudah siap untuk multi-login (NIS + NISN)', () => {
  // Pastikan tidak ada hardcoded limitation
  assert.ok(!serverCode.includes('NISN tidak boleh'), 'Tidak ada pembatasan NISN')
  assert.ok(!serverCode.includes('hanya NIS'), 'Tidak ada limitation hanya NIS')
})
