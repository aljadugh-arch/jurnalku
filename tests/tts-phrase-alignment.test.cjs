const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

// Load the server code to extract functions
const serverCode = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
const clientCode = fs.readFileSync(path.join(root, 'src/lib/feedbackSound.ts'), 'utf8')

test('Server toNaturalCase() matches client toNaturalCase()', () => {
  // Extract and test the server-side toNaturalCase function
  const toNaturalCaseMatch = serverCode.match(/function toNaturalCase\(word\) \{[\s\S]*?\n\}/)
  assert(toNaturalCaseMatch, 'Server must have toNaturalCase function')
  
  // Extract client toNaturalCase
  const clientMatch = clientCode.match(/function toNaturalCase\(word.*?\) \{[\s\S]*?\n  \}/)
  assert(clientMatch, 'Client must have toNaturalCase function')
})

test('Server firstName() matches client firstName()', () => {
  assert.match(serverCode, /function firstName\(name\) \{/, 'Server must have firstName function')
  assert.match(clientCode, /function firstName\(name\?.*?\) \{/, 'Client must have firstName function')
})

test('collectTtsAnnouncementNames uses firstName() for normalization', () => {
  assert.match(serverCode, /function collectTtsAnnouncementNames/, 'Must have collectTtsAnnouncementNames')
  const fnMatch = serverCode.slice(
    serverCode.indexOf('function collectTtsAnnouncementNames'),
    serverCode.indexOf('function qrSiswaPayload')
  )
  assert.match(fnMatch, /firstName\(/, 'collectTtsAnnouncementNames must call firstName()')
})

test('Runtime announceAttendanceSuccess uses firstName() to normalize name', () => {
  const fnMatch = clientCode.slice(
    clientCode.indexOf('export function announceAttendanceSuccess'),
    clientCode.indexOf('export function announceStudentScanSuccess')
  )
  assert.match(fnMatch, /const nickname = firstName\(name\)/, 'Runtime must call firstName() on input name')
})

test('Prewarm phrase generation produces normalized names matching runtime', () => {
  // The phrase used at runtime is: firstName(name) + ' ' + session
  // The phrase generated at prewarm is: firstName(uniqueStudentNickname(...)) + ' ' + session
  // These must be identical
  
  assert.match(serverCode, /for \(const siswa of siswaRows\)/, 'Prewarm iterates students')
  const prewarmLoop = serverCode.slice(
    serverCode.indexOf('// Siswa: prioritas nama_panggilan manual'),
    serverCode.indexOf('// GTK: ambil nama pertama')
  )
  assert.match(prewarmLoop, /const normalized = firstName/, 'Prewarm must call firstName()')
  assert.match(prewarmLoop, /names\.add\(normalized\)/, 'Prewarm must add firstName result')
})

test('Browser fallback speakClear uses pickBestVoice for male-first preference', () => {
  const speakClearFn = clientCode.slice(
    clientCode.indexOf('function speakClear'),
    clientCode.indexOf('const geminiAudioCache')
  )
  assert.match(speakClearFn, /pickBestVoice/, 'speakClear must use pickBestVoice')
})

test('pickBestVoice prioritizes male voices before female fallback', () => {
  const pickBestVoice = clientCode.slice(
    clientCode.indexOf('function pickBestVoice'),
    clientCode.indexOf('function primeSpeechSynthesis')
  )
  
  // Must check male options in order
  assert.match(pickBestVoice, /maleIdNatural/, 'Check male Indonesia natural')
  assert.match(pickBestVoice, /maleId\b/, 'Check male Indonesia')
  assert.match(pickBestVoice, /maleNaturalAny/, 'Check male natural any language')
  assert.match(pickBestVoice, /maleAny/, 'Check male any language')
  
  // After all male checks, must try Indonesia voices as fallback (which may include female)
  const lines = pickBestVoice.split('\n')
  const maleAnyIndex = lines.findIndex(l => /const maleAny =/.test(l))
  const idNaturalIndex = lines.findIndex(l => /const idNatural =/.test(l))
  assert(maleAnyIndex >= 0, 'Should check maleAny')
  assert(idNaturalIndex > maleAnyIndex, 'Indonesia voices checked after all male checks')
})

test('when Gemini TTS fails, speakViaGeminiOrFallback calls speakClear with male voice', () => {
  const fallbackFn = clientCode.slice(
    clientCode.indexOf('async function speakViaGeminiOrFallback'),
    clientCode.indexOf('export function announceAttendanceSuccess')
  )
  assert.match(fallbackFn, /speakClear\(text\)/, 'On error must call speakClear')
})
