// Penegakan kuota siswa/GTK per lembaga.
//
// Aturan: batas PAKET yang menang (Trial = 100 siswa / 20 GTK). Paket tanpa batas
// memakai angka per-lembaga; 0/NULL berarti tanpa batas. Implementasi tunggal di
// server/kuota.cjs agar semua pintu masuk (tambah, impor, PPDB, reaktivasi)
// memakai aturan yang sama.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const idx = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8')
const kuota = fs.readFileSync(path.join(__dirname, '../server/kuota.cjs'), 'utf8')
const ppdb = fs.readFileSync(path.join(__dirname, '../server/ppdb.cjs'), 'utf8')
const tenant = fs.readFileSync(path.join(__dirname, '../server/tenant.cjs'), 'utf8')

test('helper kuota: hitung siswa aktif & GTK, batas paket menang', () => {
  assert.match(idx, /require\('\.\/kuota\.cjs'\)\.kuotaTenant/, 'index memakai helper bersama')
  assert.match(kuota, /COALESCE\(status,'aktif'\)='aktif'/, 'hitung siswa AKTIF saja')
  assert.match(kuota, /SELECT COUNT\(\*\) c FROM gtk WHERE tenant_id=\?/, 'hitung gtk')
  assert.match(kuota, /paket && paket\.nilai && paket\.nilai > 0 \? paket\.nilai : perLembaga/, 'batas paket menang')
  assert.match(kuota, /batas > 0 \? batas - aktif : Infinity/, '0 = tanpa batas')
})

test('tambah siswa tunggal & impor memakai pesan kuota paket', () => {
  assert.match(idx, /const pesanSiswa = require\('\.\/kuota\.cjs'\)\.pesanKuota\(kuotaSiswa, 'siswa', 1\)/)
  assert.match(idx, /const pesanImpor = require\('\.\/kuota\.cjs'\)\.pesanKuota\(kuota, 'siswa', students\.length\)/)
  assert.match(idx, /if \(pesanSiswa\) return res\.status\(403\)/)
  assert.match(idx, /if \(pesanImpor\) return res\.status\(403\)/)
})

test('GTK juga memakai helper yang sama', () => {
  assert.match(idx, /const pesanGtk = require\('\.\/kuota\.cjs'\)\.pesanKuota\(kuotaGtk, 'gtk', 1\)/)
})

test('PPDB, reaktivasi, dan impor antar-lembaga ikut dicek', () => {
  assert.match(ppdb, /kuota\.pesanKuota\(kuota\.kuotaTenant\(db, tenantId, 'siswa'\)/, 'PPDB dicek')
  assert.match(idx, /values\.status === 'aktif' && current\.status !== 'aktif'/, 'reaktivasi dicek')
  assert.match(tenant, /kuota\.kuotaTenant\(db, target, 'siswa'\)/, 'impor antar-lembaga dicek')
})

test('pesan menyebut paket dan ajakan upgrade untuk Trial', () => {
  assert.match(kuota, /aktifkan paket Lite\/Pro\/Premium untuk menambah/, 'ajakan upgrade')
})
