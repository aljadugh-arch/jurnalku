# Admin Sidebar Redesign — Local Preview

## ✅ Yang Sudah Dibuat

### 1. Component Baru: `AdminSidebar.tsx`
File: `/home/aljadugh/jurnalku/src/components/AdminSidebar.tsx`

**Fitur:**
- ✓ Sidebar penuh dengan navigasi terkelompok
- ✓ 7 kategori menu:
  1. **DASHBOARD** — Dashboard utama
  2. **MASTER DATA** — Data siswa, GTK, mapel, rombel, kalender, tahun ajaran
  3. **AKADEMIK** — Jadwal, absensi, jurnal, rapor, nilai, ujian, catatan kepribadian
  4. **LAYANAN** — Perpustakaan digital, generator AI, posting
  5. **KEUANGAN & OPERASIONAL** — Tagihan, tabungan, e-kantin, cashless
  6. **KOMUNIKASI** — WhatsApp broadcast
  7. **MANAJEMEN LEMBAGA** — Pengaturan, user, backup, API, website (diganti "Modul Sistem" dengan "Manajemen Lembaga" sesuai request)

**Fungsionalitas:**
- Submenu dapat expand/collapse dengan chevron icon
- Highlight menu aktif sesuai route terkini
- Responsive: hidden di mobile, tampil di desktop (lg:)
- Dark mode support
- Feature flag integration (filter menu berdasarkan subscription)

### 2. Integration ke DashboardLayout
File: `/home/aljadugh/jurnalku/src/components/layout/DashboardLayout.tsx`

**Perubahan:**
- Admin (admin, super_admin, operator, tata_usaha, tu) → gunakan `AdminSidebar`
- Role lain → gunakan `Sidebar` lama (unchanged)
- Sidebar width admin = 320px (w-80) — lebih lebar dari sidebar default (64-256px)
- Main content area margin-left disesuaikan: `lg:ml-80` untuk admin

### 3. Menu Grouping Structure
```
DASHBOARD
  - Dashboard

MASTER DATA
  - Data Siswa
  - Data GTK
  - Mata Pelajaran
  - Rombongan Belajar
  - Kalender KBM
  - Tahun Ajaran

AKADEMIK
  - Jadwal Pelajaran
    └─ Kelola Jadwal
    └─ Jadwal Ujian
    └─ Pengajar
  - Absensi
    └─ Presensi Siswa
    └─ Absensi QR Siswa
    └─ Absensi Guru (Geolokasi)
    └─ Rekapitulasi
    └─ Ekstrakurikuler
    └─ Absensi Ekskul
    └─ Absensi Jamaah
    └─ Absensi Kokurikuler
    └─ Absensi Kegiatan
  - Ceklok & Rekap
  - Absensi Saya
  - Jurnal Mengajar
  - Rapor Siswa
  - Ledger Nilai
  - Rekap Nilai per Mapel
  - Ujian & Bank Soal
    └─ Bank Soal
    └─ Kisi-kisi Soal
    └─ Paket Ujian
  - Catatan Kepribadian

LAYANAN
  - Perpustakaan Digital
  - Generator AI Guru
  - Posting

KEUANGAN & OPERASIONAL
  - Keuangan
    └─ Tagihan & Pembayaran
    └─ Tabungan Siswa
    └─ E-Kantin & Cashless
  - E-Kantin & Cashless
    └─ Menu Kantin
    └─ Order Kantin
    └─ Verifikasi Topup Manual
    └─ Konfigurasi Bank Transfer
    └─ Kasir QR Scanner

KOMUNIKASI
  - WhatsApp
    └─ Broadcast
    └─ Konfigurasi Gateway
    └─ Notifikasi Otomatis

MANAJEMEN LEMBAGA
  - Pengaturan
  - Manajemen Pengguna
  - Manajemen Lembaga
  - Backup & Restore
  - REST API Developer
  - Kelola Website
```

## 🚀 Testing Status

**Local Dev Server:** Running di http://localhost:5173
- ✓ Build successful (2662 modules, 1.62s)
- ✓ npm run dev berjalan
- ✓ Component sudah diintegrasikan ke DashboardLayout

## 📋 Verifikasi Manual

Untuk melihat hasilnya di browser:
1. Buka http://localhost:5173
2. Login dengan akun admin
3. Lihat sidebar kiri — sekarang menampilkan menu terkelompok (bukan lagi grid/hamburger)
4. Test expand/collapse submenu dengan click pada "Jadwal Pelajaran", "Absensi", dll
5. Test active highlight dengan navigate ke halaman berbeda

## ⚙️ Status Pending

**TIDAK DIDEPLOY KE VPS** sesuai request Anda.
- Pemilik sidebar lama (`Sidebar.tsx`) tidak berubah — masih digunakan untuk role non-admin
- Semua perubahan hanya di lokal untuk Anda review terlebih dahulu

## Laporan Perubahan File

```
src/components/AdminSidebar.tsx (NEW)           +181 lines
src/components/layout/DashboardLayout.tsx       +6 lines
test-tts-local.sh (dari TTS, tidak terkait)     +48 lines
```

**Total:** 3 file changes, 235 insertions
