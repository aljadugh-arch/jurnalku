// Kontrak tumpukan dialog: dialog turunan (edit/tambah/simpan) harus selalu
// DI ATAS popup detail yang membukanya. Aturannya: dialog turunan memakai
// createPortal + z-[130] (> popup detail z-[100], > Modal bersama z-[120]).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', 'src')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('RombelPage: modal tambah/edit rombel ber-portal di atas popup detail', () => {
  const s = read('pages/admin/RombelPage.tsx')
  // modal edit memakai createPortal, bukan <div> inline z-100
  assert.match(s, /showModal && createPortal\(/, 'modal edit harus createPortal')
  assert.match(s, /fixed inset-0 bg-black\/50 z-\[130\]/, 'modal edit harus z-[130]')
  // popup detail rombel tetap z-[100]
  assert.match(s, /selectedRombel && createPortal\(/, 'popup detail tetap ber-portal')
  // tidak boleh ada overlay dialog z-50/z-60 yang bisa tertimpa
  assert.doesNotMatch(s, /fixed inset-0[^"`]*z-(50|60)\b/, 'tak ada z-50/60 usang')
})

test('AbsensiSiswaPage: popup kamera ber-portal di atas modal QR', () => {
  const s = read('pages/admin/AbsensiSiswaPage.tsx')
  assert.match(s, /import \{ createPortal \} from 'react-dom'/, 'impor createPortal')
  assert.match(s, /qrOpen && createPortal\(/, 'popup kamera harus createPortal')
  assert.match(s, /fixed inset-0 z-\[130\] bg-black\/60/, 'popup kamera harus z-[130]')
})

test('EkskulPage: popup anggota z-100, modal edit z-130 (tidak terbalik)', () => {
  const s = read('pages/admin/EkskulPage.tsx')
  assert.match(s, /memberEkskul && \(\s*<div className="fixed inset-0 bg-black\/50 z-\[100\]/, 'popup anggota z-[100]')
  assert.match(s, /showModal && \(\s*<div className="fixed inset-0 bg-black\/50 z-\[130\]/, 'modal edit z-[130]')
})

test('BulkDeleteButton: dialog konfirmasi selalu di lapisan teratas', () => {
  const s = read('components/BulkDeleteButton.tsx')
  assert.match(s, /fixed inset-0 z-\[130\]/, 'konfirmasi hapus z-[130]')
})

test('Dialog bersama (Modal) tetap di bawah dialog turunan (z-120 < 130)', () => {
  const s = read('components/ui/Modal.tsx')
  assert.match(s, /fixed inset-0 z-\[120\]/, 'Modal z-[120]')
})
