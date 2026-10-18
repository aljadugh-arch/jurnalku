'use strict'
// Tes: fitur baru terdaftar di paket langganan, Program Belajar khusus
// nonformal, dan registrasi bisa memilih 6 domain dari domain mana pun.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const sub = require(path.join(AKAR, 'server/subscription.cjs'))

// ---------- FITUR BARU DI PAKET ----------
const FITUR_BARU = ['ppdb', 'administrasi', 'perpustakaan', 'ujian', 'program_belajar', 'smtp', 'monitoring', 'foundation']

test('paket: semua fitur baru terdaftar di FEATURE_KEYS', () => {
  for (const k of FITUR_BARU) {
    assert.ok(sub.FEATURE_KEYS.includes(k), `fitur ${k} harus ada di FEATURE_KEYS`)
  }
})

test('paket: fitur baru digerbang per paket (bukan tersedia untuk semua)', () => {
  const lite = new Set(sub.PLAN_FEATURES.lite)
  const pro = new Set(sub.PLAN_FEATURES.pro)
  const premium = new Set(sub.PLAN_FEATURES.premium)
  // Lite TIDAK dapat fitur lanjutan
  for (const k of ['smtp', 'ujian', 'program_belajar', 'monitoring', 'foundation', 'cashless', 'ekantin']) {
    assert.ok(!lite.has(k), `lite tidak boleh punya ${k}`)
  }
  // Lite DAPAT fitur inti baru
  for (const k of ['ppdb', 'administrasi', 'perpustakaan']) {
    assert.ok(lite.has(k), `lite harus punya ${k}`)
  }
  // Pro dapat fitur lanjutan, kecuali cashless/kantin/yayasan
  for (const k of ['smtp', 'ujian', 'program_belajar', 'monitoring', 'ppdb', 'administrasi', 'perpustakaan']) {
    assert.ok(pro.has(k), `pro harus punya ${k}`)
  }
  for (const k of ['cashless', 'ekantin', 'foundation']) {
    assert.ok(!pro.has(k), `pro tidak boleh punya ${k}`)
  }
  // Premium dapat semua
  for (const k of FITUR_BARU) assert.ok(premium.has(k), `premium harus punya ${k}`)
})

test('paket: tetap bertingkat (lite < pro < premium)', () => {
  assert.ok(sub.PLAN_FEATURES.lite.length < sub.PLAN_FEATURES.pro.length)
  assert.ok(sub.PLAN_FEATURES.pro.length < sub.PLAN_FEATURES.premium.length)
  assert.strictEqual(sub.PLAN_FEATURES.premium.length, sub.FEATURE_KEYS.length)
})

test('paket: prefix endpoint fitur baru terdaftar (gerbang server nyata)', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/subscription.cjs'), 'utf8')
  // Ambil blok FEATURE_PREFIXES
  const blok = src.slice(src.indexOf('const FEATURE_PREFIXES'), src.indexOf('function addMonthsIso'))
  for (const [fitur, prefix] of [
    ['ppdb', '/api/ppdb/pendaftar'],
    ['administrasi', '/api/administrasi'],
    ['perpustakaan', '/api/library'],
    ['ujian', '/api/bank-soal'],
    ['program_belajar', '/api/program-belajar'],
    ['smtp', '/api/smtp'],
  ]) {
    assert.ok(blok.includes(prefix), `prefix ${prefix} (${fitur}) harus terdaftar`)
  }
})

test('paket: pendaftaran publik PPDB TIDAK digerbang paket (calon siswa tetap bisa daftar)', () => {
  // /api/ppdb/publik/* harus bisa diakses walau paket tidak punya fitur ppdb,
  // karena ini halaman pendaftaran calon siswa (publik), bukan fungsi panitia.
  const prefixPpdb = sub.PLAN_FEATURES ? null : null
  const src = fs.readFileSync(path.join(AKAR, 'server/subscription.cjs'), 'utf8')
  const blok = src.slice(src.indexOf('ppdb:'), src.indexOf('ppdb:') + 200)
  assert.ok(!blok.includes('/api/ppdb/publik'), 'prefix publik TIDAK boleh digerbang')
  assert.ok(blok.includes('/api/ppdb/pendaftar'), 'prefix panitia HARUS digerbang')
})

