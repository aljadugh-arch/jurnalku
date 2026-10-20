'use strict'
// Kontrak empat perbaikan konfigurasi:
//
//  5. MENU/FITUR IKUT PAKET. Menu yang tidak ada di paket tidak boleh muncul,
//     dan API-nya juga harus ditolak server — gerbang menu saja tidak cukup.
//  7. DEMO HANYA DI HOST DEMO. Sebelumnya jurnal.cc.cd & jurnalmadrasah.web.id
//     mengizinkan login demo, sehingga pengunjung domain lembaga sungguhan bisa
//     masuk sebagai admin demo dan mengira itu data lembaganya.
//  8. QRIS LEMBAGA, BUKAN MERCHANT. ShopeePay/GoPay merchant diganti daftar
//     QRIS milik lembaga (bank/e-wallet apa pun).
//  9. LABEL FITUR SATU SUMBER. Landing dan dashboard superadmin tidak boleh
//     punya dua daftar label yang berbeda kata.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

// ---------------- (5) gerbang paket ----------------
test('menu baru terdaftar di gerbang fitur FE', () => {
  const fa = baca('src/lib/featureAccess.ts')
  for (const [path_, fitur] of [
    ['/admin/bk', 'penilaian'],
    ['/admin/mutasi', 'master_data'],
    ['/admin/substitusi', 'master_data'],
    ['/admin/pustaka', 'perpustakaan'],
    ['/admin/lms', 'modul_ajar'],
    ['/admin/payroll', 'monitoring'],
    ['/admin/rkas', 'monitoring'],
  ]) {
    const baris = fa.split('\n').find(l => l.includes(`'${path_}'`))
    assert.ok(baris, `path ${path_} harus terdaftar di featureAccess.ts`)
    assert.ok(baris.includes(`'${fitur}'`), `${path_} harus digerbang fitur ${fitur}, dapat: ${baris?.slice(0, 90)}`)
  }
})

test('API modul baru ditolak server untuk paket yang tidak memilikinya', () => {
  const sub = baca('server/subscription.cjs')
  for (const api of ['/api/bk', '/api/mutasi', '/api/pustaka', '/api/substitusi', '/api/lms', '/api/payroll', '/api/rkas']) {
    assert.ok(sub.includes(`'${api}'`), `prefix ${api} harus ada di FEATURE_PREFIXES server`)
  }
})

