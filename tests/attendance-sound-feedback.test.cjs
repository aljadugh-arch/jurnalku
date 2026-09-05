const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const soundLib = read('src/lib/feedbackSound.ts')
const guruCeklok = read('src/pages/guru/GuruAbsensiPage.tsx')
const adminCeklok = read('src/pages/admin/CekLokAdminPage.tsx')
const qrPage = read('src/pages/admin/AbsensiSiswaPage.tsx')

test('helper suara memakai WebAudio bawaan tanpa aset biner agar tetap jalan offline', () => {
  assert.match(soundLib, /window\.AudioContext \|\| \(window as any\)\.webkitAudioContext/)
  assert.match(soundLib, /export function primeFeedbackSound\(\)/)
  assert.match(soundLib, /export function playFeedbackSound\(/)
  // Tidak boleh bergantung pada file audio eksternal.
  assert.doesNotMatch(soundLib, /\.mp3|\.wav|\.ogg|new Audio\(/)
})

test('helper suara aman di lingkungan tanpa AudioContext dan tidak melempar error', () => {
  assert.match(soundLib, /if \(typeof window === 'undefined'\) return null/)
  assert.match(soundLib, /if \(!Ctor\) return null/)
  assert.match(soundLib, /catch \{ *(?:\/\/[^\n]*)?\s*return null/)
})

test('nada masuk dan pulang berbeda, plus nada khusus duplikat dan gagal', () => {
  for (const tone of ['masuk', 'pulang', 'duplicate', 'error']) {
    assert.match(soundLib, new RegExp(`${tone}:\\s*\\{`), `nada ${tone} belum didefinisikan`)
  }
  const masuk = soundLib.match(/masuk:\s*\{[^}]*\}/)[0]
  const pulang = soundLib.match(/pulang:\s*\{[^}]*\}/)[0]
  assert.notEqual(masuk, pulang, 'nada masuk dan pulang tidak boleh identik')
})

test('ceklok guru membunyikan nada sesuai sesi masuk atau pulang', () => {
  assert.match(guruCeklok, /import \{ playFeedbackSound, primeFeedbackSound \} from '\.\.\/\.\.\/lib\/feedbackSound'/)
  const handler = guruCeklok.slice(guruCeklok.indexOf('const handleCeklok'), guruCeklok.indexOf('return ('))
  assert.match(handler, /primeFeedbackSound\(\)/)
  assert.match(handler, /playFeedbackSound\(type === 'masuk' \? 'masuk' : 'pulang'\)/)
  assert.match(handler, /playFeedbackSound\('error'\)/)
})

test('ceklok admin atau kepala juga berbunyi pada sesi masuk dan pulang', () => {
  assert.match(adminCeklok, /import \{ playFeedbackSound, primeFeedbackSound \} from '\.\.\/\.\.\/lib\/feedbackSound'/)
  const handler = adminCeklok.slice(adminCeklok.indexOf('const handleCeklok'), adminCeklok.indexOf('const filtered'))
  assert.match(handler, /primeFeedbackSound\(\)/)
  assert.match(handler, /playFeedbackSound\(type === 'masuk' \? 'masuk' : 'pulang'\)/)
  assert.match(handler, /playFeedbackSound\('error'\)/)
})

test('scan QR siswa berbunyi sesuai sesi yang dikembalikan server, bukan sesi pilihan UI', () => {
  assert.match(qrPage, /import \{ playFeedbackSound, primeFeedbackSound \} from '\.\.\/\.\.\/lib\/feedbackSound'/)
  const announce = qrPage.slice(qrPage.indexOf('const announceScanResult'), qrPage.indexOf('const startQrCamera'))
  assert.notEqual(announce, '', 'helper announceScanResult belum ada')
  assert.match(announce, /data\?\.sesi === 'pulang' \? 'pulang' : 'masuk'/)
  assert.match(announce, /data\?\.already/)
  assert.match(announce, /playFeedbackSound\('duplicate'\)/)
})

test('kedua jalur scan QR (kamera dan token manual) memakai helper suara yang sama', () => {
  const camera = qrPage.slice(qrPage.indexOf('const startQrCamera'), qrPage.indexOf('const submitQrToken'))
  const manual = qrPage.slice(qrPage.indexOf('const submitQrToken'), qrPage.indexOf('const scanQrImage'))
  assert.match(camera, /announceScanResult\(r\.data\)/)
  assert.match(manual, /announceScanResult\(r\.data\)/)
  assert.match(camera, /playFeedbackSound\('error'\)/)
  assert.match(manual, /playFeedbackSound\('error'\)/)
})

test('AudioContext dibuka pada gestur pengguna agar autoplay policy tidak memblokir suara scan', () => {
  const camera = qrPage.slice(qrPage.indexOf('const startQrCamera'), qrPage.indexOf('const submitQrToken'))
  assert.match(camera, /primeFeedbackSound\(\)/)
  const manualEntry = qrPage.slice(qrPage.indexOf('const handleQrScan'), qrPage.indexOf('const handleSave'))
  assert.match(manualEntry, /primeFeedbackSound\(\)/)
})
