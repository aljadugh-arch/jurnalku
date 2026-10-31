// Pintu segmen per domain platform (branding domain).
//
// Tiap domain platform adalah "pintu" bagi satu segmen lembaga, dengan SATU
// domain primary per segmen sebagai target canonical. Alias (idjurnal.biz.id,
// idjurnal.my.id, jurnal.cc.cd) diarahkan canonical/og:url/sitemap-nya ke
// primary segmen masing-masing — bukan ke satu domain global. Halaman lembaga
// (tenant) tetap memakai host lembaganya sendiri.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const idx = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8')
const ten = fs.readFileSync(path.join(__dirname, '../server/tenant.cjs'), 'utf8')

test('jurnalku.biz.id jadi domain utama di DOMAIN_BAWAAN', () => {
  const list = ten.slice(ten.indexOf('const DOMAIN_BAWAAN'), ten.indexOf(']', ten.indexOf('const DOMAIN_BAWAAN')) + 1)
  assert.ok(list.indexOf('jurnalku.biz.id') < list.indexOf('jurnal.cc.cd'), 'jurnalku.biz.id di urutan pertama')
})

test('peta pintu segmen terdefinisi lengkap', () => {
  assert.match(idx, /'jurnalmadrasah\.web\.id': \{ segmen: 'kemenag'/, 'kemenag')
  assert.match(idx, /'idjurnal\.web\.id': \{ segmen: 'dikdasmen'/, 'dikdasmen primary')
  assert.match(idx, /'idjurnal\.biz\.id': \{ segmen: 'dikdasmen', canonical: 'idjurnal\.web\.id' \}/, 'idjurnal.biz.id alias')
  assert.match(idx, /'idjurnal\.my\.id': \{ segmen: 'dikdasmen', canonical: 'idjurnal\.web\.id' \}/, 'idjurnal.my.id alias')
  assert.match(idx, /'jurnalku\.biz\.id': \{ segmen: 'umum'/, 'umum primary')
  assert.match(idx, /'jurnal\.cc\.cd': \{ segmen: 'umum', canonical: 'jurnalku\.biz\.id' \}/, 'jurnal.cc.cd ikut umum')
})

test('canonical platform memakai hostCanonicalPlatform, lembaga memakai host sendiri', () => {
  assert.match(idx, /const canonicalBase = \(req\.tenantId && req\.tenantId !== 'default'\) \? base : `\$\{skemaPermintaan\(req\)\}:\/\/\$\{hostCanonicalPlatform\(host\)\}`/, 'logika canonical')
  assert.match(idx, /if \(req\.tenantId && req\.tenantId !== 'default'\) s = getTenantSettings/, 'nama tenant default tidak dipakai SEO platform')
  assert.match(idx, /function hostCanonicalPlatform\(host\)/, 'helper canonical per segmen')
  assert.match(idx, /<link rel="canonical" href="\$\{escHtml\(canonicalBase \+ path\)\}" \/>/, 'link canonical')
  assert.match(idx, /<meta property="og:url" content="\$\{escHtml\(canonicalBase \+ path\)\}" \/>/, 'og:url')
})

test('robots.txt & sitemap platform menunjuk pintu segmen', () => {
  assert.match(idx, /Sitemap: \$\{canonical\}\/sitemap\.xml/, 'robots Sitemap pakai canonical')
  assert.match(idx, /const base = `\$\{skemaPermintaan\(req\)\}:\/\/\$\{tenantId \? host : hostCanonicalPlatform\(host\)\}`/, 'sitemap base')
})

test('deskripsi SEO per segmen tersedia', () => {
  assert.match(idx, /const SEGMEN_DESC = \{/, 'peta deskripsi segmen')
  assert.match(idx, /kemenag: 'JURNALKU — sistem informasi manajemen madrasah & pesantren/, 'deskripsi kemenag')
  assert.match(idx, /dikdasmen: 'JURNALKU — sistem informasi manajemen sekolah & perguruan tinggi/, 'deskripsi dikdasmen')
  assert.match(idx, /umum: 'JURNALKU — sistem informasi manajemen lembaga pendidikan & kursus/, 'deskripsi umum')
})