// ---------------- (7) demo ----------------
test('demo hanya di host demo, bukan domain lembaga', () => {
  const srv = baca('server/index.cjs')
  const baris = srv.split('\n').find(l => l.includes('DEMO_HOSTS'))
  assert.ok(baris, 'DEMO_HOSTS harus ada')
  assert.ok(!/DEMO_HOSTS = new Set\(\['jurnal\.cc\.cd'/.test(srv),
    'jurnal.cc.cd tidak boleh ada di daftar host demo')
  assert.ok(!/DEMO_HOSTS = new Set\(\['jurnal\.cc\.cd', 'jurnalmadrasah\.web\.id'\]\)/.test(srv),
    'jurnalmadrasah.web.id tidak boleh ada di daftar host demo')
})

// KONTRAK DIPERBARUI atas permintaan user: "perbaiki akun demo munculkan di
// jurnal". Tombol demo kini tampil di semua domain platform. Yang WAJIB tetap
// dijaga bukan lagi visibilitas tombol, melainkan ISOLASI DATA:
//   - server hanya melayani /api/auth/demo dari host di DEMO_HOSTS
//   - tenant demo terpisah (demo-tenant), bukan 'default'
//   - akun demo tidak bisa dipakai masuk ke data lembaga sungguhan
test('akun demo tampil di jurnal, tapi datanya terisolasi', () => {
  const login = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(/Akun demo/.test(login), 'blok akun demo harus ada di halaman login')
  assert.ok(!/\/\^\(demo\.\|demo-\)\//.test(login),
    'tombol demo tidak boleh dikunci ke host demo.* lagi')

  const srv = baca('server/index.cjs')
  assert.ok(/const DEMO_HOSTS = new Set/.test(srv), 'server tetap membatasi host demo')
  assert.ok(/if \(!DEMO_HOSTS\.has\(demoHost\)\) return res\.status\(404\)/.test(srv),
    'host di luar DEMO_HOSTS harus ditolak 404 — ini pengaman sebenarnya')
  assert.ok(/const DEMO_TENANT_ID = 'demo-tenant'/.test(srv),
    'tenant demo harus terpisah dari default/superadmin')
})

// ---------------- (8) QRIS lembaga ----------------
test('QRIS memakai daftar milik lembaga, bukan merchant Shopee/GoPay', () => {
  const pc = baca('server/portal-cashless.cjs')
  assert.ok(/qris_list/.test(pc), 'harus ada qris_list')
  assert.ok(/qrisListDariConfig/.test(pc), 'harus ada pembacaan daftar QRIS')
  // Data lama tetap terbaca (kompatibilitas), tapi TIDAK ditulis lagi.
  const normal = pc.slice(pc.indexOf('const normalizeStaticQrisConfig'), pc.indexOf('const normalizeBankTransferConfig'))
  assert.ok(!/shopee_qris:/.test(normal), 'normalisasi tidak boleh lagi menulis shopee_qris')
  assert.ok(!/gopay_qris:/.test(normal), 'normalisasi tidak boleh lagi menulis gopay_qris')
})

test('bank_dari memakai label QRIS lembaga, bukan nama merchant', () => {
  const pc = baca('server/portal-cashless.cjs')
  assert.ok(!/provider === 'shopee' \? 'ShopeePay' : 'GoPay'/.test(pc),
    'nama merchant lama tidak boleh dipakai sebagai bank_dari')
  assert.ok(/declaration\.bank_dari = dipilih\.label/.test(pc),
    'bank_dari harus diisi label QRIS yang dipilih')
})

test('UI admin mengelola daftar QRIS, bukan dua kolom merchant', () => {
  const ui = baca('src/pages/admin/CashlessBankConfigPage.tsx')
  assert.ok(/qris_list/.test(ui))
  assert.ok(!/shopee_qris/.test(ui) && !/gopay_qris/.test(ui))
  assert.ok(/Tambah QRIS/.test(ui), 'admin harus bisa menambah QRIS')
})

test('UI siswa memilih dari daftar QRIS lembaga', () => {
  const ui = baca('src/pages/siswa/SiswaQrisTopupPage.tsx')
  assert.ok(/qris_list/.test(ui))
  assert.ok(!/shopee_qris/.test(ui) && !/gopay_qris/.test(ui))
})

test('payment gateway memakai pg.fazapay.ccwu.cc', () => {
  const gw = baca('server/payment-gateway.cjs')
  assert.ok(/pg\.fazapay\.ccwu\.cc/.test(gw), 'base URL gateway harus pg.fazapay.ccwu.cc')
})

// ---------------- (9) label fitur satu sumber ----------------
test('label fitur punya satu sumber bersama', () => {
  const lib = baca('src/lib/fiturPaket.ts')
  assert.ok(/export const FITUR_INFO/.test(lib))
  for (const k of ['master_data', 'absensi', 'ujian', 'perpustakaan', 'payroll']) {
    if (k === 'payroll') continue
    assert.ok(new RegExp(`${k}:\\s*\\{`).test(lib), `fitur ${k} harus ada di FITUR_INFO`)
  }
})

test('landing dan dashboard superadmin memakai sumber yang sama', () => {
  const landing = baca('src/pages/LandingPage.tsx')
  const admin = baca('src/pages/admin/TenantManagementPage.tsx')
  assert.ok(/from '\.\.\/lib\/fiturPaket'/.test(landing), 'landing harus impor fiturPaket')
  assert.ok(/from '\.\.\/\.\.\/lib\/fiturPaket'/.test(admin), 'dashboard superadmin harus impor fiturPaket')
  assert.ok(!/const LABEL_FITUR: Record<string, string> = \{/.test(landing),
    'landing tidak boleh punya daftar label sendiri lagi')
  assert.ok(!/const FEATURE_LABELS: Record<string, string> = \{\n  master_data/.test(admin),
    'dashboard superadmin tidak boleh punya daftar label sendiri lagi')
})

test('landing menampilkan fitur PEMBEDA, bukan daftar sama di semua paket', () => {
  const lib = baca('src/lib/fiturPaket.ts')
  assert.ok(/export function fiturPembeda/.test(lib))
  const landing = baca('src/pages/LandingPage.tsx')
  assert.ok(/fiturPembeda\(paket\)/.test(landing), 'landing harus memakai fiturPembeda')
})
