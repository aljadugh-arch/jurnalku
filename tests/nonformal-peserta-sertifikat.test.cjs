// Modul nonformal lanjutan: peserta (enrollment) + absensi potong kuota
// pertemuan + e-sertifikat. Menumpang di fitur `program_belajar` (nonformal),
// bukan fitur baru — menu & route-nya digerbang jenjang nonformal + paket.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('tabel peserta & absensi program ada', () => {
  const pb = baca('server/program-belajar.cjs')
  assert.match(pb, /CREATE TABLE IF NOT EXISTS program_peserta/, 'tabel peserta')
  assert.match(pb, /CREATE TABLE IF NOT EXISTS program_absensi/, 'tabel absensi')
  assert.match(pb, /kuota_pertemuan INTEGER NOT NULL DEFAULT 0/, 'kuota pertemuan')
  assert.match(pb, /terpakai INTEGER NOT NULL DEFAULT 0/, 'penghitung terpakai')
})

test('route peserta & absensi terdaftar (gated nonformal)', () => {
  const r = baca('server/program-belajar-routes.cjs')
  for (const p of ['/api/program-peserta', '/api/program-absensi']) {
    assert.match(r, new RegExp(`app\\.(get|post|put|delete)\\(['"\`]${p}`), `route ${p}`)
  }
  assert.match(r, /nomorSertifikat = \(\) => `SERT-/, 'nomor sertifikat otomatis')
  assert.match(r, /terpakai = p\.terpakai \+ 1/, 'absensi hadir menambah terpakai')
  assert.match(r, /terpakai >= p\.kuota_pertemuan/, 'kuota habis -> selesai')
})

test('prefix paket mencakup route baru (program_belajar)', () => {
  const sub = baca('server/subscription.cjs')
  assert.match(sub, /program_belajar: \['\/api\/program-belajar', '\/api\/program-level', '\/api\/program-peserta', '\/api\/program-absensi'\]/, 'prefix program_belajar')
})

test('menu & gerbang FE peserta/sertifikat', () => {
  const menu = baca('src/lib/menuItems.tsx')
  assert.match(menu, /label: 'Peserta & Sertifikat'/, 'menu peserta')
  assert.match(menu, /path: '\/admin\/program-peserta'/, 'path menu peserta')
  const fa = baca('src/lib/featureAccess.ts')
  assert.match(fa, /\['program_belajar', \['\/admin\/program-belajar', '\/admin\/program-peserta'\]\]/, 'gerbang FE')
  const app = baca('src/App.tsx')
  assert.match(app, /ProgramPesertaPage = lazy/, 'lazy import')
  assert.match(app, /path="program-peserta"/, 'route')
})
