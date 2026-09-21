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

test('menu Nilai STS dan SAS guru terdaftar di sidebar/menu lengkap (regresi sumber kebenaran)', () => {
  assert.match(menuItems, /nilai-sts/, 'menuItems.tsx harus mendaftarkan path nilai-sts untuk guru')
  assert.match(menuItems, /nilai-sas/, 'menuItems.tsx harus mendaftarkan path nilai-sas untuk guru')
})

test('bottom navigation mobile guru menampilkan menu Nilai STS dan SAS (bug: hilang di mobile/tablet)', () => {
  // roleItems() di BottomNavigation.tsx adalah daftar TERPISAH dari menuItems.tsx
  // (bukan derivasi/flatten dari sumber yang sama) — jadi menu baru wajib
  // ditambahkan manual di sini juga, atau akan hilang khusus di tampilan
  // mobile/tablet meski sudah ada di sidebar desktop.
  const teacherBlock = bottomNav.slice(
    bottomNav.indexOf("role === 'guru' || role === 'wali_kelas'"),
    bottomNav.indexOf("if (role === 'siswa'")
  )
  assert.match(teacherBlock, /\/guru\/nilai-sts/, 'path nilai-sts harus ada di daftar nav mobile guru')
  assert.match(teacherBlock, /\/guru\/nilai-sas/, 'path nilai-sas harus ada di daftar nav mobile guru')
})

test('gemini-tts.cjs menyediakan generateTtsAudio dengan cache berbasis hash dan konversi PCM ke WAV', () => {
  assert.match(geminiTts, /function generateTtsAudio/)
  assert.match(geminiTts, /function pcmToWav/, 'PCM mentah dari Gemini harus dibungkus jadi WAV agar bisa diputar <audio>')
  assert.match(geminiTts, /fs\.existsSync\(filePath\)/, 'harus cek cache disk sebelum panggil API lagi')
  assert.match(geminiTts, /voiceConfig.*prebuiltVoiceConfig/s, 'harus set voice pria via prebuiltVoiceConfig')
})

test('endpoint POST /api/tts/announce HANYA cek cache (instan), TIDAK PERNAH menunggu Gemini generate secara sinkron (root cause delay yang dilaporkan user)', () => {
  const route = serverIndex.slice(
    serverIndex.indexOf("app.post('/api/tts/announce'"),
    serverIndex.indexOf("// Pre-warm cache TTS")
  )
  assert.notEqual(route, '', 'endpoint /api/tts/announce belum ditemukan')
  assert.match(route, /authMiddleware/, 'endpoint harus terautentikasi (bukan publik)')
  assert.match(route, /resolveAiConfig\(db, req\.tenantId, req\.user\?\.id\)/, 'harus reuse konfigurasi AI existing per tenant/guru')
  assert.match(route, /checkTtsCache/, 'harus cek cache TANPA memanggil generateTtsAudio (yang menunggu Gemini 3-14 detik)')
  assert.doesNotMatch(route, /await generateTtsAudio\(/, 'endpoint TIDAK BOLEH await generateTtsAudio secara langsung — itulah bug delay yang dilaporkan user')
  assert.match(route, /generateTtsAudioBackground/, 'cache-miss harus memicu generate di BACKGROUND (fire-and-forget), bukan ditunggu')
  assert.match(route, /res\.status\(404\)\.json\(\{[^}]*generating: true/, 'cache-miss harus balas 404 SEKARANG dengan flag generating agar frontend beda dari "belum dikonfigurasi"')
})

test('gemini-tts.cjs menyediakan checkTtsCache (sinkron, tanpa network) dan generateTtsAudioBackground (fire-and-forget)', () => {
  assert.match(geminiTts, /function checkTtsCache/, 'harus ada fungsi cek cache tanpa panggil API')
  assert.match(geminiTts, /function generateTtsAudioBackground/, 'harus ada fungsi generate di background tanpa diawait caller')
  assert.match(geminiTts, /const inFlight = new Set/, 'harus cegah generate duplikat paralel untuk teks yang sama')
  assert.match(geminiTts, /3-14/, 'harus ada catatan bahwa Gemini TTS diukur nyata 3-14 detik, bukan instan')
})

test('endpoint prewarm & prewarm/status ada untuk generate cache semua nama sebelum jam absensi', () => {
  assert.match(serverIndex, /app\.post\('\/api\/tts\/prewarm'/, 'endpoint prewarm harus ada')
  assert.match(serverIndex, /app\.get\('\/api\/tts\/prewarm\/status'/, 'endpoint status prewarm harus ada')
  const prewarmRoute = serverIndex.slice(serverIndex.indexOf("app.post('/api/tts/prewarm'"), serverIndex.indexOf("app.get('/api/tts/prewarm/status'"))
  assert.match(prewarmRoute, /ADMIN/, 'prewarm harus dibatasi role admin (bukan sembarang user)')
  assert.match(prewarmRoute, /collectTtsAnnouncementNames/, 'harus gunakan helper yang ambil nama dari siswa dan GTK')
  
  // Verify the helper function queries both siswa and gtk
  const helperFn = serverIndex.slice(
    serverIndex.indexOf('function collectTtsAnnouncementNames'),
    serverIndex.indexOf('function qrSiswaPayload')
  )
  assert.match(helperFn, /FROM siswa WHERE tenant_id=\?/, 'helper harus ambil nama dari semua siswa aktif tenant ini')
  assert.match(helperFn, /FROM gtk WHERE tenant_id=\?/, 'helper harus ambil nama dari GTK/guru tenant ini juga (dipakai di ceklok)')
})

test('TtsPrewarmCard.tsx ada di UI Pengaturan untuk memicu prewarm manual', () => {
  const settingsPage = fs.readFileSync(path.join(root, 'src/pages/admin/SettingsPage.tsx'), 'utf8')
  assert.match(settingsPage, /import TtsPrewarmCard/, 'SettingsPage harus mengimpor kartu prewarm')
  assert.match(settingsPage, /<TtsPrewarmCard/, 'SettingsPage harus merender kartu prewarm untuk tenant (bukan superadmin)')
})

test('feedbackSound.ts mencoba TTS server Gemini dulu lalu fallback otomatis ke Web Speech API, tanpa pernah melempar', () => {
  assert.match(feedbackSound, /async function speakViaGeminiOrFallback/)
  assert.match(feedbackSound, /geminiTtsUnavailable/, 'harus ingat status unavailable agar tidak retry percuma tiap panggilan')
  assert.match(feedbackSound, /catch \(err: any\) \{[\s\S]*?speakClear\(text\)/, 'fallback ke speakClear wajib ada di catch block')
  assert.match(feedbackSound, /geminiAudioCache/, 'audio hasil TTS di-cache in-memory per teks agar tidak request ulang di sesi yang sama')
  // Regresi kunci: 404 cache-miss (generating:true) BUKAN berarti tenant
  // belum konfigurasi — jangan matikan percobaan Gemini permanen karena itu.
  assert.match(feedbackSound, /err\.response\?\.data\?\.generating/, 'harus bedakan 404 cache-miss (coba lagi nanti) dari 404 belum-dikonfigurasi (berhenti coba)')
})
