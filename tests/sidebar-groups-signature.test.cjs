const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const sidebar = read('src/components/layout/Sidebar.tsx')
const sig = read('src/utils/pdfSignature.ts')
const rekap = read('src/pages/admin/RekapAbsensiPage.tsx')
const jurnal = read('src/pages/admin/JurnalPage.tsx')

// Ekstrak & jalankan signatureBlockHtml: buang anotasi tipe TS sederhana.
function loadSignatureBlock() {
  const src = sig
    .replace(/^export type[\s\S]*?\n\n/gm, '')
    .replace(/export type [\s\S]*?\n}\n/g, '')
    .replace(/^export /gm, '')
    .replace(/const SIGNATURE_CSS = `[\s\S]*?`\n/, 'const SIGNATURE_CSS = ""\n')
    // buang anotasi tipe pada parameter & variabel (pola ': Type' / ': Type =')
    .replace(/(\w)\s*:\s*(SignatureSettings|SignatureOptions|Date|string|unknown)\s*(=[^,)]*)?/g, '$1 $2')
    .replace(/(\w)\s*:\s*(SignatureSettings|SignatureOptions|Date|string|unknown)\b/g, '$1')
    .replace(/\)\s*:\s*string\s*\{/g, ') {')
    .replace(/export function signatureBlockHtml/g, 'function signatureBlockHtml')
  return new Function(src + '; return { signatureBlockHtml, tenantSignatureSettings }')()
}

test('sidebar desktop: pengelompokan berlaku utk SEMUA role manajemen (kepala/bendahara/demo)', () => {
  assert.match(sidebar, /managementRoles/, 'daftar role manajemen')
  for (const r of ['kepala', 'bendahara', 'admin', 'operator']) assert.ok(sidebar.includes(`'${r}'`), `role ${r} masuk daftar`)
  assert.match(sidebar, /const showGrouping = isManagementRole && isOpen/, 'grouping pakai isManagementRole')
  assert.doesNotMatch(sidebar, /isAdminRole/, 'pola lama (admin-only) sudah tidak dipakai')
})

test('grup sidebar mencakup menu kepala & bendahara (tidak ada yang tercecer)', () => {
  for (const label of ['Supervisi', 'Administrasi Surat', 'Jurnal Mengajar', 'Rapor Siswa', 'Erkam', 'Buku Kas', 'Bendahara', 'Manajemen Yayasan', 'Kartu RFID', 'Beasiswa']) {
    assert.ok(sidebar.includes(`'${label}'`), `label "${label}" ada di grup`)
  }
})

test('helper TTD: blok dua kolom + nama kepala & penandatangan kiri', () => {
  assert.match(sig, /export function signatureBlockHtml/, 'fungsi signatureBlockHtml')
  assert.match(sig, /export const SIGNATURE_CSS/, 'CSS TTD')
  assert.match(sig, /kepala_sekolah/, 'membaca kepala_sekolah')
  assert.match(sig, /kota_cetak/, 'membaca kota_cetak')
  assert.match(sig, /Mengetahui,/, 'label Mengetahui')
  // Struktur blok: dua kolom (ttd-row/ttd-col), tempat+tanggal, garis nama.
  assert.match(sig, /class="ttd-row"/, 'baris dua kolom')
  assert.match(sig, /class="ttd-col"/, 'kolom TTD')
  assert.match(sig, /ttd-name/, 'garis nama')
  assert.match(sig, /\.ttd-wrap\{/, 'CSS .ttd-wrap')
  assert.match(sig, /page-break-inside:avoid/, 'jangan terpotong antar-halaman')
  // Nama kiri & kanan diambil dari var yang benar
  assert.match(sig, /const kepala = String\(settings\.kepala_sekolah/, 'kepala dari settings')
  assert.match(sig, /opts\.leftName/, 'nama kiri dari opts')
})

test('RekapAbsensi: PDF menyertakan blok TTD (kedua layout)', () => {
  assert.match(rekap, /signatureBlockHtml\(sigSettings, sigOpts\)/, 'matriks menyertakan TTD')
  assert.match(rekap, /SIGNATURE_CSS/, 'CSS TTD disisipkan')
  assert.match(rekap, /Wali Kelas/, 'label wali kelas bila filter rombel')
})

test('Jurnal: PDF menyertakan kop + blok TTD guru mapel & kepala', () => {
  assert.match(jurnal, /signatureBlockHtml\(sigSettings, \{ leftTitle: 'Guru Mapel', rightTitle: 'Kepala Madrasah' \}\)/, 'blok TTD jurnal')
  assert.match(jurnal, /JURNAL KEGIATAN PEMBELAJARAN/, 'judul dokumen')
  assert.match(jurnal, /tenantIdentity\(settings\)/, 'kop memakai identitas tenant')
})
