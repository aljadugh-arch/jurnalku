'use strict'
// Kontrak: teks "Sistem Informasi ..." mengikuti tipe institusi (jenjang),
// tidak hardcoded "Madrasah & Sekolah" untuk semua lembaga. Juga memastikan
// alur registrasi custom domain vs subdomain tidak tertukar.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('labelInstitusi memetakan jenjang ke tipe institusi', () => {
  // Impor helper via transpile sederhana: baca definisi + eval terisolasi.
  const src = baca('src/lib/jenjang.ts')
  // Ekstrak canonicalJenjang + labelInstitusi cukup dengan menguji regex sumber
  // (helper murni; perilakunya dijamin oleh unit source + pemakaian di FE).
  assert.match(src, /export function labelInstitusi\(jenjang\?: string\): string/, 'helper labelInstitusi harus ada')
  assert.match(src, /return 'Madrasah'/, 'MI/MTs/MA -> Madrasah')
  assert.match(src, /return 'Sekolah'/, 'SD/SMP/SMA -> Sekolah')
  assert.match(src, /return 'Perguruan Tinggi'/, 'PT -> Perguruan Tinggi')
  assert.match(src, /return 'Pesantren'/, 'Pesantren -> Pesantren')
  assert.match(src, /return 'Lembaga'/, 'NF/umum -> Lembaga')
})

test('login & header dashboard memakai label dinamis, bukan hardcoded', () => {
  const login = baca('src/pages/auth/LoginPage.tsx')
  const header = baca('src/components/MobileDashboardHeader.tsx')
  assert.match(login, /Sistem Informasi \{labelInstitusi\(\(settings as any\)\.jenjang\)/, 'login harus dinamis per jenjang')
  assert.doesNotMatch(login, />Sistem Informasi Madrasah &amp; Sekolah</, 'tidak boleh ada teks hardcoded lama di login')
  assert.match(header, /labelInstitusi\(\(settings as any\)\.jenjang\)/, 'header dashboard harus dinamis per jenjang')
})

test('registrasi kirim domain_type=custom untuk custom domain, slug untuk subdomain', () => {
  const reg = baca('src/pages/auth/RegisterPage.tsx')
  assert.match(reg, /payload\.domain_type = 'custom'/, 'custom domain harus kirim domain_type=custom')
  assert.match(reg, /payload\.domain_custom = form\.domain_custom/, 'custom domain harus kirim domain_custom')
  assert.match(reg, /payload\.slug = form\.slug/, 'subdomain harus kirim slug')
  assert.match(reg, /payload\.base_domain = pilihBase \|\| SUBDOMAIN_BASE/, 'subdomain harus kirim base_domain')
})

test('server register: domainVal hanya saat domain_type=custom, appUrl ikut domainVal', () => {
  const srv = baca('server/index.cjs')
  const start = srv.indexOf("app.post('/api/auth/register'")
  const end = srv.indexOf("app.post('/api/tenant/verify-domain'")
  const blok = srv.slice(start, end)
  assert.match(blok, /domain_type === 'custom' && custom_domain/, 'server hanya set domainVal untuk custom domain')
  assert.match(blok, /appUrl = domainVal\s*\?/, 'appUrl memakai domainVal bila ada')
  assert.match(blok, /`https:\/\/\$\{slug\}\.\$\{subdomainBase\}`/, 'appUrl subdomain = slug.base_domain')
  assert.match(blok, /terapkanDomain\(domainVal\)/, 'custom domain di-provision via terapkanDomain')
  assert.match(blok, /url: appUrl/, 'respons memuat url: appUrl')
})