test('paket: FE featureAccess memuat aturan untuk fitur baru', () => {
  const fe = fs.readFileSync(path.join(AKAR, 'src/lib/featureAccess.ts'), 'utf8')
  for (const [fitur, halaman] of [
    ['ppdb', '/admin/ppdb'],
    ['administrasi', '/admin/administrasi'],
    ['perpustakaan', '/admin/perpustakaan'],
    ['ujian', '/admin/bank-soal'],
    ['program_belajar', '/admin/program-belajar'],
    ['smtp', '/admin/smtp'],
    ['monitoring', '/admin/monitoring'],
    ['foundation', '/admin/foundation-sync'],
  ]) {
    assert.ok(fe.includes(`['${fitur}'`), `aturan ${fitur} harus ada di featureAccess.ts`)
    assert.ok(fe.includes(halaman), `halaman ${halaman} harus terdaftar`)
  }
})

test('paket: FeatureKey FE memuat fitur baru', () => {
  const store = fs.readFileSync(path.join(AKAR, 'src/stores/subscriptionStore.ts'), 'utf8')
  for (const k of FITUR_BARU) {
    assert.ok(store.includes(`'${k}'`), `FeatureKey harus memuat ${k}`)
  }
})

test('paket: label fitur baru tersedia di UI admin', () => {
  // Label kini berasal dari SATU sumber bersama (lib/fiturPaket) agar landing
  // dan dashboard superadmin tidak pernah berbeda kata. Yang diuji adalah
  // hasilnya: setiap fitur baru punya label yang bisa dibaca admin.
  const ui = fs.readFileSync(path.join(AKAR, 'src/pages/admin/TenantManagementPage.tsx'), 'utf8')
  const lib = fs.readFileSync(path.join(AKAR, 'src/lib/fiturPaket.ts'), 'utf8')
  assert.ok(/FITUR_INFO/.test(ui), 'UI admin harus memakai FITUR_INFO bersama')
  for (const k of FITUR_BARU) {
    assert.ok(new RegExp(`${k}:\\s*\\{`).test(lib), `label ${k} harus ada di FITUR_INFO`)
  }
})

// ---------- PROGRAM BELAJAR KHUSUS NONFORMAL ----------
test('program belajar: SEMUA route digerbang nonformal (termasuk GET)', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/program-belajar-routes.cjs'), 'utf8')
  const routes = src.match(/app\.(get|post|put|delete)\('\/api\/program-[^']+'[^\n]*/g) || []
  assert.ok(routes.length >= 7, `harus ada minimal 7 route program (ditemukan ${routes.length})`)
  for (const r of routes) {
    assert.ok(r.includes('hanyaNonformal'), `route harus digerbang nonformal: ${r.slice(0, 80)}`)
  }
})

test('program belajar: deteksi jenjang nonformal menerima variasi penulisan', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/program-belajar-routes.cjs'), 'utf8')
  for (const pola of ['NONFORMAL', 'NON-FORMAL', 'KURSUS', 'DIKLAT', 'BIMBEL', "'NF'"]) {
    assert.ok(src.includes(pola), `deteksi harus mengenali ${pola}`)
  }
})

test('program belajar: gerbang mengembalikan 403 dengan kode jelas', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/program-belajar-routes.cjs'), 'utf8')
  assert.match(src, /NONFORMAL_ONLY/, 'harus ada kode NONFORMAL_ONLY')
  assert.match(src, /hanya tersedia untuk lembaga nonformal/i, 'pesan harus menjelaskan alasannya')
})

// ---------- REGISTRASI 6 DOMAIN ----------
test('domain: registrasi memuat daftar domain dari server dan bisa memilih', () => {
  const fe = fs.readFileSync(path.join(AKAR, 'src/pages/auth/RegisterPage.tsx'), 'utf8')
  assert.match(fe, /api\.get\('\/tenant\/domains'\)/, 'harus memuat daftar domain dari server')
  assert.match(fe, /setBaseDomains/, 'hasil harus disimpan untuk dropdown')
  assert.match(fe, /onChange=\{e => setPilihBase\(e\.target\.value\)\}/, 'dropdown harus bisa dipilih')
  assert.match(fe, /payload\.base_domain = pilihBase \|\| SUBDOMAIN_BASE/, 'pilihan harus dikirim ke server')
})

