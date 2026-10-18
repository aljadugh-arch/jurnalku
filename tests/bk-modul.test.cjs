'use strict'
// Kontrak modul Bimbingan Konseling (BK).
//
// Diadopsi dari fitur yang JURNALKU belum punya, ditemukan saat membandingkan
// dengan appso.id ("Bimbingan Konseling: catatan konseling, tracking
// pelanggaran, early warning, privacy-aware") dan sidigs.com (presensi +
// notifikasi, CBT, AI generate soal).
//
// Yang WAJIB dikunci di sini:
//   1. BK TERPISAH dari catatan_kepribadian — yang itu masuk rapor dan dibaca
//      wali murid. Isi konseling tidak boleh bocor ke sana.
//   2. Early warning punya ambang yang bisa diubah admin (bukan hardcoded di UI).
//   3. Poin pelanggaran punya nilai bawaan per tingkat, tapi bisa ditimpa manual.
//   4. Semua query dibatasi tenant_id (multi-tenant).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('tabel BK terpisah dari catatan_kepribadian', () => {
  const s = baca('server/bk.cjs')
  assert.ok(/CREATE TABLE IF NOT EXISTS bk_sesi/.test(s), 'tabel bk_sesi harus ada')
  assert.ok(/CREATE TABLE IF NOT EXISTS bk_pelanggaran/.test(s), 'tabel bk_pelanggaran harus ada')
  // Tidak boleh menulis ke catatan_kepribadian — itu jalur rapor.
  assert.ok(!/INSERT INTO catatan_kepribadian/.test(s), 'BK tidak boleh menulis ke catatan_kepribadian')
  assert.ok(!/UPDATE catatan_kepribadian/.test(s), 'BK tidak boleh mengubah catatan_kepribadian')
})

test('semua query BK dibatasi tenant', () => {
  const s = baca('server/bk.cjs')
  // Setiap SELECT/INSERT/UPDATE/DELETE ke tabel bk harus menyebut tenant_id
  const blok = s.slice(s.indexOf('function daftarkanRuteBk'))
  const jumlahTenant = [...blok.matchAll(/tenant_id\s*=\s*\?/g)].length
  assert.ok(jumlahTenant >= 10, `setiap operasi harus memfilter tenant_id, ditemukan ${jumlahTenant}`)
})

test('early warning memakai ambang yang bisa diubah admin', () => {
  const s = baca('server/bk.cjs')
  assert.ok(/app_config/.test(s), 'ambang harus dibaca dari app_config agar bisa diubah tanpa deploy')
  assert.ok(/bk_ambang_poin/.test(s), 'kunci app_config harus jelas')
  assert.ok(/statusPeringatan/.test(s), 'harus ada fungsi penentu status')
})

test('poin pelanggaran punya nilai bawaan per tingkat', () => {
  const s = baca('server/bk.cjs')
  assert.ok(/POIN_DEFAULT\s*=\s*\{\s*ringan:\s*5,\s*sedang:\s*15,\s*berat:\s*40\s*\}/.test(s),
    'poin bawaan ringan/sedang/berat harus jelas')
})

test('rute BK terdaftar di server dan halaman ada di aplikasi', () => {
  const idx = baca('server/index.cjs')
  assert.ok(/daftarkanRuteBk\(app/.test(idx), 'rute BK harus didaftarkan di index.cjs')
  assert.ok(/app\.get\('\/api\/bk\/ringkasan'/.test(baca('server/bk.cjs')), 'endpoint ringkasan harus ada')

  const app = baca('src/App.tsx')
  assert.ok(/path="bk"/.test(app), 'route /admin/bk harus ada')
  assert.ok(/BkPage/.test(app), 'halaman BK harus diimpor')

  const menu = baca('src/lib/menuItems.tsx')
  assert.ok(/Bimbingan Konseling/.test(menu), 'menu Bimbingan Konseling harus ada')
})

test('isi konseling yang ditandai privat tidak dikirim ke guru biasa', () => {
  const s = baca('server/bk.cjs')
  // Guru non-admin/kepala hanya menerima ringkasan bila rahasia=0
  assert.ok(/CASE WHEN rahasia=0 THEN ringkasan ELSE '' END/.test(s),
    'ringkasan privat harus disaring di SQL, bukan disembunyikan di UI saja')
  assert.ok(/CASE WHEN rahasia=0 THEN tindak_lanjut ELSE '' END/.test(s),
    'tindak lanjut privat juga harus disaring')
})
