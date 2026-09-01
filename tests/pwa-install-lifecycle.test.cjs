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
const manifest = JSON.parse(read('public/manifest.webmanifest'))

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
  assert.match(server, /start_url: req\.isRegisteredTenantHost \? '\/login' : '\/'/)
  assert.match(server, /scope: '\/'/)
})

test('ikon PWA dan favicon memakai format serta ukuran deklarasi yang benar', () => {
  assert.match(html, /rel="icon" type="image\/png" sizes="64x64" href="\/favicon\.ico"/)
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/)
  assert.match(html, /rel="apple-touch-icon" sizes="192x192" href="\/apple-touch-icon\.png"/)
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['256x256', '192x192'])
  assert.ok(manifest.icons.every(icon => icon.type === 'image/png' && icon.purpose === 'any maskable'))
  assert.match(server, /Cache-Control': 'no-cache, must-revalidate'/)
})

test('service worker tidak mem-cache endpoint install/manifest/icon yang dinamis', () => {
  assert.match(sw, /pathname === '\/sw\.js'/)
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/)
})

test('PWA memberi jalur manual jika Chrome tidak menyelesaikan prompt native', () => {
  assert.match(prompt, /Coba menu browser.*Tambahkan ke layar utama/)
  assert.match(prompt, /install prompt timeout/)
})

test('landing page menjaga keterbacaan label jenjang pada section social proof', () => {
  const landing = read('src/pages/LandingPage.tsx')
  assert.match(landing, /text-3xl font-bold text-gray-600/)
})

test('layout dashboard memberi ruang untuk bottom navigation di mobile dan mencegah overflow horizontal', () => {
  const layout = read('src/components/layout/DashboardLayout.tsx')
  const css = read('src/index.css')
  assert.match(layout, /overflow-x-hidden p-4 pb-24/)
  assert.match(css, /overflow-x: hidden/)
})
