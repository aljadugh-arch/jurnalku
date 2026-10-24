'use strict'
// Kontrak tema publik terpadu + dark mode merata (24 Okt 2026).
//
// Semua halaman publik (landing, login, register, panduan, PPDB, pengumuman,
// FAQ, kontak, helpdesk) memakai design system SISFO yang sama. Design system
// harus SEPENUHNYA variable-driven (`var(--sk-*)`) supaya mode gelap menimpa
// token di blok `.dark` — tidak boleh ada hardcode krem/putih yang membuat dark
// theme tidak merata.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const sisfo = fs.readFileSync(path.join(AKAR, 'src/styles/sisfo.css'), 'utf8')

const HALAMAN_PUBLIK = [
  'src/pages/LandingPage.tsx',
  'src/pages/auth/LoginPage.tsx',
  'src/pages/auth/RegisterPage.tsx',
  'src/pages/auth/ForgotPasswordPage.tsx',
  'src/pages/PanduanPage.tsx',
  'src/pages/PpdbPublikPage.tsx',
  'src/pages/PengumumanPage.tsx',
  'src/pages/FaqPage.tsx',
  'src/pages/KontakPage.tsx',
  'src/pages/HelpdeskPage.tsx',
]

test('design system punya blok .dark yang menimpa token', () => {
  assert.ok(/\.dark\s*\{/.test(sisfo), 'blok .dark ada')
  assert.ok(sisfo.includes('--sk-bg: #0b0f19'), 'dark bg')
  assert.ok(sisfo.includes('--sk-surface: #141c2e'), 'dark surface')
  assert.ok(sisfo.includes('--sk-text: #f1f5f9'), 'dark text')
})

test('tidak ada hardcode hex krem/putih di komponen sk-* (semua via var)', () => {
  // Strip komentar dulu — header dokumen menyebut token (mis. "--sk-bg #fbfaf8")
  // sebagai dokumentasi, bukan aturan gaya. Lalu buang blok :root/.dark supaya
  // yang diperiksa hanya aturan komponen.
  const tanpaKomentar = sisfo.replace(/\/\*[\s\S]*?\*\//g, '')
  const tanpaToken = tanpaKomentar.replace(/^:root\s*\{[\s\S]*?\}/m, '').replace(/^\.dark\s*\{[\s\S]*?\}/m, '')
  const bocor = []
  for (const hx of ['#fbfaf8', '#ffffff', '#24262d', '#6f7785', '#e7e4df', '#fff4e9', '#f1efec', '#f4f2ef', '#eee8e1']) {
    if (tanpaToken.includes(hx)) bocor.push(hx)
  }
  assert.deepStrictEqual(bocor, [], `hardcode terang masih bocor: ${bocor.join(', ')}`)
})

test('utilitas semantik sk-* ada (pengganti hex di JSX)', () => {
  for (const k of ['sk-txt', 'sk-txt-muted', 'sk-txt-accent', 'sk-bg-soft', 'sk-bg-subtle', 'sk-border-soft', 'sk-border-accent']) {
    assert.ok(sisfo.includes(`.${k}`), `kelas ${k}`)
  }
})

test('semua halaman publik memakai design system SISFO', () => {
  for (const f of HALAMAN_PUBLIK) {
    const src = fs.readFileSync(path.join(AKAR, f), 'utf8')
    assert.ok(/sk-root|PublicShell|sk-nav|sk-card/.test(src), `${f} harus memakai kelas sk-* atau PublicShell`)
  }
})

test('tidak ada hex terang hardcoded di JSX halaman publik (pakai utilitas sk-)', () => {
  const hexTerang = /text-\[#(24262d|6f7785|38404b|69574f|484a51)\]|bg-\[#(fff4e9|f1efec|f4f2ef|eee8e1)\]|border-\[#(e7e4df|f4d3b4|eee8e1)\]/
  for (const f of HALAMAN_PUBLIK) {
    const src = fs.readFileSync(path.join(AKAR, f), 'utf8')
    assert.ok(!hexTerang.test(src), `${f} masih pakai hex terang hardcoded — ganti utilitas sk-*`)
  }
})
