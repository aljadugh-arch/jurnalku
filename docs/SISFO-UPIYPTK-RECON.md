# SISFO UPI-YPTK — Hasil Scrape UI/UX + Frontend + Backend Surface

Target: `https://sisfo.upiyptk.ac.id/`
Tanggal scrape: 2026-10-24
Status: recon lengkap halaman publik. Dashboard internal TIDAK bisa diakses (butuh kredensial SSO — tidak di-scrape, tidak di-clone).

---

## 1. Ringkasan teknis

| Aspek | Nilai |
|---|---|
| Stack frontend | PHP/Laravel server-rendered (bukan SPA) + Bootstrap 5 |
| Asset root | `/assets/css/*.css`, `/assets/js/*.js`, `/assets/img/*` |
| Design system | CSS custom props (`--login-*`, `--public-*`) + kelas komponen |
| Font | Poppins (Google Fonts, 400–800) |
| Tema | Light (default) + dark (`localStorage['siakad-theme']`) |
| PWA | manifest + service worker + splash + tombol Install |
| i18n | ID / EN (`/language/id`, `/language/en`) |
| Auth | SSO username/password + Google OAuth (`/auth/google`) |
| Anti-scrap | disable console, anti right-click, anti F12/Ctrl+U, anti-debug loop (client-side saja — tidak menghalangi curl) |
| CDN | Cloudflare (email-decode), occasional 522 |

## 2. Rute publik (dikonfirmasi HTTP 200)

| Rute | Halaman | Konten |
|---|---|---|
| `/` | Beranda + login | hero + service grid + kartu login + ringkasan pengumuman/FAQ/layanan + footer |
| `/login` | Login | sama dengan `/` (redirect) |
| `/pengumuman` | Pengumuman | daftar pengumuman |
| `/faq` | FAQ | akordeon FAQ |
| `/kontak` | Kontak | form kontak + info UPT-PPIT |
| `/helpdesk` | Helpdesk | form tiket (kategori) + tombol WA + email |
| `/forgot-password` | Lupa password | form username/NIM |

API surface yang terlihat dari HTML/JS:
- `/chat/bootstrap`, `/chat/messages` (GET+POST), `/chat/request-human`, `/chat/route-destination`, `/chat/use-ai`
- `/language/{id,en}`

## 3. Design system (token persis)

### Light (default)
```
--login-bg:      #fbfaf8   (canvas krem)
--login-surface: #ffffff   (kartu)
--login-text:    #24262d
--login-muted:   #6f7785
--login-border:  #e7e4df
--login-orange:  #f47b20   (aksen utama)
--login-orange-dark: #df6511
--login-orange-soft: #fff4e9
--login-card-border: rgba(220,216,210,.82)
--login-card-border-hover: rgba(244,123,32,.24)
--login-card-border-focus: rgba(244,123,32,.42)
--login-shadow:      0 18px 44px rgba(58,48,40,.08)
--login-shadow-soft: 0 10px 30px rgba(58,48,40,.06)
```

### Dark
```
--login-bg: #0b0f19
--login-surface: #141c2e
--login-text: #f1f5f9
--login-muted: #94a3b8
--login-border: rgba(255,255,255,.11)
```

### Halaman publik (public-site.css)
```
--public-ink:   #38404b
--public-muted: #6b7480
--public-orange: #f67a0a
--public-orange-2: #ff9b22
--public-orange-soft: #fff5e9
--public-border: #e7e4df
```

### Komponen (ukuran/radius/shadows terukur)
```
.login-card:  border-radius 24px, bg rgba(255,255,255,.97),
              border rgba(226,222,216,.94), shadow var(--login-shadow),
              max-width 500px, padding 20px 30px 14px
.login-security-mark: 75x75 lingkaran, border #eee8e1
.login-card-header h2: #69574f, 23px, weight 800
.service-card:  border-radius 20px, min-height 178px, bg rgba(255,255,255,.92),
                border rgba(231,228,223,.88), padding 20px 18px 52px,
                hover translateY(-3px) + border #f4d3b4
.service-icon:  48x48 lingkaran, bg orange-soft, warna orange
.btn-login:  min-height 49px, radius 8px,
             background linear-gradient(135deg,#ff9a20 0%,#f27513 100%),
             shadow 0 10px 20px rgba(242,117,19,.17), weight 700
.btn-primary-orange: radius 12px, gradient(135deg,#ff9b22,#f67a0a),
             shadow 0 10px 24px rgba(214,104,8,.17), weight 750
.portal-summary-card: radius 18px, bg rgba(255,255,255,.78), border rgba(226,222,216,.92),
             shadow 0 12px 32px rgba(55,46,38,.045), backdrop-filter blur(8px)
.welcome-badge: pill, orange-soft bg
```

