'use strict'
// Kontrak UI/ekspor: footer tengah, logo default = favicon default,
// Excel jurnal & rekap absensi memuat kop + tanda tangan.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('footer publik memakai alignment tengah', () => {
  const css = baca('src/styles/sisfo.css')
  const blok = css.slice(css.indexOf('.sk-footer-inner'), css.indexOf('.sk-footer-links'))
  assert.match(blok, /flex-direction:\s*column/, 'footer menumpuk vertikal')
  assert.match(blok, /align-items:\s*center/, 'item footer di tengah')
  assert.match(blok, /justify-content:\s*center/, 'konten footer di tengah')
  assert.match(blok, /text-align:\s*center/, 'teks footer di tengah')
})

test('logo default mengikuti favicon default', () => {
  const brand = baca('src/lib/brandAsset.ts')
  assert.match(brand, /DEFAULT_LOGO_LIGHT = '\/favicon-light\.png'/)
  assert.match(brand, /DEFAULT_LOGO_DARK = '\/favicon-dark\.png'/)
  ;['src/pages/auth/LoginPage.tsx', 'src/pages/auth/ForgotPasswordPage.tsx',
    'src/pages/auth/RegisterPage.tsx', 'src/components/layout/Sidebar.tsx',
    'src/pages/HelpdeskPage.tsx', 'src/pages/admin/SettingsPage.tsx'].forEach(f => {
    assert.match(baca(f), /defaultLogo\(/, `\${f} harus memakai defaultLogo()`)
  })
  // tidak boleh ada lagi fallback hardcoded ke logo lama (selain komentar brandAsset)
  const sisa = ['src/pages/auth/LoginPage.tsx', 'src/components/layout/Sidebar.tsx', 'index.html']
    .filter(f => baca(f).includes('logo-jurnalku-256'))
  assert.deepEqual(sisa, [], 'fallback logo lama harus habis: ' + sisa.join(', '))
})

test('Excel jurnal per rombel memuat kop lembaga + tanda tangan kepala', () => {
  const util = baca('src/utils/pdfSignature.ts')
  assert.match(util, /export function excelKopRows/)
  assert.match(util, /export function excelSignatureRows/)
  const jurnal = baca('src/pages/admin/JurnalPage.tsx')
  assert.match(jurnal, /excelKopRows\(/, 'jurnal memakai kop excel')
  assert.match(jurnal, /excelSignatureRows\(/, 'jurnal memakai ttd excel')
  assert.match(jurnal, /rightTitle: t\.kepala/, 'jabatan kepala mengikuti tipe institusi')
  assert.match(jurnal, /JURNAL KEGIATAN PEMBELAJARAN/, 'judul kop jurnal')
})

test('rekap absensi (termasuk mapel) memuat tanda tangan di Excel', () => {
  const rekap = baca('src/pages/admin/RekapAbsensiPage.tsx')
  assert.match(rekap, /excelSignatureRows\(sigSettings, sigOpts\)/, 'ttd excel rekap')
  assert.match(rekap, /mapel: t\.mapel/, 'kategori mapel mengikuti terminologi')
  assert.match(rekap, /REKAPITULASI ABSENSI ' \+ \(isSiswa \? t\.siswa/, 'judul memakai sebutan tipe')
})
