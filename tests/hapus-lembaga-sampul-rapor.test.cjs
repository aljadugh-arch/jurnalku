'use strict'
// Kontrak: hapus lembaga (superadmin) + sampul rapor/buku induk.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const tenant = baca('server/tenant.cjs')
const ui = baca('src/pages/admin/TenantManagementPage.tsx')

// ---------- HAPUS LEMBAGA ----------

test('hapus lembaga WAJIB konfirmasi slug', () => {
  const i = tenant.indexOf("app.delete('/api/tenants/:id'")
  const blok = tenant.slice(i, i + 4000)
  assert.ok(blok.includes('konfirmasi_slug'), 'harus menerima konfirmasi_slug')
  assert.ok(blok.includes('KONFIRMASI_SLUG'), 'harus mengembalikan kode penolakan')
  assert.ok(/!== tenant\.slug/.test(blok), 'slug harus dibandingkan persis')
})

test('hapus lembaga membersihkan SEMUA tabel ber-tenant_id, bukan daftar hardcode', () => {
  const i = tenant.indexOf("app.delete('/api/tenants/:id'")
  const blok = tenant.slice(i, i + 4000)
  // Versi lama memakai array 26 nama tabel; 94 tabel bertenant tertinggal.
  assert.ok(blok.includes('sqlite_master'), 'daftar tabel harus diturunkan dari skema')
  assert.ok(blok.includes('PRAGMA table_info'), 'harus memeriksa kolom tenant_id')
  assert.ok(blok.includes('db.transaction'), 'penghapusan harus dalam satu transaksi')
  assert.ok(!/'absensi_ekskul', 'absensi_siswa'/.test(blok), 'tidak boleh kembali ke daftar hardcode')
})

test('hapus lembaga melaporkan jumlah baris dan kegagalan', () => {
  const i = tenant.indexOf("app.delete('/api/tenants/:id'")
  const blok = tenant.slice(i, i + 4000)
  assert.ok(blok.includes('baris_dihapus'), 'harus melaporkan jumlah baris')
  assert.ok(blok.includes('tabel_dibersihkan'), 'harus melaporkan jumlah tabel')
  assert.ok(blok.includes('gagal'), 'kegagalan per tabel harus terlihat, bukan ditelan')
})

test('tenant default tidak bisa dihapus', () => {
  const i = tenant.indexOf("app.delete('/api/tenants/:id'")
  const blok = tenant.slice(i, i + 4000)
  assert.ok(blok.includes("=== 'default'"), 'tenant default harus dilindungi')
})

test('UI hapus: menu, modal konfirmasi, dan tombol nonaktif sampai slug cocok', () => {
  assert.ok(ui.includes('Hapus Lembaga'), 'menu harus ada')
  assert.ok(ui.includes('hapusLembaga'), 'harus ada fungsi hapus')
  assert.ok(ui.includes('konfirmasi_slug'), 'harus mengirim konfirmasi_slug')
  assert.ok(ui.includes('Tindakan ini tidak bisa dibatalkan'), 'harus memperingatkan')
  assert.ok(/konfirmasi\.trim\(\) !== hapus\.slug/.test(ui), 'tombol harus terkunci sampai slug cocok')
})

// ---------- SAMPUL RAPOR & BUKU INDUK ----------

const rapor = baca('server/rapor-mtsplus-pdf-service.cjs')
const buku = baca('server/buku-induk-pdf-service.cjs')

test('sampul rapor mengikuti proporsi dokumen resmi', () => {
  // Proporsi diambil dari IDENTITAS RAPOR.docx: RAPOR 24.6%, madrasah 31.6%,
  // nama lembaga 35.7%, NSM/NPSN 47.7%, kotak nama 71.4%.
  assert.ok(/H \* 0\.246/.test(rapor), 'judul RAPOR di 24.6% tinggi halaman')
  assert.ok(/H \* 0\.316/.test(rapor), 'baris madrasah di 31.6%')
  assert.ok(/H \* 0\.357/.test(rapor), 'nama lembaga di 35.7%')
  assert.ok(/H \* 0\.477/.test(rapor), 'NSM/NPSN di 47.7%')
  assert.ok(/H \* 0\.714/.test(rapor), 'kotak nama di 71.4%')
})

test('sampul rapor mencetak RAPOR, bukan RAPOR PESERTA DIDIK', () => {
  assert.ok(rapor.includes("'R A P O R'"), 'judul harus RAPOR berjarak')
  assert.ok(!rapor.includes("'RAPOR PESERTA DIDIK'"), 'judul lama harus hilang')
})

test('sampul buku induk memakai proporsi yang sama', () => {
  assert.ok(/H \* 0\.246/.test(buku), 'judul di 24.6%')
  assert.ok(/H \* 0\.357/.test(buku), 'nama lembaga di 35.7%')
  assert.ok(/H \* 0\.477/.test(buku), 'NSM/NPSN di 47.7%')
  assert.ok(buku.includes("'BUKU INDUK'"), 'judul buku induk')
})

test('kedua sampul mencetak logo, NSM/NPSN, instansi, dan alamat', () => {
  for (const [nama, isi] of [['rapor', rapor], ['buku induk', buku]]) {
    assert.ok(isi.includes('kemenagPath'), `${nama}: logo instansi`)
    assert.ok(isi.includes('lembagaLogoPath'), `${nama}: logo lembaga`)
    assert.ok(isi.includes('NSM:'), `${nama}: NSM`)
    assert.ok(isi.includes('NPSN:'), `${nama}: NPSN`)
    assert.ok(isi.includes('nama_instansi'), `${nama}: nama instansi`)
    assert.ok(isi.includes('settings.alamat'), `${nama}: alamat`)
  }
})
