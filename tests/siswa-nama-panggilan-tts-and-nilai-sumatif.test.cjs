const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const serverIndex = read('server/index.cjs')
const dataSiswaPage = read('src/pages/admin/DataSiswaPage.tsx')
const typesIndex = read('src/types/index.ts')
const soundLib = read('src/lib/feedbackSound.ts')
const adminQrPage = read('src/pages/admin/AbsensiSiswaPage.tsx')
const guruQrPage = read('src/pages/guru/GuruAbsensiSiswaQRPage.tsx')

test('migrasi menambah kolom nama_panggilan opsional pada tabel siswa secara aditif', () => {
  assert.match(serverIndex, /ALTER TABLE siswa ADD COLUMN nama_panggilan TEXT/)
  assert.match(serverIndex, /siswaCols\.some\(col => col\.name === 'nama_panggilan'\)/)
})

test('backend menerima dan menyimpan nama_panggilan pada create dan update siswa', () => {
  const createRoute = serverIndex.slice(serverIndex.indexOf("app.post('/api/siswa'"), serverIndex.indexOf("app.put('/api/siswa/:id'"))
  assert.match(createRoute, /nama_panggilan/)
  assert.match(createRoute, /INSERT INTO siswa \(/)
  assert.match(createRoute, /nik, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, nama_panggilan, rombel_id, tenant_id/)

  const updateRoute = serverIndex.slice(serverIndex.indexOf("app.put('/api/siswa/:id'"), serverIndex.indexOf("app.post('/api/siswa/generate-akun'"))
  assert.match(updateRoute, /'nama_ortu', 'nama_panggilan', 'rombel_id', 'status'/)
})

test('backend QR siswa menyertakan nama_panggilan manual (jika ada) terpisah dari nama_panggilan_unik otomatis', () => {
  const fn = serverIndex.slice(serverIndex.indexOf('function qrSiswaPayload'), serverIndex.indexOf("app.post('/api/absensi-siswa/qr-scan'"))
  assert.match(fn, /nama_panggilan: siswa\.nama_panggilan \|\| null/)
  assert.match(fn, /nama_panggilan_unik: uniqueStudentNickname\(db, siswa, tenantId\)/)
})

test('TTS scan QR (admin & guru) memprioritaskan nama_panggilan manual sebelum nama_panggilan_unik otomatis', () => {
  for (const src of [adminQrPage, guruQrPage]) {
    const announce = src.slice(src.indexOf('const announceScanResult'), src.indexOf('const startQrCamera'))
    assert.match(announce, /data\?\.siswa\?\.nama_panggilan \|\| data\?\.siswa\?\.nama_panggilan_unik \|\| data\?\.siswa\?\.nama/)
  }
})

test('form Data Siswa punya field nama_panggilan opsional (create, edit, export, import)', () => {
  assert.match(dataSiswaPage, /nama_panggilan\?: string/)
  assert.match(dataSiswaPage, /nama_panggilan: ''/, 'emptyForm harus menyertakan nama_panggilan')
  assert.match(dataSiswaPage, /nama_panggilan: siswa\.nama_panggilan \|\| ''/, 'handleEdit harus mengisi ulang nama_panggilan')
  assert.match(dataSiswaPage, /Nama Panggilan.*opsional, untuk suara TTS absensi/, 'input form harus berlabel opsional')
  assert.match(dataSiswaPage, /NIK,NIS,NISN,Nama,Nama Panggilan,JK/, 'export CSV harus menyertakan kolom nama panggilan')
  assert.match(dataSiswaPage, /'Nama Panggilan': 'nama_panggilan'/, 'import Excel harus memetakan kolom nama panggilan')
})

test('tipe Siswa global menyertakan nama_panggilan opsional', () => {
  assert.match(typesIndex, /nama_panggilan\?: string/)
})

test('pickBestVoice tidak lagi menganggap Google US English sebagai voice pria (bug lama)', () => {
  const fn = soundLib.slice(soundLib.indexOf('function pickBestVoice'), soundLib.indexOf('function primeSpeechSynthesis'))
  assert.doesNotMatch(fn, /const googleUs/i, 'variable fallback salah lama (googleUs sebagai male) harus dihapus')
})

test('pickBestVoice memprioritaskan voice natural/neural untuk suara yang lebih manusiawi', () => {
  const fn = soundLib.slice(soundLib.indexOf('function pickBestVoice'), soundLib.indexOf('function primeSpeechSynthesis'))
  assert.match(fn, /isNatural/)
  assert.match(fn, /natural\|online\|neural/i)
  assert.match(fn, /maleIdNatural/)
})

test('pickBestVoice tetap male-first dengan daftar voice pria yang terverifikasi', () => {
  const fn = soundLib.slice(soundLib.indexOf('function pickBestVoice'), soundLib.indexOf('function primeSpeechSynthesis'))
  assert.match(fn, /isVerifiedMale/)
  assert.match(fn, /microsoft david/i)
})
