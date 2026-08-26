const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const read = path => fs.readFileSync(path, 'utf8')

test('PortalSheet owns accessible portal behavior', () => {
  const source = read('src/components/ui/PortalSheet.tsx')
  for (const contract of ['createPortal', "document.body.style.overflow = 'hidden'", "event.key === 'Escape'", "event.key !== 'Tab'", 'previousFocus.current?.focus()', 'z-[100]', 'safe-area-inset-bottom', 'scrollTo(0, 0)', 'aria-modal="true"']) assert.match(source, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('mobile sheets share PortalSheet and palette has seven solid colors', () => {
  for (const file of ['src/components/MobileMenuGrid.tsx', 'src/components/IconMenuGrid.tsx']) assert.match(read(file), /PortalSheet/)
  const grid = read('src/components/MobileMenuGrid.tsx')
  assert.equal((grid.match(/bg-(?:blue|emerald|violet|amber|rose|cyan|indigo)-600 text-white/g) || []).length, 7)
})

test('PWA and fixed scrolling layout contracts', () => {
  assert.match(read('index.html'), /viewport-fit=cover/)
  assert.equal(JSON.parse(read('public/manifest.webmanifest')).display, 'standalone')
  assert.match(read('public/sw.js'), /jurnalku-v\d+/)
  const layout = read('src/components/layout/DashboardLayout.tsx')
  assert.match(layout, /h-screen overflow-hidden/)
  assert.match(layout, /overflow-y-auto/)
})
