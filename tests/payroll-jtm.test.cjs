'use strict'
// Kontrak payroll & JTM.
//
// Empat keputusan yang menentukan modul ini benar atau tidak:
//
//  1. JTM dari JURNAL MENGAJAR, bukan dari jadwal. Jadwal itu rencana; jurnal
//     itu bukti guru benar-benar masuk kelas. Bayar dari jadwal = bayar
//     pertemuan yang tak pernah terjadi.
//  2. Jam SUBSTITUSI masuk JTM guru PENGGANTI. Kalau tidak, guru yang menutup
//     kelas orang lain tidak dibayar.
//  3. SLIP = SNAPSHOT. Angka dibekukan saat periode dibuat. Kalau dihitung
//     ulang saat dibaca, slip bulan lalu berubah ketika ada koreksi jurnal.
//  4. users.id BUKAN gtk.id — relasinya lewat users.gtk_id.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const s = baca('server/payroll.cjs')

test('tabel komponen, periode, dan slip ada', () => {
  assert.ok(/CREATE TABLE IF NOT EXISTS payroll_komponen/.test(s))
  assert.ok(/CREATE TABLE IF NOT EXISTS payroll_periode/.test(s))
  assert.ok(/CREATE TABLE IF NOT EXISTS payroll_slip/.test(s))
})

test('JTM dihitung dari jurnal mengajar, bukan dari jadwal', () => {
  const i = s.indexOf('const hitungJtm')
  const badan = s.slice(i, i + 2200)
  assert.ok(/FROM jurnal_mengajar/.test(badan), 'JTM harus membaca jurnal_mengajar')
  assert.ok(/guru_id=\?/.test(badan))
})

test('jam substitusi ikut dihitung untuk guru pengganti', () => {
  const i = s.indexOf('const hitungJtm')
  const badan = s.slice(i, i + 2200)
  assert.ok(/FROM substitusi_guru/.test(badan),
    'tanpa ini, guru yang menggantikan tidak dibayar untuk jam yang ia ajar')
  assert.ok(/gtk_pengganti_id=\?/.test(badan))
})

test('slip adalah snapshot, bukan hitungan ulang saat dibaca', () => {
  assert.ok(/INSERT INTO payroll_slip/.test(s), 'nilai harus disimpan saat periode dibuat')
  const i = s.indexOf("app.get('/api/payroll/periode/:id/slip'")
  const badan = s.slice(i, i + 500)
  assert.ok(/SELECT \* FROM payroll_slip/.test(badan),
    'membaca slip harus SELECT tersimpan, bukan menghitung ulang')
})

test('satu slip per guru per periode (unique index)', () => {
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_slip_unik/.test(s))
})

test('satu periode per bulan (unique index)', () => {
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_periode_unik/.test(s))
})

test('periode final tidak bisa dihapus', () => {
  const i = s.indexOf("app.delete('/api/payroll/periode/:id'")
  const badan = s.slice(i, i + 600)
  assert.ok(/status === 'final'/.test(badan), 'slip yang sudah dibayar adalah bukti, jangan bisa dihapus')
})

test('slip-saya memakai users.gtk_id, bukan users.id', () => {
  const i = s.indexOf("app.get('/api/payroll/slip-saya'")
  const badan = s.slice(i, i + 800)
  assert.ok(/SELECT gtk_id FROM users WHERE id=\?/.test(badan),
    'users.id bukan gtk.id — memakai req.user.id langsung akan selalu kosong')
  assert.ok(!/gtk_id=\?`\)\.all\(req\.tenantId, req\.user\.id\)/.test(badan),
    'jangan pakai req.user.id sebagai gtk_id')
})

test('potongan kehadiran memakai data absensi nyata', () => {
  assert.ok(/FROM absensi_guru/.test(s) && /tanpa_masuk/.test(s))
})

test('rute, halaman, dan menu terdaftar', () => {
  assert.ok(/daftarkanRutePayroll\(app/.test(baca('server/index.cjs')))
  assert.ok(/path="payroll"/.test(baca('src/App.tsx')))
  assert.ok(/Payroll & JTM/.test(baca('src/lib/menuItems.tsx')))
})

test('halaman dengan tabel dibungkus overflow-x-auto', () => {
  const h = baca('src/pages/admin/PayrollPage.tsx')
  if (h.includes('<table')) assert.ok(/overflow-x-auto/.test(h))
})
