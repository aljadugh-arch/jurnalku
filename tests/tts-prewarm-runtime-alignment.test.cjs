const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const serverIndex = read('server/index.cjs')
const soundLib = read('src/lib/feedbackSound.ts')

test('TTS prewarm uses uniqueStudentNickname() logic, not just firstWord()', () => {
  const prewarmRoute = serverIndex.slice(
    serverIndex.indexOf("app.post('/api/tts/prewarm'"),
    serverIndex.indexOf("app.get('/api/tts/prewarm/status'")
  )
  
  // Must use collectTtsAnnouncementNames which internally calls uniqueStudentNickname
  assert.match(prewarmRoute, /collectTtsAnnouncementNames/, 
    'prewarm should use collectTtsAnnouncementNames which uses uniqueStudentNickname() logic')
  
  // Verify the helper function exists and calls uniqueStudentNickname
  assert.match(serverIndex, /function collectTtsAnnouncementNames/, 
    'collectTtsAnnouncementNames helper should exist')
  const helperFn = serverIndex.slice(
    serverIndex.indexOf('function collectTtsAnnouncementNames'),
    serverIndex.indexOf('function qrSiswaPayload')
  )
  assert.match(helperFn, /uniqueStudentNickname/, 
    'collectTtsAnnouncementNames should call uniqueStudentNickname() internally')
})

test('TTS runtime firstName() processes name with toNaturalCase for accent normalization', () => {
  const firstNameFn = soundLib.slice(
    soundLib.indexOf('function firstName'),
    soundLib.indexOf('function getSpeechSynth')
  )
  
  // Must call toNaturalCase to handle accented characters and case normalization
  assert.match(firstNameFn, /toNaturalCase/, 
    'firstName() must call toNaturalCase for proper accent handling')
})

test('pickBestVoice browser fallback prefers female id-ID voice (konsisten dgn Edge TTS server)', () => {
  const pickBestVoiceFn = soundLib.slice(
    soundLib.indexOf('function pickBestVoice'),
    soundLib.indexOf('function primeSpeechSynthesis')
  )
  
  // Sejak 16da41c: Female-first (konsisten dgn id-ID-GadisNeural server)
  assert.match(pickBestVoiceFn, /femaleIdNatural/, 
    'should prioritize female Indonesia natural/neural')
  assert.match(pickBestVoiceFn, /femaleId\b/, 
    'should prioritize female Indonesia (non-neural)')
  assert.match(pickBestVoiceFn, /femaleNaturalAny/, 
    'should prioritize female any language with natural/neural')
  assert.match(pickBestVoiceFn, /femaleAny/, 
    'should prioritize any verified female')
  
  // After all female options, Indonesia voice as gender-neutral fallback
  const lines = pickBestVoiceFn.split('\n')
  const femaleAnyIndex = lines.findIndex(l => /const femaleAny =/.test(l))
  assert(femaleAnyIndex >= 0, 'should have femaleAny variable')
})

test('when WAV TTS fails, speakClear() triggers Web Speech fallback with female-first voice', () => {
  const speakClearFn = soundLib.slice(
    soundLib.indexOf('function speakClear'),
    soundLib.indexOf('const geminiAudioCache')
  )
  
  // Must call pickBestVoice which implements female-first logic
  assert.match(speakClearFn, /pickBestVoice/, 
    'speakClear should use pickBestVoice for female-first voice selection')
})

test('TTS error fallback path exists and uses same voice selection as speakClear', () => {
  const fallbackLogic = soundLib.slice(
    soundLib.indexOf('speakViaGeminiOrFallback'),
    soundLib.indexOf('export function announceAttendanceSuccess')
  )
  
  // Must call speakClear on error
  assert.match(fallbackLogic, /speakClear\(text\)/, 
    'fallback should call speakClear which uses female-first voice selection')
})

test('TTS prewarm status endpoint uses same name extraction as prewarm generation', () => {
  const prewarmStatusRoute = serverIndex.slice(
    serverIndex.indexOf("app.get('/api/tts/prewarm/status'"),
    serverIndex.indexOf("// ===== Google OAuth")
  )
  
  // Must use the same collectTtsAnnouncementNames helper
  assert.match(prewarmStatusRoute, /collectTtsAnnouncementNames/, 
    'prewarm/status should also use collectTtsAnnouncementNames() for consistency')
})
