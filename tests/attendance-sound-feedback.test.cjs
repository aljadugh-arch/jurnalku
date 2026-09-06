const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const soundLib = read('src/lib/feedbackSound.ts')
const serverIndex = read('server/index.cjs')
const guruCeklok = read('src/pages/guru/GuruAbsensiPage.tsx')
const adminCeklok = read('src/pages/admin/CekLokAdminPage.tsx')
const qrPage = read('src/pages/admin/AbsensiSiswaPage.tsx')

test('helper suara memakai WebAudio bawaan tanpa aset biner agar tetap jalan offline', () => {
  assert.match(soundLib, /window\.AudioContext \|\| \(window as any\)\.webkitAudioContext/)
  assert.match(soundLib, /export function primeFeedbackSound\(\)/)
  assert.match(soundLib, /export function playFeedbackSound\(/)
  assert.match(soundLib, /export function announceAttendanceSuccess\(/)
  assert.match(soundLib, /export function announceStudentScanSuccess\(/)
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
  assert.match(masuk, /gain: 0\.28/, 'nada sukses harus lebih keras')
})

test('helper suara mengucapkan nama depan dengan TTS Indonesia langsung tanpa delay dan tanpa beep sukses', () => {
  assert.match(soundLib, /window\.speechSynthesis/)
  assert.match(soundLib, /SpeechSynthesisUtterance/)
  assert.match(soundLib, /utterance\.lang = 'id-ID'/)
  assert.match(soundLib, /utterance\.volume = 1/)
  assert.match(soundLib, /utterance\.rate = 0\.86/)
  assert.match(soundLib, /firstName\(name\)/)
  assert.match(soundLib, /speakClear\(`\$\{nickname\} \$\{session\}`\)/)
  const speakClearBlock = soundLib.slice(soundLib.indexOf('function speakClear'), soundLib.indexOf('export function announceAttendanceSuccess'))
  assert.doesNotMatch(speakClearBlock, /setTimeout/, 'TTS sukses tidak boleh delay')
  const successBlock = soundLib.slice(soundLib.indexOf('export function announceAttendanceSuccess'), soundLib.indexOf('export function announceStudentScanSuccess'))
  assert.doesNotMatch(successBlock, /playFeedbackSound/, 'sukses tidak boleh campur beep')
})

test('ceklok guru membunyikan ucapan nama sesuai sesi masuk atau pulang', () => {
  assert.match(guruCeklok, /import \{ announceAttendanceSuccess, playFeedbackSound, primeFeedbackSound \} from '\.\.\/\.\.\/lib\/feedbackSound'/)
  const handler = guruCeklok.slice(guruCeklok.indexOf('const handleCeklok'), guruCeklok.indexOf('return ('))
  assert.match(handler, /primeFeedbackSound\(\)/)
  assert.match(handler, /announceAttendanceSuccess\(res\.data\?\.gtk\?\.nama, type\)/)
  assert.match(handler, /playFeedbackSound\('error'\)/)
})

test('ceklok admin atau kepala juga mengucapkan nama pada sesi masuk dan pulang', () => {
  assert.match(adminCeklok, /import \{ announceAttendanceSuccess, playFeedbackSound, primeFeedbackSound \} from '\.\.\/\.\.\/lib\/feedbackSound'/)
  const handler = adminCeklok.slice(adminCeklok.indexOf('const handleCeklok'), adminCeklok.indexOf('const filtered'))
  assert.match(handler, /primeFeedbackSound\(\)/)
  assert.match(handler, /announceAttendanceSuccess\(res\.data\?\.gtk\?\.nama, type\)/)
  assert.match(handler, /playFeedbackSound\('error'\)/)
})

test('scan QR siswa mengucapkan nama panggilan unik sesuai sesi server, bukan nama depan umum', () => {
  assert.match(qrPage, /import \{ announceStudentScanSuccess, playFeedbackSound, primeFeedbackSound \} from '\.\.\/\.\.\/lib\/feedbackSound'/)
  const announce = qrPage.slice(qrPage.indexOf('const announceScanResult'), qrPage.indexOf('const startQrCamera'))
  assert.notEqual(announce, '', 'helper announceScanResult belum ada')
  assert.match(announce, /data\?\.siswa\?\.nama_panggilan_unik \|\| data\?\.siswa\?\.nama/)
  assert.match(announce, /data\?\.sesi === 'pulang' \? 'pulang' : 'masuk'/)
  assert.match(announce, /data\?\.already/)
  assert.match(announce, /announceStudentScanSuccess/)
})

test('kedua jalur scan QR (kamera dan token manual) memakai helper suara yang sama', () => {
  const camera = qrPage.slice(qrPage.indexOf('const startQrCamera'), qrPage.indexOf('const submitQrToken'))
  const manual = qrPage.slice(qrPage.indexOf('const submitQrToken'), qrPage.indexOf('const scanQrImage'))
  assert.match(camera, /announceScanResult\(r\.data\)/)
  assert.match(manual, /announceScanResult\(r\.data\)/)
  assert.match(camera, /playFeedbackSound\('error'\)/)
  assert.match(manual, /playFeedbackSound\('error'\)/)
})

test('backend QR siswa mengembalikan nama panggilan unik untuk TTS', () => {
  assert.match(serverIndex, /function uniqueStudentNickname\(db, siswa, tenantId\)/)
  assert.match(serverIndex, /for \(let i = parts\.length - 1; i >= 0; i--\)/, 'prioritas nama belakang seperti Nufail/Maulidi')
  assert.match(serverIndex, /tokenCounts\.get\(parts\[i\]\.toLowerCase\(\)\)/, 'hanya pilih token yang unik di tenant')
  assert.match(serverIndex, /nama_panggilan_unik: uniqueStudentNickname\(db, siswa, tenantId\)/)
  assert.match(serverIndex, /qrSiswaPayload\(db, siswa, req\.tenantId\)/)
})

test('backend ceklok guru mengembalikan nama GTK untuk ucapan suara', () => {
  const route = serverIndex.slice(serverIndex.indexOf("app.post('/api/guru/ceklok'"), serverIndex.indexOf('// ==================== JAMAAH'))
  assert.match(route, /gtk: \{ id: gtk\.id, nama: gtk\.nama \}/)
})

test('AudioContext dan speechSynthesis dibuka pada gestur pengguna agar autoplay policy tidak memblokir suara scan', () => {
  assert.match(soundLib, /primeSpeechSynthesis\(\)/)
  assert.match(soundLib, /SpeechSynthesisUtterance\(' '\)/)
  const camera = qrPage.slice(qrPage.indexOf('const startQrCamera'), qrPage.indexOf('const submitQrToken'))
  assert.match(camera, /primeFeedbackSound\(\)/)
  const manualEntry = qrPage.slice(qrPage.indexOf('const handleQrScan'), qrPage.indexOf('const handleSave'))
  assert.match(manualEntry, /primeFeedbackSound\(\)/)
})
