// Canonical brand = jurnalku.biz.id. Domain platform lain (jurnal.cc.cd,
// idjurnal.*, jurnalmadrasah.web.id) tetap melayani aplikasi, tetapi sinyal
// SEO-nya (canonical, og:url, sitemap, robots Sitemap) diarahkan ke domain
// utama supaya tidak terindeks sebagai duplikat. Halaman lembaga tetap memakai
// host lembaganya sendiri.

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

test('canonical platform memakai BASE_DOMAIN, lembaga memakai host sendiri', () => {
  assert.match(idx, /const canonicalBase = \(req\.tenantId && req\.tenantId !== 'default'\) \? base : `\$\{skemaPermintaan\(req\)\}:\/\/\$\{BASE_DOMAIN \|\| 'jurnalku\.biz\.id'\}`/, 'logika canonical (default = platform)')
  assert.match(idx, /<link rel="canonical" href="\$\{escHtml\(canonicalBase \+ path\)\}" \/>/, 'link canonical')
  assert.match(idx, /<meta property="og:url" content="\$\{escHtml\(canonicalBase \+ path\)\}" \/>/, 'og:url')
})

test('robots.txt & sitemap platform menunjuk domain utama', () => {
  assert.match(idx, /Sitemap: \$\{canonical\}\/sitemap\.xml/, 'robots Sitemap pakai canonical')
  assert.match(idx, /const base = `\$\{skemaPermintaan\(req\)\}:\/\/\$\{tenantId \? host : \(BASE_DOMAIN \|\| 'jurnalku\.biz\.id'\)\}`/, 'sitemap base')
})
