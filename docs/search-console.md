# Panduan Submit ke Google Search Console — JURNALKU

Diperbarui: 18 Oktober 2026
Status sitemap: semua domain balas 200, semua URL di dalamnya balas 200.

---

## 1. Daftar domain + URL sitemap

Tempel URL sitemap ini apa adanya saat mendaftar. Jangan tambah spasi.

### Domain lembaga (paling bernilai — konten unik per sekolah)

| Lembaga | Domain | URL sitemap | URL di sitemap |
|---|---|---|---|
| MTs Plus Sunan Drajat 7 Palang | `jurnal.mtsplussd7.cc.cd` | `https://jurnal.mtsplussd7.cc.cd/sitemap.xml` | 7 (2 posting) |
| MI Miftahul Huda Ngimbang | `jurnal.mimifdangimbang.my.id` | `https://jurnal.mimifdangimbang.my.id/sitemap.xml` | 6 (1 posting) |
| Sanggar Bakat 1 Sekolah Musik | `jurnal.sb1official.web.id` | `https://jurnal.sb1official.web.id/sitemap.xml` | 5 (0 posting) |

### Domain platform (didaftarkan setelah yang di atas)

| Domain | URL sitemap | URL di sitemap |
|---|---|---|
| `jurnal.cc.cd` | `https://jurnal.cc.cd/sitemap.xml` | 5 |
| `jurnalmadrasah.web.id` | `https://jurnalmadrasah.web.id/sitemap.xml` | 5 |
| `jurnalku.biz.id` | `https://jurnalku.biz.id/sitemap.xml` | 5 |
| `idjurnal.my.id` | `https://idjurnal.my.id/sitemap.xml` | 5 |
| `idjurnal.web.id` | `https://idjurnal.web.id/sitemap.xml` | 5 |
| `idjurnal.biz.id` | `https://idjurnal.biz.id/sitemap.xml` | 5 |

**Baca ini sebelum mendaftarkan keenam domain platform.** Keenamnya menyajikan
halaman beranda, panduan, PPDB, login, dan register yang isinya sama persis —
yang berbeda hanya nama host. Google memperlakukan itu sebagai konten
duplikat dan biasanya hanya mengindeks satu. Mendaftarkan keenamnya tidak
akan menghasilkan enam situs terindeks.

Urutan yang masuk akal: **domain lembaga dulu** (kontennya unik), lalu
`jurnal.cc.cd` sebagai domain utama platform. Sisanya opsional.

---

## 2. Cara verifikasi kepemilikan

Search Console menolak menampilkan data sebelum Bapak membuktikan domain itu
milik Bapak. Tiga cara, urut dari paling praktis untuk setup ini.

### Cara A — Berkas HTML (paling praktis, SUDAH DIUJI bekerja)

Jalur ini sudah dibuka dan dibuktikan end-to-end: berkas ditaruh di `public/`,
ikut terkirim oleh deploy, dan disajikan apa adanya oleh server di **semua
domain sekaligus** (satu deploy menyebarkan ke 9 domain).

Langkahnya:

1. Di Search Console, pilih **URL prefix**, isi `https://jurnal.mtsplussd7.cc.cd/`
2. Pilih metode **HTML file**, unduh berkasnya (nama seperti `google1a2b3c4d5e6f7890.html`)
3. Taruh berkas itu di folder `public/` repo Jurnalku — **jangan di `dist/`**
4. Minta saya deploy (`bash scripts/gate-lalu-deploy.sh --deploy`)
5. Klik **Verify** di Search Console

Bapak bisa mengunduh berkas verifikasi untuk semua domain sekaligus, taruh
semuanya di `public/`, lalu verifikasi satu per satu tanpa deploy berulang.

**Sudah diverifikasi (18 Okt 2026):** berkas uji `google8f2a9c1d4e6b7a03.html`
dikirim lewat pipeline deploy resmi dan tersaji dengan isi yang cocok persis
di 9/9 domain, HTTP 200.

