const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const serverIndex = read('server/index.cjs')
const geminiTts = read('server/gemini-tts.cjs')
const feedbackSound = read('src/lib/feedbackSound.ts')

test('prewarm TTS membatasi worker paralel agar lebih cepat tanpa burst berlebihan', () => {
  assert.match(geminiTts, /async function runTtsQueue/)
  assert.match(geminiTts, /concurrency\s*=\s*3/)
  const route = serverIndex.slice(
    serverIndex.indexOf("app.post('/api/tts/prewarm'"),
    serverIndex.indexOf("app.get('/api/tts/prewarm/status'")
  )
  assert.match(route, /runTtsQueue/)
  assert.doesNotMatch(route, /for \(const text of todo\)[\s\S]*await generateTtsAudio/, 'prewarm tidak boleh lagi serial satu-per-satu')
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
