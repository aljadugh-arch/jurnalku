'use strict'
// Kontrak: superadmin masuk ke konteks lembaga tanpa logout.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const svc = baca('server/superadmin-masuk-lembaga.cjs')

test('endpoint masuk-lembaga dan kembali-platform ada', () => {
  assert.ok(svc.includes("'/api/superadmin/lembaga'"), 'endpoint daftar lembaga')
  assert.ok(svc.includes("'/api/superadmin/masuk-lembaga'"), 'endpoint masuk')
  assert.ok(svc.includes("'/api/superadmin/kembali-platform'"), 'endpoint kembali')
})

test('hanya super_admin yang boleh memakai jalur ini', () => {
  const jumlah = (svc.match(/role !== 'super_admin'/g) || []).length
  assert.ok(jumlah >= 3, `ketiga endpoint harus memeriksa peran, dapat ${jumlah}`)
})

test('token baru TIDAK menaikkan hak akses', () => {
  // Role tetap super_admin; hanya tenant_id yang diganti. Kalau role diturunkan
  // menjadi admin lembaga, superadmin kehilangan akses panel platform.
  assert.ok(svc.includes('klaimBersih(u)'), 'payload harus lewat klaimBersih')
  assert.ok(/tenant_id:\s*t\.id/.test(svc), 'hanya tenant_id yang diganti')
  assert.ok(!/role:\s*'admin'/.test(svc), 'role tidak boleh diturunkan jadi admin')
})

// Regresi: jsonwebtoken menolak `expiresIn` bila payload sudah membawa `exp`.
// Terjadi sungguhan di produksi: POST /api/superadmin/masuk-lembaga -> 500
// "Bad options.expiresIn option the payload already has an exp property".
test('klaim waktu lama dibuang sebelum menandatangani token baru', () => {
  assert.ok(svc.includes('const { exp, iat, nbf, ...sisa } = u'), 'harus membuang exp/iat/nbf')
  assert.ok(!/\.\.\.u,\s*\n\s*tenant_id:/.test(svc), 'tidak boleh menyebar payload lama apa adanya')
})

test('tenant asal disimpan agar bisa kembali', () => {
  assert.ok(svc.includes('tenant_asli'), 'harus menyimpan tenant asal')
  assert.ok(/tenant_asli:\s*undefined/.test(svc), 'kembali harus menghapus penanda')
})

test('lembaga nonaktif tidak bisa dimasuki', () => {
  assert.ok(svc.includes('TENANT_INACTIVE'), 'harus menolak lembaga nonaktif')
  assert.ok(/Number\(t\.aktif\) !== 1/.test(svc), 'pemeriksaan status harus eksplisit')
})

test('setiap perpindahan dicatat', () => {
  assert.ok(svc.includes('[masuk-lembaga]'), 'harus menulis log perpindahan')
})

test('UI: halaman pemilih + banner kembali', () => {
  const page = baca('src/pages/admin/SuperadminLembagaPage.tsx')
  assert.ok(page.includes('Masuk ke lembaga'), 'harus ada tombol masuk')
  assert.ok(page.includes('/superadmin/lembaga'), 'harus memuat daftar dari server')
  assert.ok(page.includes('Nonaktif'), 'lembaga nonaktif harus terlihat statusnya')
  const layout = baca('src/components/layout/DashboardLayout.tsx')
  assert.ok(layout.includes('Kembali ke platform'), 'harus ada jalan kembali')
  assert.ok(layout.includes('/superadmin/kembali-platform'), 'tombol harus memanggil endpoint kembali')
})

// Regresi: `aktif_sekarang` pernah diisi tenant_asli, sehingga UI menandai
// lembaga asal sebagai "sedang dibuka" padahal yang dibuka lembaga lain.
test('aktif_sekarang menunjuk lembaga yang SEDANG dibuka', () => {
  assert.ok(/aktif_sekarang:\s*u\.tenant_asli \? u\.tenant_id/.test(svc),
    'saat masuk lembaga, aktif_sekarang harus tenant_id (bukan tenant_asli)')
})

test('menu superadmin memuat pintu masuk', () => {
  const menu = baca('src/lib/menuItems.tsx')
  const i = menu.indexOf('export const superAdminMenuItems')
  const blok = menu.slice(i, menu.indexOf('export function menuForRole'))
  assert.ok(blok.includes("path: '/admin/masuk-lembaga'"), 'menu harus ada di daftar superadmin')
})
