# SEO Playbook — Teknis, Isi, dan Operasional

Dokumen ini adalah prosedur lengkap yang dipakai di Jurnalku dan bisa diterapkan ulang ke
proyek lain (SPA, SSR, multi-tenant, situs statis). Urutannya sengaja: **bisa dirayapi →
layak diindeks → mudah dipahami mesin → terpantau → dirawat**.

---

## 0. Ringkasan cepat (TL;DR)

1. Pastikan HTML awal sudah berisi konten nyata (SSR atau prerender), bukan `<div id="root"></div>`.
2. `robots.txt` boleh, tapi jangan pernah memblokir aset render (JS/CSS) atau halaman yang mau diindeks.
3. `sitemap.xml` dinamis, hanya URL kanonik, `lastmod` jujur, maksimal 50.000 URL per berkas.
4. Satu URL = satu kanonis. Pasang `<link rel="canonical">` absolut.
5. Judul + deskripsi unik per halaman; jangan template yang sama untuk ratusan halaman.
6. Structured data (`JSON-LD`) sesuai jenis halaman, bukan asal tempel.
7. Daftarkan properti di Search Console (tipe Domain), submit sitemap, pantau Coverage.
8. Dorong URL baru lewat IndexNow (Bing/Yandex) — Google tidak memakai IndexNow.
9. Ukur: klik, tayangan, CTR, posisi. Tanpa angka, "SEO bagus" hanya perasaan.
10. Rawat: konten baru, internal link, perbaiki halaman yang tayang tapi tidak diklik.

---

## 1. Fondasi: bisa dirayapi

### 1.1 Render
- Mesin pencari bisa mengeksekusi JS, tetapi **tidak sabar**. HTML awal harus memuat judul,
  deskripsi, isi utama, dan tautan.
- SPA murni: tambahkan SSR/prerender untuk halaman publik (beranda, profil, artikel, direktori),
  atau minimal menyajikan HTML shell dengan meta + konten teks di server.
- Halaman di balik login: jangan diindeks (`noindex`), jangan dimasukkan sitemap.

