/**
 * Kontrak UI monitoring kelengkapan: widget harus terpasang di dashboard
 * admin DAN dashboard kepala (keduanya memakai AdminDashboard via
 * AdminIndexRoute di src/App.tsx), serta versi mobile.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const baca = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

test('dashboard admin memuat data kelengkapan dari endpoint dan merender chart', () => {
  const src = baca('src/pages/admin/AdminDashboard.tsx')
  assert.ok(src.includes("api.get('/dashboard/kelengkapan')"), 'AdminDashboard harus memanggil /dashboard/kelengkapan')
  assert.ok(src.includes('setKelengkapan'), 'AdminDashboard harus menyimpan hasil ke state')
  assert.ok(src.includes('Monitoring Kelengkapan Data Lembaga'), 'judul widget kelengkapan tidak ada')
  assert.ok(src.includes('skor_keseluruhan'), 'skor keseluruhan tidak dirender')
  assert.ok(src.includes('<BarChart'), 'harus ada BarChart untuk kelengkapan')
  assert.ok(src.includes('<Bar dataKey="persen"'), 'Bar harus memakai dataKey persen')
})

test('dashboard kepala memakai halaman dashboard yang sama', () => {
  const app = baca('src/App.tsx')
  assert.ok(app.includes("user?.role === 'kepala'") || app.includes("'kepala'"), 'kepala harus termasuk peran dashboard admin')
  // AdminIndexRoute mengembalikan AdminDashboard untuk selain super_admin/bendahara.
  const idx = app.indexOf('function AdminIndexRoute()')
  assert.ok(idx > -1, 'AdminIndexRoute tidak ditemukan')
  const blok = app.substring(idx, app.indexOf('function ProtectedRoute', idx))
  assert.ok(blok.includes('return <AdminDashboard />'), 'kepala memakai AdminDashboard')

  // Endpoint di server harus mengizinkan peran kepala.
  const server = baca('server/index.cjs')
  const roleLine = server.split('\n').find(l => l.includes('const DASHBOARD_ROLES ='))
  assert.ok(roleLine, 'DASHBOARD_ROLES tidak ditemukan')
  assert.ok(roleLine.includes("'kepala'"), 'kepala harus boleh membaca endpoint kelengkapan')
  assert.ok(roleLine.includes("'admin'"), 'admin harus boleh membaca endpoint kelengkapan')
})

test('dashboard mobile menerima dan menampilkan kelengkapan', () => {
  const mobile = baca('src/pages/admin/MobileAdminDashboard.tsx')
  assert.ok(mobile.includes('kelengkapan?: any'), 'props kelengkapan tidak ada di mobile dashboard')
  assert.ok(mobile.includes('Kelengkapan Data Lembaga'), 'judul kelengkapan tidak ada di mobile')
  assert.ok(mobile.includes('kelengkapan.items'), 'item kelengkapan tidak dirender di mobile')
})

test('dashboard admin meneruskan kelengkapan ke versi mobile', () => {
  const src = baca('src/pages/admin/AdminDashboard.tsx')
  assert.ok(
    src.includes('<MobileAdminDashboard stats={stats} loading={loading} kelengkapan={kelengkapan} />'),
    'MobileAdminDashboard harus menerima prop kelengkapan'
  )
})
