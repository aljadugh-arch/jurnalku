'use strict'
// Kontrak: sertifikat TLS tetap disajikan untuk lembaga nonaktif, TAPI
// aksesnya tetap ditolak aplikasi dengan 403.
//
// Kenapa: Caddy memakai on_demand_tls dengan "ask" ke /api/caddy/ask. Kalau
// endpoint itu menolak domain lembaga nonaktif, koneksi TLS mati sebelum
// permintaan sampai ke aplikasi — pengunjung melihat error SSL, bukan
// penjelasan "lembaga tidak aktif". Penolakan akses tetap di lapisan aplikasi.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(AKAR, 'server/index.cjs'), 'utf8')

function blokAsk() {
  const i = server.indexOf("app.get('/api/caddy/ask'")
  const j = server.indexOf('})', server.indexOf('domain tidak terdaftar', i))
  return server.slice(i, j)
}

test('ask TIDAK menyaring aktif=1 untuk slug', () => {
  const blok = blokAsk()
  const kode = blok.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.ok(!/WHERE slug = \? AND aktif = 1/.test(kode),
    'ask tidak boleh menolak slug nonaktif — sertifikat harus tetap terbit')
  assert.ok(/WHERE slug = \?/.test(kode), 'harus tetap memeriksa bahwa slug terdaftar')
})

test('ask TIDAK menyaring aktif=1 untuk domain_custom', () => {
  const blok = blokAsk()
  const kode = blok.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.ok(!/domain_custom[^)]*AND aktif = 1/.test(kode), 'domain_custom nonaktif tetap dapat sertifikat')
})

test('penolakan akses tetap terjadi di middleware tenant', () => {
  const tenant = fs.readFileSync(path.join(AKAR, 'server/tenant.cjs'), 'utf8')
  assert.ok(tenant.includes('TENANT_INACTIVE'), 'middleware harus tetap menolak 403')
  assert.ok(tenant.includes('COALESCE(aktif,1)<>1'), 'harus mendeteksi tenant nonaktif')
})
