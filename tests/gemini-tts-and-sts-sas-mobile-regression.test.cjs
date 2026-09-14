const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const bottomNav = read('src/components/layout/BottomNavigation.tsx')
const menuItems = read('src/lib/menuItems.tsx')
const serverIndex = read('server/index.cjs')
const geminiTts = read('server/gemini-tts.cjs')
const feedbackSound = read('src/lib/feedbackSound.ts')

test('menu Nilai STS/SAS guru terdaftar di sidebar/menu lengkap (regresi sumber kebenaran)', () => {
  assert.match(menuItems, /nilai-sumatif/, 'menuItems.tsx harus mendaftarkan path nilai sumatif untuk guru')
})

test('bottom navigation mobile guru menampilkan menu Nilai STS/SAS (bug: hilang di mobile/tablet)', () => {
  // roleItems() di BottomNavigation.tsx adalah daftar TERPISAH dari menuItems.tsx
  // (bukan derivasi/flatten dari sumber yang sama) — jadi menu baru wajib
  // ditambahkan manual di sini juga, atau akan hilang khusus di tampilan
  // mobile/tablet meski sudah ada di sidebar desktop.
  const teacherBlock = bottomNav.slice(
    bottomNav.indexOf("role === 'guru' || role === 'wali_kelas'"),
    bottomNav.indexOf("if (role === 'siswa'")
  )
  assert.match(teacherBlock, /\/guru\/nilai-sumatif/, 'path nilai sumatif harus ada di daftar nav mobile guru')
  assert.match(teacherBlock, /STS\/SAS/, 'label STS/SAS harus ada di nav mobile guru')
})

test('gemini-tts.cjs menyediakan generateTtsAudio dengan cache berbasis hash dan konversi PCM ke WAV', () => {
  assert.match(geminiTts, /function generateTtsAudio/)
  assert.match(geminiTts, /function pcmToWav/, 'PCM mentah dari Gemini harus dibungkus jadi WAV agar bisa diputar <audio>')
  assert.match(geminiTts, /fs\.existsSync\(filePath\)/, 'harus cek cache disk sebelum panggil API lagi')
  assert.match(geminiTts, /voiceConfig.*prebuiltVoiceConfig/s, 'harus set voice pria via prebuiltVoiceConfig')
})

test('endpoint POST /api/tts/announce ada, butuh auth, dan 404 bila Gemini belum dikonfigurasi (bukan gagal keras)', () => {
  const route = serverIndex.slice(
    serverIndex.indexOf("app.post('/api/tts/announce'"),
    serverIndex.indexOf("// ===== Google OAuth")
  )
  assert.notEqual(route, '', 'endpoint /api/tts/announce belum ditemukan')
  assert.match(route, /authMiddleware/, 'endpoint harus terautentikasi (bukan publik)')
  assert.match(route, /resolveAiConfig\(db, req\.tenantId, req\.user\?\.id\)/, 'harus reuse konfigurasi AI existing per tenant/guru')
  assert.match(route, /res\.status\(404\)/, 'harus 404 (bukan 500) bila API key belum dikonfigurasi, supaya frontend fallback mulus')
  assert.match(route, /cfg\.provider !== 'gemini'/, 'hanya aktif bila provider yang dikonfigurasi adalah gemini')
})

test('feedbackSound.ts mencoba TTS server Gemini dulu lalu fallback otomatis ke Web Speech API, tanpa pernah melempar', () => {
  assert.match(feedbackSound, /async function speakViaGeminiOrFallback/)
  assert.match(feedbackSound, /geminiTtsUnavailable/, 'harus ingat status unavailable agar tidak retry percuma tiap panggilan')
  assert.match(feedbackSound, /catch \(err: any\) \{[\s\S]*?speakClear\(text\)/, 'fallback ke speakClear wajib ada di catch block')
  assert.match(feedbackSound, /geminiAudioCache/, 'audio hasil TTS di-cache in-memory per teks agar tidak request ulang di sesi yang sama')
})