Gradien tombol: `linear-gradient(135deg, #ff9a20 0%, #f27513 100%)`

## 4. Struktur halaman Beranda/Login (dari HTML)

1. PWA splash (logo + brand + progress bar) — overlay
2. Navbar: logo header.png (270px) | menu Beranda/Pengumuman/FAQ/Kontak | switch bahasa ID/ENG
3. Hero split layout: kiri (col-7) intro + 4 service-card; kanan (col-5) kartu login
4. Service grid: CBT, SPMB, LMS, Tracer Study (kartu link keluar)
5. Kartu login: security-mark logo, "Masuk ke Akun Anda", username/password, lupa password, tombol gradient, divider "atau", Google SSO, helpdesk-card, footer version
6. Portal summary: 3 kartu (Ringkasan Pengumuman, FAQ Populer, Layanan Utama)
7. Footer: "Sistem aman & terintegrasi", copyright, privacy/terms
8. Chat widget (AI assistant + handoff ke petugas)

## 5. Copy (ID) — dipakai verbatim untuk replika

- hero.badge: "Selamat Datang"
- hero.title: "Selamat Datang di" / hero.brand: "SISFO UPI-YPTK"
- hero.subtitle: "Smart Academic Ecosystem"
- services: CBT/SPMB/LMS/Tracer Study + subtitle
- form.title: "Masuk ke Akun Anda" / form.submit: "Masuk Sekarang"
- form.google: "Login dengan Google"
- helpdesk.question: "Ada kendala login?" / action: "Hubungi Helpdesk PPTIK"

## 6. Fitur backend yang diadopsi ke Jurnalku (alur, bukan clone)

| Fitur sisfo | Adopsi ke Jurnalku |
|---|---|
| Login SSO | login Jurnalku yang ada (username + password) |
| Google OAuth | opsional — Jurnalku belum punya, tandai sebagai gap |
| Pengumuman publik | tabel pengumuman baru (belum ada di Jurnalku) |
| FAQ publik | tabel FAQ baru |
| Kontak | tabel kontak/pesan |
| Helpdesk tiket | tabel tiket + kategori |
| Lupa password | sudah ada (ForgotPasswordPage) |
| Chat AI | ada chatbot WA di Jurnalku; chat publik = gap opsional |
| PWA | sudah ada (PwaInstallPrompt) |

## 7. Batas jujur

- Backend PHP/Laravel milik UPI YPTK TIDAK bisa di-clone dari luar — hanya API surface + copy.
- Dashboard internal (KRS, nilai, OBE, dsb.) TIDAK bisa diakses tanpa login; tidak di-scrape.
- Gambar aset (logo.png, header.png, icon) adalah milik UPI YPTK — replika Jurnalku memakai aset Jurnalku sendiri.

## 8. Status adopsi ke Jurnalku (per 2026-10-24)

| Modul | Status | Catatan |
|---|---|---|
| Design system (`src/styles/sisfo.css`, prefiks `sk-*`) | SELESAI lokal | token palet + komponen (card, service, btn, field, navbar, footer, form) |
| Font Poppins (index.html) | SELESAI lokal | dipakai hanya kelas `sk-*` |
| LoginPage — layout split sisfo | SELESAI lokal | preserve semua logika (OTP wali, akun demo, banner PPDB, koneksi lambat) |
| LandingPage — navbar/hero/footer + portal summary | SELESAI lokal | konten fitur/harga/peran/langkah dipertahankan |
| Pengumuman publik | SELESAI lokal | `/pengumuman` — menumpang tabel posting |
| FAQ publik | SELESAI lokal | `/faq` + tabel baru |
| Kontak | SELESAI lokal | `/kontak` + tabel baru |
| Helpdesk tiket | SELESAI lokal | `/helpdesk` + tabel baru |
| Admin kelola konten | SELESAI lokal | `/admin/website` (FAQ + kontak + tiket) |
| Chat AI publik | TIDAK diadopsi | gap (Jurnalku sudah punya chatbot WA) |

TIDAK deploy live — menunggu audit Master. Commit lokal `be43f52` (tanpa push).
Tes 1528/1528 HIJAU, `npm run build` sukses, verifikasi visual desktop+CDP.
