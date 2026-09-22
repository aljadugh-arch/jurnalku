const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const client = fs.readFileSync(path.join(root, 'src/lib/feedbackSound.ts'), 'utf8')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

test('cache miss TTS tidak boleh fallback ke voice browser female', () => {
  const catchStart = client.indexOf('} catch (err: any) {', client.indexOf('async function speakViaGeminiOrFallback'))
  const catchEnd = client.indexOf('\n  }\n}', catchStart)
  const catchBody = client.slice(catchStart, catchEnd)
  assert.match(catchBody, /generating\) return/,
    'cache miss generating harus langsung berhenti tanpa speakClear female')
  assert.ok(catchBody.indexOf('generating) return') < catchBody.indexOf('speakClear(text)'),
    'guard cache miss harus dieksekusi sebelum fallback device-dependent')
})

test('endpoint status menyediakan manifest frasa agar seluruh nama bisa diaudit dan dihangatkan', () => {
  const statusStart = server.indexOf("app.get('/api/tts/prewarm/status'")
  const statusEnd = server.indexOf('// ===== Google OAuth', statusStart)
  assert.ok(statusStart >= 0 && statusEnd > statusStart)
  const statusRoute = server.slice(statusStart, statusEnd)
  assert.match(statusRoute, /missing/)
  assert.match(statusRoute, /phrases/)
  assert.match(statusRoute, /ready/)
})
