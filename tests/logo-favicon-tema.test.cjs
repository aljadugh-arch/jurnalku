// Logo + favicon default bertema: terang -> logo-light, gelap -> logo-dark.
// Favicon disinkronkan lewat setDarkClass (applyTheme sebelum render) + branch
// non-PWA di main.tsx (agar tidak tertimpa cache-busting favicon lama).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('logo navbar publik bertema', () => {
  const lp = baca('src/pages/LandingPage.tsx')
  const ps = baca('src/components/PublicShell.tsx')
  assert.match(lp, /dark \? '\/favicon-dark\.png' : '\/favicon-light\.png'/, 'landing logo bertema')
  assert.match(ps, /dark \? '\/favicon-dark\.png' : '\/favicon-light\.png'/, 'public shell logo bertema')
})

test('favicon disinkronkan dengan tema', () => {
  const ts = baca('src/stores/themeStore.ts')
  assert.match(ts, /fav\.setAttribute\('href', dark \? '\/favicon-dark\.png' : '\/favicon-light\.png'\)/, 'setDarkClass sinkron favicon')
  const main = baca('src/main.tsx')
  assert.match(main, /faviconTema = gelap \? 'favicon-dark' : 'favicon-light'/, 'main.tsx non-PWA pakai favicon bertema')
  const html = baca('index.html')
  assert.match(html, /sizes="64x64" href="\/favicon-light\.png"/, 'favicon default terang')
})

test('toggle tema tidak lagi menimpa teks brand (tombol masuk disembunyikan di mobile)', () => {
  const lp = baca('src/pages/LandingPage.tsx')
  assert.match(lp, /hidden lg:inline-flex">Masuk</, 'Masuk disembunyikan di mobile')
  assert.match(lp, /hidden lg:inline-flex">Coba Gratis</, 'Coba Gratis disembunyikan di mobile')
  assert.match(lp, /<span className="whitespace-nowrap">\{namaLembaga\}<\/span>/, 'teks brand nowrap')
})
