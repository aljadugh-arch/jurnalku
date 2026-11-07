'use strict'
// Kontrak menu posting yang disederhanakan:
//   1. Tidak ada gambar duplikat — grid media tidak menampilkan ulang gambar
//      yang sudah tertanam inline di konten HTML.
//   2. Link disisipkan → otomatis ambil pratinjau (thumbnail og:image) lewat
//      endpoint /posting/link-preview yang SSRF-safe.
//   3. Upload gambar/video cukup drag-and-drop ke area editor.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = p => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('grid media tidak menampilkan ulang gambar yang sudah inline di konten', () => {
  for (const f of ['src/pages/admin/PostingPage.tsx', 'src/pages/siswa/SiswaPostingPage.tsx', 'src/pages/guru/GuruPostingPage.tsx']) {
    const s = baca(f)
    // filter duplikat: media yang URL-nya sudah ada di konten dilewati
    assert.match(s, /inlineUrls\.has\(m\.media_url \|\| m\.url\)/, `${f}: harus filter duplikat inline`)
    assert.match(s, /renderMedia\(post\.media \|\| \[\], post\.konten \|\| post\.isi \|\| ''\)/, `${f}: renderMedia harus menerima konten`)
  }
})

test('editor memanggil endpoint link-preview untuk pratinjau tautan', () => {
  const s = baca('src/components/RichEditor.tsx')
  assert.match(s, /api\.post\('\/posting\/link-preview'/, 'harus panggil /posting/link-preview')
  assert.match(s, /handlePaste/, 'deteksi URL saat paste harus ada')
  assert.match(s, /onDrop=/, 'drag-and-drop harus ada')
  assert.match(s, /handleFileUpload\(media/, 'drop harus memakai jalur upload yang ada')
})

test('server menyediakan endpoint link-preview SSRF-safe', () => {
  const srv = baca('server/index.cjs')
  assert.match(srv, /app\.post\('\/api\/posting\/link-preview', STAFF/, 'rute link-preview harus ada')
  assert.match(srv, /safeFetch\(url, \{/, 'harus memakai safeFetch (SSRF-safe)')
  assert.match(srv, /maxBytes: 2 \* 1024 \* 1024/, 'respons dibatasi ukurannya')
  assert.match(srv, /ekstrakMetaOpenGraph/, 'harus ada parser Open Graph')
})

test('safeFetch mendukung batas ukuran respons', () => {
  const g = baca('server/ssrf-guard.cjs')
  assert.match(g, /maxBytes = 0/, 'opsi maxBytes harus ada')
  assert.match(g, /Respons \$\{label\} melebihi batas/, 'harus memutus permintaan saat melebihi batas')
})