test('domain: dropdown menampilkan SEMUA domain yang sah, bukan hanya domain host', () => {
  const fe = fs.readFileSync(path.join(AKAR, 'src/pages/auth/RegisterPage.tsx'), 'utf8')
  // Harus memetakan seluruh baseDomains, bukan hanya satu nilai
  assert.match(fe, /\(baseDomains\.length \? baseDomains : \[SUBDOMAIN_BASE\]\)\.map/, 'dropdown harus memetakan semua domain')
})

test('domain: server hanya menerima base_domain yang terdaftar (anti-injeksi)', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/index.cjs'), 'utf8')
  assert.match(src, /BASE_DOMAINS\.includes\(mintaBase\)/, 'base_domain harus divalidasi')
})

test('domain: endpoint /api/tenant/domains mengembalikan daftar dari BASE_DOMAINS', () => {
  const src = fs.readFileSync(path.join(AKAR, 'server/index.cjs'), 'utf8')
  assert.match(src, /app\.get\('\/api\/tenant\/domains'/)
  assert.match(src, /BASE_DOMAINS\.map/, 'harus memetakan BASE_DOMAINS')
  const tenant = fs.readFileSync(path.join(AKAR, 'server/tenant.cjs'), 'utf8')
  const jumlah = (tenant.match(/^  '[a-z0-9.-]+',$/gm) || []).length
  assert.ok(jumlah >= 6, `harus ada minimal 6 domain terdaftar (ditemukan ${jumlah})`)
})

test('paket: migrasi ADITIF menambahkan fitur baru tanpa mencabut penyesuaian manual', () => {
  const Database = require('better-sqlite3')
  const os = require('node:os')
  const f = path.join(os.tmpdir(), 'migrasi-aditif-' + Date.now() + '.db')
  const db = new Database(f)
  try {
    db.exec('CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, plan TEXT, trial_ends_at TEXT, subscription_ends_at TEXT, expired_at TEXT, features_json TEXT)')
    sub.setupSubscriptionTables(db)
    // Simulasikan baris DB produksi: fitur LAMA saja (belum ada fitur baru),
    // dan 'lite' sudah disesuaikan manual (punya rest_api).
    const lamaLite = [...sub.FEATURE_KEYS.filter(k => !['backup_drive','website','rest_api','cashless','ekantin','ppdb','administrasi','perpustakaan','ujian','program_belajar','smtp','monitoring','foundation'].includes(k)), 'rest_api']
    db.prepare("UPDATE subscription_plans SET fitur_json=? WHERE plan='lite'").run(JSON.stringify(Object.fromEntries(lamaLite.map(k => [k, true]))))
    const lamaPro = sub.FEATURE_KEYS.filter(k => !['cashless','ekantin','ppdb','administrasi','perpustakaan','ujian','program_belajar','smtp','monitoring','foundation'].includes(k))
    db.prepare("UPDATE subscription_plans SET fitur_json=? WHERE plan='pro'").run(JSON.stringify(Object.fromEntries(lamaPro.map(k => [k, true]))))

    sub.setupSubscriptionPlans(db)
    const map = sub.planFeatureMap(db)
    const ambil = (p) => new Set(Array.isArray(map[p]) ? map[p] : map[p].fitur)

    // Lite: dapat fitur inti baru, TIDAK dapat fitur lanjutan, rest_api manual tetap ada
    assert.ok(ambil('lite').has('ppdb'), 'lite harus dapat ppdb')
    assert.ok(ambil('lite').has('administrasi'), 'lite harus dapat administrasi')
    assert.ok(!ambil('lite').has('smtp'), 'lite TIDAK boleh dapat smtp')
    assert.ok(!ambil('lite').has('ujian'), 'lite TIDAK boleh dapat ujian')
    assert.ok(ambil('lite').has('rest_api'), 'penyesuaian manual (rest_api) tidak boleh dicabut')
    // Pro: dapat fitur lanjutan, tetap tanpa cashless
    assert.ok(ambil('pro').has('smtp') && ambil('pro').has('ujian'), 'pro harus dapat smtp & ujian')
    assert.ok(!ambil('pro').has('cashless'), 'pro tetap tanpa cashless')
    // Bertingkat
    assert.ok(ambil('lite').size < ambil('pro').size)
    assert.ok(ambil('pro').size < ambil('premium').size)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})
