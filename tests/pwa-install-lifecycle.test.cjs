const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
const prompt = read('src/components/PwaInstallPrompt.tsx')
const main = read('src/main.tsx')
const html = read('index.html')
const server = read('server/index.cjs')
const sw = read('public/sw.js')

test('PWA install prompt tidak menggantung setelah prompt ditutup atau gagal', () => {
  assert.match(prompt, /finally/)
  assert.match(prompt, /setInstalling\(false\)/)
  assert.match(prompt, /setDeferredPrompt\(null\)/)
  assert.match(prompt, /onVisibilityChange/)
  assert.match(prompt, /window\.setTimeout\(/)
})

test('registrasi PWA menunggu manifest, memperbarui worker, dan memakai scope tenant', () => {
  assert.match(html, /rel="manifest" href="\/api\/pwa\/manifest"/)
  assert.match(main, /navigator\.serviceWorker\.register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/)
  assert.match(main, /registration\.update\(\)/)
  assert.match(server, /start_url: '\/'/)
  assert.match(server, /scope: '\/'/)
})

test('service worker tidak mem-cache endpoint install/manifest/icon yang dinamis', () => {
  assert.match(sw, /pathname === '\/sw\.js'/)
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/)
})

test('PWA memberi jalur manual jika Chrome tidak menyelesaikan prompt native', () => {
  assert.match(prompt, /Coba menu browser.*Tambahkan ke layar utama/)
  assert.match(prompt, /install prompt timeout/)
})
