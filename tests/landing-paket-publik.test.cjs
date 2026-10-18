'use strict'
// Kontrak landing page: HARGA TIDAK BOLEH DITULIS DI KODE.
//
// Alasan: admin platform mengubah harga & masa aktif lewat UI, tersimpan di
// tabel subscription_plans. Kalau landing page menuliskan angka sendiri,
// harga yang dilihat calon pendaftar bisa berbeda dari yang benar-benar
// ditagih — dan itu masalah kepercayaan, bukan sekadar tampilan.
//
// Yang dikunci:
//   1. Ada endpoint PUBLIK (tanpa login) yang mengembalikan paket aktif.
//   2. Endpoint itu membaca DB, bukan konstanta kode.
//   3. Landing page mengambil harga dari endpoint itu.
//   4. Landing page punya struktur yang diminta: hero, fitur, peran,
//      langkah, harga, FAQ, footer.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('ada endpoint publik paket tanpa authMiddleware', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.get('/api/publik/paket'")
  assert.ok(i > 0, "rute /api/publik/paket harus ada")
  const baris = s.slice(i, i + 120)
  assert.ok(!baris.includes('authMiddleware'), 'rute paket publik TIDAK boleh butuh login — landing page diakses tamu')
  // Harus membaca DB lewat getPlans, bukan konstanta
  const badan = s.slice(i, i + 1800)
  assert.ok(badan.includes('getPlans(db)'), 'paket harus dibaca dari DB (getPlans), bukan dari DEFAULT_PLANS')
  assert.ok(!badan.includes('DEFAULT_PLANS'), 'jangan pakai konstanta harga dari kode')
})

test('landing page mengambil harga dari API, bukan menuliskannya', () => {
  const s = baca('src/pages/LandingPage.tsx')
  assert.ok(s.includes("api.get('/publik/paket')"), 'harga harus diambil dari /api/publik/paket')

  // Tidak boleh ada angka rupiah hardcoded di landing page
  const rupiahHardcoded = s.match(/Rp\s?\d{2,3}\.\d{3}/g) || []
  assert.strictEqual(rupiahHardcoded.length, 0, `harga tidak boleh ditulis di kode: ${rupiahHardcoded.join(', ')}`)
})

test('landing page punya seksi yang diminta', () => {
  const s = baca('src/pages/LandingPage.tsx')
  for (const id of ['#fitur', '#peran', '#langkah', '#harga', '#faq']) {
    assert.ok(s.includes(id), `seksi ${id} harus ada`)
  }
  // Struktur konten dipisah ke array di atas file supaya mudah diubah
  for (const arr of ['const fiturUtama', 'const perPeran', 'const alasan', 'const langkah', 'const faq']) {
    assert.ok(s.includes(arr), `${arr} harus ada agar isi mudah diubah tanpa menyentuh JSX`)
  }
})

test('landing page menangani kegagalan API tanpa menampilkan angka palsu', () => {
  const s = baca('src/pages/LandingPage.tsx')
  assert.ok(/paketGagal/.test(s), 'harus ada status gagal')
  assert.ok(/sedang tidak dapat dimuat/.test(s), 'harus ada pesan saat paket gagal dimuat, bukan menampilkan harga karangan')
})

test('label fitur paket punya terjemahan manusiawi', () => {
  const s = baca('src/pages/LandingPage.tsx')
  assert.ok(/LABEL_FITUR/.test(s), 'kode fitur harus diterjemahkan ke label yang bisa dibaca')
  // Kode fitur inti harus punya label
  for (const k of ['master_data', 'absensi', 'keuangan', 'whatsapp', 'ujian']) {
    assert.ok(s.includes(k + ':'), `fitur ${k} harus punya label`)
  }
})
