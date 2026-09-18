const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const serverIndex = read('server/index.cjs')
const geminiTts = read('server/gemini-tts.cjs')
const feedbackSound = read('src/lib/feedbackSound.ts')

test('prewarm TTS memakai antrean rate-limited agar tidak burst ke Gemini', () => {
  assert.match(geminiTts, /async function runTtsQueue/)
  assert.match(geminiTts, /concurrency\s*=\s*1/)
  const route = serverIndex.slice(
    serverIndex.indexOf("app.post('/api/tts/prewarm'"),
    serverIndex.indexOf("app.get('/api/tts/prewarm/status'")
  )
  assert.match(route, /runTtsQueue/)
  assert.doesNotMatch(route, /for \(const text of todo\)[\s\S]*await generateTtsAudio/, 'prewarm harus memakai antrean terkelola')
})

test('TTS memberi status job nyata termasuk gagal dan tidak membuat UI loading selamanya', () => {
  assert.match(geminiTts, /function getTtsJobStatus/)
  assert.match(geminiTts, /failed/)
  const statusRoute = serverIndex.slice(
    serverIndex.indexOf("app.get('/api/tts/prewarm/status'"),
    serverIndex.indexOf('// ===== Google OAuth')
  )
  assert.match(statusRoute, /getTtsJobStatus/)
  assert.match(feedbackSound, /timeout:\s*800/, 'jalur scan harus fallback maksimal sekitar 800 ms')
})

test('cache TTS kosong atau korup tidak dianggap siap', () => {
  assert.match(geminiTts, /fs\.statSync\(filePath\)\.size\s*>\s*44/)
})

test('prewarm menghormati rate limit Gemini dan retry, bukan menghabiskan semua item sekaligus', () => {
  assert.match(geminiTts, /class TtsRateLimitError/)
  assert.match(geminiTts, /retryAfterMs/)
  assert.match(geminiTts, /async function runTtsQueue/)
  assert.match(geminiTts, /maxRetries\s*=\s*3/)
  assert.match(geminiTts, /rateLimitDelayMs\s*=\s*7000/)
  assert.match(geminiTts, /await delay\(retryAfterMs \|\| rateLimitDelayMs\)/)
  assert.match(geminiTts, /onRetry\?\./)
})

test('progress job menghitung kegagalan permanen sebagai processed agar UI tidak macet', () => {
  const route = serverIndex.slice(
    serverIndex.indexOf("app.post('/api/tts/prewarm'"),
    serverIndex.indexOf("app.get('/api/tts/prewarm/status'")
  )
  assert.match(route, /job\.processed\s*=\s*job\.done \+ job\.failed/)
  assert.match(route, /retrying/)
  assert.match(feedbackSound, /timeout:\s*800/)
})

test('progress menunjukkan fase menunggu rate limit, bukan 0 persen tanpa penjelasan', () => {
  const card = read('src/components/TtsPrewarmCard.tsx')
  assert.match(card, /phase/)
  assert.match(card, /retryAt/)
  assert.match(card, /Menunggu batas Google/)
  assert.match(card, /Math\.max\(1,/)
})

test('429 menandai job sebagai menunggu sebelum retry', () => {
  const route = serverIndex.slice(
    serverIndex.indexOf("app.post('/api/tts/prewarm'"),
    serverIndex.indexOf("app.get('/api/tts/prewarm/status'")
  )
  assert.match(route, /job\.phase\s*=\s*'waiting-rate-limit'/)
  assert.match(route, /job\.retryAt/)
})
