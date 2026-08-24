const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('WA worker negotiates the latest supported WhatsApp Web version', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server/wa-worker.mjs'), 'utf8')
  assert.match(source, /fetchLatestBaileysVersion/)
  assert.match(source, /makeWASocket\(\{[^}]*version/s)
})
