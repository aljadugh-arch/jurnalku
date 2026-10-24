'use strict'
// Kontrak halaman publik situs lembaga (SISFO) — 24 Okt 2026.
//
// Halaman publik baru (pengumuman, FAQ, kontak, helpdesk) + backendnya
// (server/publik.cjs). Pengumuman menumpang tabel posting; FAQ/kontak/tiket
// adalah tabel baru. Semua multi-tenant dan tidak butuh login untuk akses publik.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const publik = fs.readFileSync(path.join(AKAR, 'server/publik.cjs'), 'utf8')
const index = fs.readFileSync(path.join(AKAR, 'server/index.cjs'), 'utf8')
const app = fs.readFileSync(path.join(AKAR, 'src/App.tsx'), 'utf8')
const shell = fs.readFileSync(path.join(AKAR, 'src/components/PublicShell.tsx'), 'utf8')

test('backend publik.cjs punya tabel FAQ + kontak + helpdesk', () => {
  assert.ok(publik.includes('CREATE TABLE IF NOT EXISTS faq'), 'tabel faq')
  assert.ok(publik.includes('CREATE TABLE IF NOT EXISTS kontak'), 'tabel kontak')
  assert.ok(publik.includes('CREATE TABLE IF NOT EXISTS helpdesk_tiket'), 'tabel helpdesk')
  assert.ok(publik.includes('tenant_id'), 'multi-tenant')
})

test('route publik tidak butuh login, route admin dijaga peran', () => {
  for (const r of ['/api/publik/pengumuman', '/api/publik/faq', '/api/publik/kontak', '/api/publik/helpdesk']) {
    assert.ok(publik.includes(r), `route publik ${r}`)
  }
  for (const r of ['/api/faq', '/api/kontak', '/api/helpdesk']) {
    assert.ok(publik.includes(r), `route admin ${r}`)
  }
  assert.ok(publik.includes('requireRole'), 'admin pakai requireRole')
})

test('publik.cjs terpasang di index.cjs (setup + register)', () => {
  assert.ok(index.includes("require('./publik.cjs')"), 'import publik.cjs')
  assert.ok(index.includes('setupPublikTables(db)'), 'setup tabel')
  assert.ok(index.includes('registerPublikRoutes(app, db'), 'register route')
})

test('pengumuman publik menumpang tabel posting (tidak tabel baru)', () => {
  assert.ok(publik.includes('FROM posting'), 'baca dari tabel posting')
  assert.ok(/kategori IN \('pengumuman','info','berita'\)/.test(publik), 'filter kategori pengumuman/info/berita')
})

test('rute frontend publik terdaftar di App.tsx', () => {
  for (const r of ['/pengumuman', '/faq', '/kontak', '/helpdesk']) {
    assert.ok(app.includes(`path="${r}"`), `rute ${r}`)
  }
  assert.ok(app.includes('path="website"'), 'rute admin /admin/website')
})

test('cangkang publik konsisten (navbar + footer + nama lembaga dinamis)', () => {
  assert.ok(shell.includes('sk-root'), 'canvas sisfo')
  assert.ok(shell.includes('sk-nav'), 'navbar')
  assert.ok(shell.includes('sk-footer'), 'footer')
  assert.ok(shell.includes('nama_lembaga'), 'nama lembaga dinamis')
  assert.ok(shell.includes('Beranda') && shell.includes('Pengumuman') && shell.includes('FAQ') && shell.includes('Kontak'), 'nav lengkap')
})

test('halaman publik memakai design system sisfo (kelas sk-)', () => {
  const pengumuman = fs.readFileSync(path.join(AKAR, 'src/pages/PengumumanPage.tsx'), 'utf8')
  const faq = fs.readFileSync(path.join(AKAR, 'src/pages/FaqPage.tsx'), 'utf8')
  const kontak = fs.readFileSync(path.join(AKAR, 'src/pages/KontakPage.tsx'), 'utf8')
  const helpdesk = fs.readFileSync(path.join(AKAR, 'src/pages/HelpdeskPage.tsx'), 'utf8')
  assert.ok(pengumuman.includes('PublicShell') && pengumuman.includes('sk-card--flat'), 'pengumuman')
  assert.ok(faq.includes('PublicShell') && faq.includes('sk-card--flat'), 'faq')
  assert.ok(kontak.includes('PublicShell') && kontak.includes('sk-form-card'), 'kontak')
  assert.ok(helpdesk.includes('PublicShell') && helpdesk.includes('sk-form-card'), 'helpdesk')
})