### Cara B — DNS TXT (kalau Bapak lebih suka atur DNS sendiri)

Google memberi satu baris TXT. Tambahkan di pengelola DNS domain yang
bersangkutan, tunggu propagasi (biasanya 5–60 menit), lalu **Verify**.

Cocok kalau Bapak ingin verifikasi bertahan walau suatu saat situs sedang
down — DNS tetap terbaca Google.

### Cara C — Meta tag

Google memberi satu baris `<meta name="google-site-verification" ...>`.
Bisa saya sisipkan ke blok SEO per-host. Lebih ribet karena harus
memetakan tag ke host yang tepat, jadi pilih ini hanya kalau A dan B tidak
memungkinkan.

---

## 3. Langkah submit sitemap

Setelah properti terverifikasi:

1. Buka properti → menu **Sitemaps** (di kolom kiri, bagian *Indexing*)
2. Di kolom "Add a new sitemap", isi bagian setelah domain saja: `sitemap.xml`
3. Klik **Submit**
4. Status awal akan **Success** dengan keterangan *Discovered URLs: N*

Ulangi untuk tiap domain. Satu domain = satu properti = satu submit.

---

## 4. Apa yang wajar terjadi setelahnya

| Waktu | Yang terlihat |
|---|---|
| Beberapa menit | Sitemap terbaca, status *Success*, URL *Discovered* |
| 1–7 hari | Sebagian URL berubah jadi *Indexed* |
| 2–6 minggu | Halaman posting mulai muncul di hasil pencarian |

Kalau setelah 2 minggu masih `Discovered — currently not indexed`, itu bukan
error. Artinya Google tahu halamannya ada tapi menilai belum layak diindeks.
Penyebab paling umum: halaman terlalu tipis (sedikit teks). Solusinya
menambah isi posting, bukan mengubah teknis.

---

## 5. Yang perlu dipantau rutin

- **Pages → Not indexed** — daftar halaman yang gagal masuk indeks beserta alasannya
- **Experience → Core Web Vitals** — kecepatan halaman di HP
- **Enhancements** — kalau ada masalah pada data terstruktur (halaman posting memakai schema.org `NewsArticle`)
- **Performance → Queries** — kata kunci yang benar-benar membawa pengunjung

Pemeriksaan sebulan sekali sudah cukup.

---

## 6. Yang sudah beres di sisi teknis (tidak perlu dikerjakan lagi)

- `robots.txt` per domain — membuka halaman publik, menutup `/api/`, `/admin/`, `/guru/`, `/siswa/`, `/wali/`
- `sitemap.xml` per domain — memuat beranda, panduan, PPDB, login, register, dan **semua posting lembaga** (maksimal 500 terbaru)
- Canonical per host — tiap domain menunjuk ke dirinya sendiri, tidak saling berebut
- Meta judul + deskripsi berbeda per halaman (`/`, `/panduan`, `/ppdb`, `/login`, `/register`)
- Halaman posting publik yang dirender server: judul, deskripsi, canonical, `og:*`, dan schema.org `NewsArticle` — bisa dibaca crawler tanpa menjalankan JavaScript
- Konten teks di `<div id="root">` untuk crawler yang tidak menjalankan JS (React menimpanya saat halaman dimuat, pengunjung tidak melihatnya)
- Open Graph image (`og-image.png`) 1200x630 untuk pratinjau saat dibagikan di WhatsApp/media sosial

Semua di atas sudah live dan terverifikasi: 37 dari 37 URL di seluruh sitemap
balas HTTP 200.

---

## 7. Satu hal yang tidak bisa dikejar dari sisi teknis

Peringkat ditentukan isi, bukan konfigurasi. Situs dengan 2 posting tidak akan
bersaing dengan situs yang punya 200. Yang paling berdampak sekarang:
menambah posting kegiatan/prestasi tiap lembaga secara rutin. Setiap posting
otomatis jadi satu halaman yang bisa diindeks dengan kata kunci unik.
