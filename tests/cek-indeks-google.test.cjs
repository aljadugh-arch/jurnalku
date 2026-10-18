'use strict'
// Kontrak: pelacak indeks harus (a) menyimpan hasil ke DB supaya bisa
// dibandingkan antar run, (b) membaca URL dari sitemap yang benar-benar
// disubmit (bukan daftar hardcoded yang bisa basi), dan (c) melaporkan
// PERUBAHAN, bukan cuma status sekali lihat.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('pelacak indeks menyimpan riwayat ke tabel index_status', () => {
  const s = baca('scripts/cek-indeks.cjs')
  assert.ok(/CREATE TABLE IF NOT EXISTS index_status/.test(s), 'tabel harus dibuat idempoten')
  assert.ok(/PRIMARY KEY \(url, checked_at\)/.test(s), 'kunci utama harus (url, checked_at) agar tiap run tersimpan terpisah')
  assert.ok(/INSERT INTO index_status/.test(s), 'harus menyimpan hasil per run')
})

test('pelacak membaca URL dari sitemap, bukan daftar hardcoded', () => {
  const s = baca('scripts/cek-indeks.cjs')
  assert.ok(/ambilSitemap/.test(s), 'harus mengambil sitemap')
  assert.ok(/<loc>/.test(s), 'harus mem-parse <loc> dari XML')
  // URL yang diperiksa harus berasal dari hasil ambilSitemap
  assert.ok(/const urls = await ambilSitemap\(d\)/.test(s), 'daftar URL harus dari sitemap')
})

test('pelacak melaporkan perubahan antar run', () => {
  const s = baca('scripts/cek-indeks.cjs')
  assert.ok(/petaLama/.test(s), 'harus memuat hasil run sebelumnya')
  assert.ok(/naik jadi terindeks/.test(s), 'harus melaporkan yang baru terindeks')
  assert.ok(/turun dari terindeks/.test(s), 'harus melaporkan yang turun')
})

test('pelacak memakai URL Inspection API dan menangani kegagalan per URL', () => {
  const s = baca('scripts/cek-indeks.cjs')
  assert.ok(/urlInspection\/index:inspect/.test(s), 'harus memakai URL Inspection API')
  // Kegagalan satu URL tidak boleh menghentikan seluruh pemeriksaan
  assert.ok(/verdict: 'ERROR'/.test(s), 'kegagalan per URL harus dicatat, bukan melempar')
})

test('wrapper harian ada dan cron memanggilnya', () => {
  // Wrapper dibuat di VPS, bukan di repo; yang dikunci di repo adalah skripnya
  // harus bisa dijalankan tanpa argumen (mode ringkas untuk cron).
  const s = baca('scripts/cek-indeks.cjs')
  assert.ok(/--ringkas/.test(s), 'harus mendukung --ringkas untuk dipanggil cron')
  assert.ok(/--domain/.test(s), 'harus mendukung --domain untuk pemeriksaan terbatas')
})
