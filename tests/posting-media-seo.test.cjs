'use strict'
// Kontrak: gambar posting harus benar-benar TAMPIL, dan setiap domain harus
// menyajikan SEO miliknya sendiri (bukan enam halaman duplikat).
//
// Bug asal (dilaporkan user "posting masih belum menampilkan foto"):
//   1. src/index.css punya `.posting-content img { display: none !important }`
//      -> gambar berhasil diunggah dan ada di HTML, tetapi disembunyikan CSS.
//   2. renderMedia membaca `m.type`/`m.url`, padahal data tersimpan memakai
//      `media_type`/`media_url` -> grid media selalu kosong.
//   3. `media` hanya terisi dari event onUpdate TipTap, jadi bisa tersimpan '[]'
//      padahal konten berisi <img>. Sekarang server menurunkannya dari konten.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('CSS tidak lagi menyembunyikan gambar posting', () => {
  const css = baca('src/index.css')
  // Aturan lama: display:none !important pada .posting-content img
  const blok = css.match(/\.posting-content img[^{]*\{[^}]*\}/g) || []
  assert.ok(blok.length > 0, '.posting-content img harus punya aturan CSS')
  for (const b of blok) {
    assert.ok(!/display\s*:\s*none/i.test(b), `gambar posting tidak boleh disembunyikan: ${b}`)
  }
  // dan harus dibatasi lebarnya supaya tidak tampil raksasa
  assert.ok(/max-width\s*:\s*100%/i.test(css), 'gambar posting butuh max-width:100%')
})

test('renderMedia memakai media_type/media_url (struktur data nyata)', () => {
  for (const f of ['src/pages/admin/PostingPage.tsx', 'src/pages/siswa/SiswaPostingPage.tsx', 'src/pages/guru/GuruPostingPage.tsx']) {
    const s = baca(f)
    assert.ok(/m\.media_type\s*\|\|\s*m\.type/.test(s), `${f}: harus menerima media_type maupun type`)
    assert.ok(/m\.media_url\s*\|\|\s*m\.url/.test(s), `${f}: harus menerima media_url maupun url`)
  }
})

test('server menurunkan media dari HTML konten (satu sumber kebenaran)', () => {
  const s = baca('server/index.cjs')
  assert.ok(/const mediaDariKonten = \(konten\) =>/.test(s), 'helper mediaDariKonten harus ada')
  // Dipakai di POST dan PUT
  const pakai = s.match(/mediaDariKonten\(safeKonten\)/g) || []
  assert.ok(pakai.length >= 2, `mediaDariKonten harus dipakai di POST dan PUT, ditemukan ${pakai.length}`)
})

test('helper mediaDariKonten mengekstrak img & video /uploads', () => {
  const s = baca('server/index.cjs')
  const mulai = s.indexOf('const mediaDariKonten = (konten) =>')
  const akhir = s.indexOf('const savePostingUpload', mulai)
  const badan = s.slice(mulai, akhir)
  const fn = new Function(`${badan}; return mediaDariKonten`)()
  const hasil = fn('<p>halo</p><img src="/uploads/a.webp"><video src="/uploads/b.mp4"></video><img src="https://luar.com/x.png"><img src="/uploads/a.webp">')
  assert.strictEqual(hasil.length, 2, 'duplikat & URL luar harus dibuang')
  assert.deepStrictEqual(hasil[0], { media_url: '/uploads/a.webp', media_type: 'image', filename: 'a.webp' })
  assert.deepStrictEqual(hasil[1], { media_url: '/uploads/b.mp4', media_type: 'video', filename: 'b.mp4' })
})

test('SEO: tenant publik diresolusi dari host, bukan dari sesi', () => {
  const s = baca('server/index.cjs')
  assert.ok(/const tenantDariHost = \(host\) =>/.test(s), 'tenantDariHost harus ada')
  // renderIndexSeo harus memakainya saat req.tenantId kosong
  const r = s.indexOf('function renderIndexSeo(req)')
  const badan = s.slice(r, r + 800)
  assert.ok(/tenantDariHost\(hostPermintaan\(req\)\)/.test(badan), 'renderIndexSeo harus meresolusi tenant dari host')
})

test('SEO: judul & deskripsi berbeda per halaman', () => {
  const s = baca('server/index.cjs')
  const r = s.indexOf('function renderIndexSeo(req)')
  const badan = s.slice(r, r + 6000)
  for (const rute of ["'/panduan'", "'/ppdb'", "'/login'", "'/register'"]) {
    assert.ok(badan.includes(rute), `meta khusus untuk ${rute} harus ada`)
  }
  // canonical harus mengikuti path, bukan selalu root (canonicalBase untuk platform)
  assert.ok(badan.includes('escHtml(canonicalBase + path)'), 'canonical & og:url harus memakai path')
})

test('SEO: sitemap memuat posting publik per tenant', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.get('/sitemap.xml'")
  assert.ok(i > 0, 'rute sitemap harus ada')
  // Potong badan route SAMPAI penutupnya, bukan sejumlah karakter tetap.
  // Jendela tetap (1600 char) rapuh: begitu route menambah logika lain,
  // tes gagal padahal sitemap masih memuat posting.
  const akhir = s.indexOf("res.type('application/xml')", i)
  assert.ok(akhir > i, 'harus ketemu pengiriman XML')
  const badan = s.slice(i, akhir)
  assert.ok(/FROM posting WHERE tenant_id=\?/.test(badan), 'sitemap harus menyertakan posting tenant')
  assert.ok(/\/posting\//.test(badan), 'sitemap harus memuat URL posting')
})

test('SEO: HTML punya konten untuk crawler di dalam #root', () => {
  const s = baca('server/index.cjs')
  const r = s.indexOf('function renderIndexSeo(req)')
  const badan = s.slice(r, r + 9000)
  // Konten crawler didefinisikan sebagai `isiCrawler` berisi <div id="root">.
  // Jangan terikat offset karakter — panjang teks fitur bisa berubah.
  const defIsi = s.slice(s.indexOf('const isiCrawler'), s.indexOf('const isiCrawler') + 300)
  assert.ok(/id="root"><div/.test(defIsi) || /isiCrawler/.test(badan), 'harus ada konten crawler di #root')
  assert.ok(/<h1>/.test(badan), 'konten crawler harus punya h1')
})

test('halaman posting publik punya rute HTML nyata (URL sitemap tidak 404)', () => {
  const srv = baca('server/index.cjs')
  // Rute halaman harus ada
  assert.match(srv, /app\.get\('\/posting\/:id'/)
  // dan tidak boleh ditelan SPA fallback
  const i = srv.indexOf('// SPA fallback')
  assert.ok(i > 0, 'SPA fallback harus ada')
  assert.ok(/\^\\\/posting\\\/.+test\(req\.path\)/.test(srv.slice(i, i + 600)) || srv.slice(i, i + 600).includes('/posting/'), 'SPA fallback harus melewatkan /posting/:id')
  // endpoint JSON publik juga ada
  assert.match(srv, /app\.get\('\/api\/publik\/posting\/:id'/)
})

test('halaman posting publik menyajikan meta SEO lengkap', () => {
  const srv = baca('server/index.cjs')
  const i = srv.indexOf("app.get('/posting/:id'")
  const badan = srv.slice(i, i + 3000)
  for (const tag of ['<title>', 'name="description"', 'rel="canonical"', 'og:title', 'application/ld+json', 'NewsArticle']) {
    assert.ok(badan.includes(tag), `halaman posting harus punya ${tag}`)
  }
})