### 1.2 robots.txt
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /login
Sitemap: https://domain.tld/sitemap.xml
```
Aturan penting:
- Jangan `Disallow: /assets/` atau `/*.js` — Googlebutuh JS/CSS untuk menilai halaman.
- `Disallow` mencegah perayapan, **bukan** mencegah indeks. Untuk mengeluarkan halaman dari
  indeks pakai `noindex` (dan jangan blokir perayaannya, kalau tidak `noindex` tak terbaca).
- `Sitemap:` di robots hanya membantu penemuan; tetap submit manual di Search Console.

### 1.3 Status kode
- 200 untuk halaman hidup; 301 untuk pindah permanen; 404/410 untuk yang memang hilang.
- Hindari 302 berantai, soft-404 (halaman "tidak ditemukan" yang membalas 200), dan
  redirect ke beranda untuk URL yang tidak ada.

---

## 2. Sitemap

### 2.1 Aturan
- Hanya URL **kanonik** dan **status 200**. Jangan sertakan halaman `noindex`, hasil filter,
  parameter sesi, atau halaman duplikat.
- `<lastmod>` diisi saat konten benar-benar berubah (bukan `now()` setiap request) — kalau
  selalu berubah, Google berhenti mempercayainya.
- Satu berkas maksimal 50.000 URL dan 50 MB (belum dikompres).
- Sitemap index dipakai bila URL > 50.000 atau dipecah per jenis konten.

### 2.2 Contoh dinamis (Express)
```js
app.get('/sitemap.xml', (req, res) => {
  const basis = `https://${hostPermintaan(req)}`
  const urls = db.prepare(`SELECT slug, updated_at FROM artikel WHERE publik=1 ORDER BY updated_at DESC LIMIT 50000`).all()
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${basis}/artikel/${u.slug}</loc><lastmod>${u.updated_at.slice(0,10)}</lastmod></url>`).join('\n')}
</urlset>`)
})
```
Selalu XML-escape `&`, `<`, `>` pada URL.

### 2.3 Multi-domain / multi-tenant
- Tiap host punya sitemap sendiri yang hanya berisi URL host itu.
- Domain alias (yang isinya sama dan mengarah ke kanonik) **jangan** punya sitemap berbeda —
  cukup satu sitemap di domain kanonik.
- Subdomain lembaga adalah properti terpisah di Search Console; daftarkan sendiri.

---

## 3. Kanonisasi dan duplikasi

- `<link rel="canonical" href="https://domain.tld/halaman">` absolut, satu per halaman.
- Parameter urutan/filter/sesi: kanonikkan ke versi bersih, atau `noindex` bila tidak bernilai.
- `http` → `https`, `www` → non-`www` (atau sebaliknya): pilih satu, 301 sisanya.
- Halaman mirip (mis. daftar dengan 3 urutan berbeda): satu versi kanonik, sisanya `noindex, follow`.
- Di SPA, canonical harus diperbarui saat rute berubah — kalau tidak, semua halaman menunjuk
  ke beranda dan dianggap duplikat.

---

## 4. Meta dan tampilan di hasil pencarian

```html
<title>Judul spesifik — Merek</title>            <!-- 50–60 karakter -->
<meta name="description" content="Ringkasan 120–155 karakter yang menjawab niat pencarian.">
<link rel="canonical" href="https://domain.tld/halaman">
<meta property="og:title" content="Judul">
<meta property="og:description" content="Ringkasan">
<meta property="og:image" content="https://domain.tld/og/halaman.png">  <!-- 1200x630 -->
<meta property="og:url" content="https://domain.tld/halaman">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow, max-image-preview:large">
```
- Judul: kata kunci utama di depan, merek di belakang, hindari pengulangan kata.
- Deskripsi bukan faktor peringkat langsung, tetapi menentukan CTR.
- Halaman privat: `<meta name="robots" content="noindex, nofollow">`.

---

## 5. Structured data (JSON-LD)

Pilih tipe sesuai isi; jangan menandai sesuatu yang tidak ada di halaman.

| Jenis halaman | Tipe schema |
|---|---|
| Organisasi / sekolah / toko | `Organization`, `EducationalOrganization`, `LocalBusiness` |
| Artikel / berita | `Article` / `NewsArticle` + `author`, `datePublished` |
| Produk | `Product` + `Offer` + `AggregateRating` (hati-hati: rating harus nyata) |
| FAQ | `FAQPage` |
| Panduan langkah | `HowTo` |
| Navigasi | `BreadcrumbList` |
| Situs | `WebSite` + `SearchAction` |

Contoh minimal:
```json
{
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "MTs Plus Sunan Drajat 7",
  "url": "https://jurnal.mtsplussd7.cc.cd/",
  "telephone": "+62-351-xxxx",
  "address": { "@type": "PostalAddress", "streetAddress": "...", "addressLocality": "...", "addressCountry": "ID" },
  "sameAs": ["https://www.instagram.com/..."]
}
```
Uji di https://search.google.com/test/rich-results dan pantau laporan "Peningkatan" di GSC.

---

## 6. Isi dan arsitektur informasi

- **Satu halaman = satu niat pencarian.** Jangan gabung "profil sekolah", "PPDB", dan "berita"
  dalam satu URL panjang.
- **Kedalaman ≤ 3 klik** dari beranda untuk halaman penting.
- **Internal link** dengan teks anchor deskriptif ("panduan jurnal mengajar", bukan "klik di sini").
- **Konten unik per halaman.** Halaman yang 95% isinya sama antar lembaga akan dinilai tipis;
  tambahkan data khas: statistik, daftar mapel, ekskul, berita, kontak, peta.
- **Judul H1 satu per halaman**, struktur H2/H3 rapi.
- **Segarkan konten** yang sudah ada sebelum menambah halaman baru — Google menilai keseluruhan situs.

### Halaman tipis yang sering terlewat
- Halaman kategori kosong → `noindex` sampai ada isinya.
- Halaman pencarian internal → `noindex, follow`.
- Halaman login/daftar → `noindex`.
- Tag/arsip tanggal tanpa isi → `noindex` atau gabungkan.

---

## 7. Performa (Core Web Vitals)

Ambang "baik": LCP < 2,5 s, INP < 200 ms, CLS < 0,1.

- Kritis: gambar `width`/`height` eksplisit, `loading="lazy"` untuk bawah layar, format WebP/AVIF.
- Font: `font-display: swap`, preload satu varian saja.
- JS: code-splitting per rute, hindari pustaka besar di halaman publik.
- Server: cache HTML publik (mis. 60 detik), kompresi Brotli/gzip, HTTP/2 atau HTTP/3.
- Ukur dengan PageSpeed Insights dan data lapangan di GSC → "Pengalaman Halaman".

---

## 8. Search Console: penyiapan sekali, manfaat bertahun

1. **Tipe properti**: pilih **Domain** (verifikasi TXT DNS) — mencakup semua subdomain.
   Tipe "URL prefix" hanya satu host dan harus diverifikasi per host.
2. Tambahkan **service account** sebagai pengguna **Full** bila ingin otomasi:
   `nama@proyek.iam.gserviceaccount.com` → Settings → Users and permissions.
3. Aktifkan **Google Search Console API** di Google Cloud, unduh kunci JSON.
4. Submit sitemap (UI atau API `sitemaps.submit`, balasan 204 = sukses).
5. Pantau berkala:
   - **Indexing → Pages**: alasan "Discovered – currently not indexed" (kualitas/otoritas),
     "Crawled – currently not indexed" (konten tipis/duplikat), "Excluded by noindex".
   - **Sitemaps**: status "Success" dan jumlah URL ditemukan.
   - **Performance**: klik, tayangan, CTR, posisi; filter per negara/perangkat.
   - **Experience**: Core Web Vitals.
6. **URL Inspection** untuk mengecek satu URL dan meminta indeks (hanya lewat UI).

### Otomasi lewat API (tanpa dependensi berat)
JWT RS256 ditandatangani `jsonwebtoken`, ditukar ke `https://oauth2.googleapis.com/token`,
lalu:
- `GET  /webmasters/v3/sites` — daftar properti + izin.
- `PUT  /webmasters/v3/sites/{situs}/sitemaps/{url}` — submit sitemap.
- `POST /webmasters/v3/sites/{situs}/searchAnalytics/query` — klik/tayangan/posisi.
Batas: 1.200 kueri/menit per pengguna; data tertinggal ±2 hari.

### Indexing API — jangan salah pakai
Hanya untuk `JobPosting` dan `BroadcastEvent`. Untuk halaman biasa tidak berpengaruh,
meski balasannya 200.

---

## 9. IndexNow (Bing, Yandex, Seznam, Naver)

Google tidak memakai IndexNow. Untuk mesin lain, ini jalur tercepat dan gratis.

1. Buat kunci acak 32 heksadesimal, mis. `adc9a32340e681107188ff4d34c812c7`.
2. Sajikan di `https://domain.tld/<kunci>.txt` berisi kunci itu (teks polos, status 200).
3. Kirim:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.indexnow.org/indexnow \
  -H 'Content-Type: application/json' \
  -d '{"host":"domain.tld","key":"<kunci>","keyLocation":"https://domain.tld/<kunci>.txt","urlList":["https://domain.tld/artikel/baru"]}'
```
Balasan: `200` diterima, `202` diterima & menunggu validasi kunci, `403` kunci tidak cocok,
`422` URL tidak sesuai host, `429` terlalu sering.

4. Panggil saat konten terbit (hook) dan ulangi sitemap sekali sehari lewat cron.
   Jangan kirim berulang kali dalam satu jam untuk URL yang sama.

---

## 10. Pengukuran

| Metrik | Sumber | Arti |
|---|---|---|
| Tayangan | GSC Performance | halaman muncul di hasil pencarian |
| Klik / CTR | GSC Performance | daya tarik judul & deskripsi |
| Posisi rata-rata | GSC Performance | daya saing kata kunci |
| Halaman terindeks | GSC Pages | kesehatan teknis |
| LCP/INP/CLS | GSC Experience | kenyamanan pengguna |
| Konversi | analytics sendiri | apakah SEO menghasilkan, bukan hanya mengunjungi |

Cara membaca: tayangan naik tapi klik tetap = judul/deskripsi lemah. Klik naik tapi konversi
turun = niat pencarian tidak cocok dengan halaman.

---

## 11. Kesalahan yang paling sering terjadi

1. SPA tanpa SSR → HTML kosong, Google melihat halaman tanpa isi.
2. `robots.txt` memblokir `/_next/` atau `*.js` → render gagal.
3. Semua halaman memakai `<title>` sama dan canonical ke beranda.
4. Sitemap berisi URL 404, halaman `noindex`, atau parameter sesi.
5. `lastmod` diisi waktu sekarang setiap request.
6. `Disallow` dipakai untuk "menghapus" halaman dari indeks (harus `noindex`).
7. Structured data menandai hal yang tidak ada di halaman.
8. Halaman kategori/tag kosong dibiarkan terindeks → konten tipis massal.
9. Domain alias punya sitemap sendiri berisi URL domain lain.
10. Menunggu "instan": indeks butuh hari sampai minggu; yang bisa dipercepat hanya penemuan.

---

## 12. Checklist rilis (pakai ini tiap proyek baru)

Teknis
- [ ] HTML awal memuat judul, deskripsi, H1, isi utama
- [ ] `robots.txt` benar, tidak memblokir aset
- [ ] `sitemap.xml` dinamis, hanya URL 200 & kanonik
- [ ] canonical absolut per halaman
- [ ] `noindex` pada login, admin, pencarian internal, keranjang
- [ ] 301 untuk domain/URL lama, tanpa rantai
- [ ] 404/410 benar untuk halaman hilang
- [ ] `og:*` + gambar 1200×630
- [ ] JSON-LD sesuai jenis halaman, lolos Rich Results Test
- [ ] LCP < 2,5 s, CLS < 0,1 pada 4G

Isi
- [ ] satu H1, struktur H2/H3 rapi
- [ ] judul & deskripsi unik per halaman
- [ ] konten khas, bukan template kosong
- [ ] internal link deskriptif, kedalaman ≤ 3
- [ ] tanpa halaman tipis terindeks

Operasional
- [ ] properti GSC (Domain) terverifikasi
- [ ] sitemap disubmit, status Success
- [ ] IndexNow aktif + kunci dapat diakses
- [ ] laporan mingguan otomatis (klik/tayangan/posisi)
- [ ] pemantauan log bot (Googlebot/Bingbot) 24 jam pertama

---

## 13. Perintah siap pakai (dari proyek ini)

```bash
# submit sitemap ke semua properti Search Console
GSC_SA_JSON=/root/gsc-sa.json node scripts/gsc-submit.cjs --daftar
GSC_SA_JSON=/root/gsc-sa.json node scripts/gsc-submit.cjs https://domain.tld/

# laporan 28 hari (klik, tayangan, CTR, posisi, kueri & halaman teratas)
GSC_SA_JSON=/root/gsc-sa.json node scripts/gsc-laporan.cjs --hari 28

# dorong sitemap ke IndexNow untuk semua host
node scripts/indexnow-harian.cjs
```

Cron yang dipakai:
```
15 5 * * *  node /opt/jurnalku-indexnow.cjs        # IndexNow harian
30 5 * * 1  node /opt/gsc-laporan.cjs              # laporan SEO mingguan
0  6 * * *  /usr/local/bin/caddy-bot-report.sh     # rekap bot harian
```

---

## 14. Adaptasi ke proyek lain

1. Ganti sumber data sitemap (tabel/artikel/produk) dan host.
2. Pertahankan pola: satu URL kanonik, meta dinamis, JSON-LD per tipe.
3. Untuk situs statis: hasilkan `sitemap.xml` saat build, tambahkan skrip ping IndexNow.
4. Untuk e-commerce: tambahkan `Product`/`Offer`, hindari `AggregateRating` tanpa ulasan nyata.
5. Untuk multi-bahasa: `hreflang` timbal balik + canonical per bahasa.
6. Untuk multi-tenant: sitemap per host, properti GSC per domain, jangan campur kanonik.
