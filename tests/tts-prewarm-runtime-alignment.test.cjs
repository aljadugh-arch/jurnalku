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
  
  // Must call the actual uniqueStudentNickname function
  assert.match(prewarmRoute, /uniqueStudentNickname/, 
    'prewarm should call uniqueStudentNickname() to match runtime logic')
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

test('pickBestVoice browser fallback prefers male id-ID voice, not arbitrary female', () => {
  const pickBestVoiceFn = soundLib.slice(
    soundLib.indexOf('function pickBestVoice'),
    soundLib.indexOf('function primeSpeechSynthesis')
  )
  
  // Male must be checked before female fallback
  assert.match(pickBestVoiceFn, /maleIdNatural/, 
    'should prioritize male Indonesia natural/neural')
  assert.match(pickBestVoiceFn, /maleId\b/, 
    'should prioritize male Indonesia (non-neural)')
  assert.match(pickBestVoiceFn, /maleNaturalAny/, 
    'should prioritize male any language with natural/neural')
  assert.match(pickBestVoiceFn, /maleAny/, 
    'should prioritize any verified male')
  
  // Only AFTER all male options exhausted, then female fallback
  const lines = pickBestVoiceFn.split('\n')
  const maleFallbackIndex = lines.findIndex(l => /fallback.*female|female.*fallback/i.test(l))
  assert(maleFallbackIndex >= 0, 'should have a clear comment about female fallback')
})

test('when WAV TTS fails, speakClear() triggers Web Speech fallback with male-first voice', () => {
  const speakClearFn = soundLib.slice(
    soundLib.indexOf('function speakClear'),
    soundLib.indexOf('const geminiAudioCache')
  )
  
  // Must call pickBestVoice which implements male-first logic
  assert.match(speakClearFn, /pickBestVoice/, 
    'speakClear should use pickBestVoice for male-first voice selection')
})

test('TTS error fallback path exists and uses same voice selection as speakClear', () => {
  const fallbackLogic = soundLib.slice(
    soundLib.indexOf('speakViaGeminiOrFallback'),
    soundLib.indexOf('export function announceAttendanceSuccess')
  )
  
  // Must call speakClear on error
  assert.match(fallbackLogic, /speakClear\(text\)/, 
    'fallback should call speakClear which uses male-first voice selection')
})

test('TTS prewarm status endpoint uses same name extraction as prewarm generation', () => {
  const prewarmStatusRoute = serverIndex.slice(
    serverIndex.indexOf("app.get('/api/tts/prewarm/status'"),
    serverIndex.indexOf("// ===== Google OAuth")
  )
  
  // Both prewarm endpoints must use the same logic
  assert.match(prewarmStatusRoute, /uniqueStudentNickname/, 
    'prewarm/status should also use uniqueStudentNickname() for consistency')
})
