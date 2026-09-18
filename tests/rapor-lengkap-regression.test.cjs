const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server', 'index.cjs'), 'utf8')
const page = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'RaporPage.tsx'), 'utf8')

test('backend menyediakan ringkasan rapor lengkap per siswa dan tenant', () => {
  assert.match(server, /get\('\/api\/rapor\/ringkasan'/)
  assert.match(server, /catatan_kepribadian/)
  assert.match(server, /absensi_siswa/)
  assert.match(server, /ekskul_anggota/)
  assert.match(server, /wali_kelas_nama/)
  assert.match(server, /tenant_id=\?/)
})

test('backend menyimpan pelengkap rapor secara tenant-scoped', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS rapor_pelengkap/)
  assert.match(server, /UNIQUE\(tenant_id, siswa_id, tahun_ajaran, semester, jenis\)/)
  assert.match(server, /put\('\/api\/rapor\/pelengkap'/)
  assert.match(server, /keputusan/)
  assert.match(server, /tinggi_badan/)
  assert.match(server, /berat_badan/)
  assert.match(server, /prestasi/)
})

test('UI rapor memuat dan menyimpan data rapor lengkap', () => {
  assert.match(page, /\/rapor\/ringkasan/)
  assert.match(page, /\/rapor\/pelengkap/)
  assert.match(page, /Kehadiran/)
  assert.match(page, /Ekstrakurikuler/)
  assert.match(page, /Prestasi/)
  assert.match(page, /Catatan Wali Kelas/)
  assert.match(page, /Keputusan/)
})

test('hasil cetak rapor memiliki halaman identitas dan isi A4', () => {
  assert.match(page, /IDENTITAS PESERTA DIDIK/i)
  assert.match(page, /print:break-after-page/)
  assert.match(page, /@page/)
  assert.match(page, /NISN/)
  assert.match(page, /Orang Tua/)
  assert.match(page, /Wali Kelas/)
})

test('endpoint rapor memvalidasi periode, jenis, dan akses siswa', () => {
  assert.match(server, /function validateRaporPeriod/)
  assert.match(server, /function canManageRaporStudent/)
  assert.match(server, /app\.get\('\/api\/rapor', authMiddleware[\s\S]*canReadRaporStudent/)
  assert.match(server, /app\.post\('\/api\/rapor\/generate', STAFF[\s\S]*canManageRaporRombel/)
  assert.match(server, /app\.put\('\/api\/rapor\/:id', STAFF[\s\S]*canManageRaporStudent/)
})

test('unique key rapor akademik menyertakan tenant', () => {
  assert.match(server, /CREATE UNIQUE INDEX IF NOT EXISTS idx_rapor_unique ON rapor\(tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis\)/)
  assert.match(server, /ON CONFLICT\(tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis\)/)
})

test('data pelengkap rapor divalidasi di backend', () => {
  assert.match(server, /tinggi_badan harus di antara 30 dan 250 cm/)
  assert.match(server, /berat_badan harus di antara 1 dan 300 kg/)
  assert.match(server, /tanggal_pembagian tidak valid/)
  assert.match(server, /Keputusan hanya dapat diisi pada rapor SAS/)
})
