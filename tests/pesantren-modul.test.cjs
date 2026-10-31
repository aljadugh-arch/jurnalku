// Modul Pesantren/Pondok: asrama & kamar, penempatan santri, izin pulang.
//
// Fitur digerbang paket lewat feature key `pesantren` — menu FE (featureAccess)
// dan route API (FEATURE_PREFIXES) otomatis ditolak untuk paket yang tidak
// mencakup pesantren (Lite). Pro/Premium/Trial memilikinya.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('fitur pesantren terdaftar di sistem paket', () => {
  const sub = baca('server/subscription.cjs')
  assert.match(sub, /'pesantren',\s+\/\/ Asrama\/kamar/, 'FEATURE_KEYS memuat pesantren')
  assert.match(sub, /pesantren: \['\/api\/asrama', '\/api\/kamar', '\/api\/penempatan', '\/api\/izin-pulang', '\/api\/tazir'\]/, 'FEATURE_PREFIXES pesantren')
  // Lite TIDAK boleh memuat pesantren; pro/premium memuatnya (premium = FEATURE_KEYS).
  assert.match(sub, /lite: FEATURE_KEYS\.filter\(k => !\[[^\]]*'pesantren'[^\]]*\]\.includes\(k\)\)/, 'lite mengecualikan pesantren')
})

test('tabel & route pesantren ada di backend', () => {
  const p = baca('server/pesantren.cjs')
  for (const t of ['asrama', 'kamar', 'penempatan_santri', 'izin_pulang', 'tazir']) {
    assert.match(p, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`), `tabel ${t}`)
  }
  for (const r of ['/api/asrama', '/api/kamar', '/api/penempatan', '/api/izin-pulang', '/api/tazir']) {
    assert.match(p, new RegExp(`app\\.(get|post|put|delete)\\(['"\`]${r}`), `route ${r}`)
  }
  assert.match(p, /waGateway\.sendMessage/, 'notifikasi WA wali saat keputusan izin')
  // Cegah dobel penempatan + kapasitas kamar.
  assert.match(p, /Santri sudah ditempatkan di kamar aktif/, 'cegah dobel penempatan')
  assert.match(p, /Kamar penuh/, 'cegah melebihi kapasitas')
})

test('modul terpasang di index.cjs (require + setup + register)', () => {
  const idx = baca('server/index.cjs')
  assert.match(idx, /require\('\.\/pesantren\.cjs'\)/, 'require pesantren')
  assert.match(idx, /setupPesantrenTables\(db\)/, 'setup tabel')
  assert.match(idx, /registerPesantrenRoutes\(app, \{ db, requireRole, waGateway \}\)/, 'register route')
})

test('menu & gerbang FE pesantren', () => {
  const menu = baca('src/lib/menuItems.tsx')
  assert.match(menu, /label: 'Asrama & Penempatan', path: '\/admin\/asrama'/, 'menu asrama')
  assert.match(menu, /label: 'Perizinan Pulang', path: '\/admin\/perizinan'/, 'menu perizinan')
  const fa = baca('src/lib/featureAccess.ts')
  assert.match(fa, /\['pesantren', \['\/admin\/asrama', '\/admin\/perizinan', '\/admin\/tazir'\]\]/, 'rules gerbang FE')
  const st = baca('src/stores/subscriptionStore.ts')
  assert.match(st, /\|'pesantren'/, 'FeatureKey pesantren')
})
