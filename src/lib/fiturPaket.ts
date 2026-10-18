// Satu-satunya sumber label fitur paket.
//
// Sebelumnya ada DUA daftar terpisah: `LABEL_FITUR` di LandingPage dan
// `FEATURE_LABELS` di TenantManagementPage (dashboard superadmin). Isinya
// berbeda kata, sehingga calon pembeli membaca fitur yang tidak sama dengan
// yang diatur admin di dashboard. Sekarang keduanya mengimpor dari sini.
//
// ATURAN: label di sini adalah label PENJUALAN (bahasa awam), sedangkan
// `deskripsi` menjelaskan isinya. Kalau fitur baru ditambahkan ke
// FEATURE_KEYS di server, tambahkan juga di sini — kalau tidak, fitur itu
// tidak akan tampil di landing page.
export type FiturInfo = {
  label: string
  deskripsi: string
}

export const FITUR_INFO: Record<string, FiturInfo> = {
  master_data: {
    label: 'Data Master',
    deskripsi: 'Data siswa, GTK, mata pelajaran, rombel, dan tahun ajaran',
  },
  jadwal: {
    label: 'Jadwal & Kalender KBM',
    deskripsi: 'Jadwal pelajaran, template jadwal, dan kalender kegiatan belajar',
  },
  absensi: {
    label: 'Absensi',
    deskripsi: 'Absensi siswa & GTK dengan QR, RFID, GPS, dan rekap otomatis',
  },
  jurnal: {
    label: 'Jurnal Mengajar',
    deskripsi: 'Catatan mengajar harian guru beserta tanda tangan',
  },
  penilaian: {
    label: 'Penilaian & Rapor',
    deskripsi: 'Nilai harian, STS, SAS, rapor K13, dan catatan kepribadian',
  },
  keuangan: {
    label: 'Keuangan',
    deskripsi: 'Tagihan, tabungan siswa, beasiswa, dan laporan kas',
  },
  whatsapp: {
    label: 'WhatsApp',
    deskripsi: 'Notifikasi otomatis dan broadcast WhatsApp ke wali murid',
  },
  posting: {
    label: 'Posting',
    deskripsi: 'Postingan dan feed kegiatan lembaga',
  },
  modul_ajar: {
    label: 'Modul Ajar',
    deskripsi: 'Generator modul ajar (RPP) berbantuan AI',
  },
  backup_drive: {
    label: 'Backup Google Drive',
    deskripsi: 'Cadangan database otomatis ke Google Drive',
  },
  website: {
    label: 'Website Lembaga',
    deskripsi: 'Domain sendiri dan halaman publik lembaga',
  },
  cashless: {
    label: 'Cashless',
    deskripsi: 'Kartu siswa, top-up saldo, dan pembayaran non-tunai',
  },
  ekantin: {
    label: 'E-Kantin',
    deskripsi: 'Pemesanan dan pembayaran kantin sekolah',
  },
  rest_api: {
    label: 'REST API Developer',
    deskripsi: 'Akses API untuk integrasi sistem lain',
  },
  ppdb: {
    label: 'PPDB (Siswa Baru)',
    deskripsi: 'Pendaftaran siswa baru online beserta seleksi dan pengumuman',
  },
  administrasi: {
    label: 'Administrasi Surat',
    deskripsi: 'Surat masuk, surat keluar, dan arsip persuratan',
  },
  perpustakaan: {
    label: 'Perpustakaan Digital',
    deskripsi: 'Katalog buku, peminjaman, dan sirkulasi perpustakaan',
  },
  ujian: {
    label: 'Ujian & Bank Soal',
    deskripsi: 'Bank soal, kisi-kisi, paket ujian, dan CBT',
  },
  program_belajar: {
    label: 'Program Belajar (Nonformal)',
    deskripsi: 'Program dan level untuk lembaga kursus, diklat, dan bimbel',
  },
  smtp: {
    label: 'SMTP/IMAP Lembaga',
    deskripsi: 'Email resmi dari domain lembaga sendiri',
  },
  monitoring: {
    label: 'Monitoring & Ledger Nilai',
    deskripsi: 'Pemantauan aktivitas dan jejak perubahan nilai',
  },
  foundation: {
    label: 'Integrasi Se-Yayasan',
    deskripsi: 'Kelola beberapa lembaga dalam satu yayasan',
  },
}

// Label ringkas untuk tempat sempit (chip, badge).
export const labelFitur = (kunci: string): string => FITUR_INFO[kunci]?.label || kunci

// Deskripsi untuk tooltip / daftar harga yang lebih rinci.
export const deskripsiFitur = (kunci: string): string => FITUR_INFO[kunci]?.deskripsi || ''

// Urutan tampil di landing page: fitur inti lebih dulu, lalu fitur lanjutan.
export const URUTAN_FITUR = [
  'master_data', 'absensi', 'jadwal', 'jurnal', 'penilaian', 'keuangan',
  'whatsapp', 'ppdb', 'ujian', 'perpustakaan', 'administrasi', 'posting',
  'modul_ajar', 'cashless', 'ekantin', 'website', 'backup_drive', 'smtp',
  'monitoring', 'program_belajar', 'foundation', 'rest_api',
]

// Daftar fitur yang benar-benar membedakan paket: fitur yang TIDAK dimiliki
// paket di bawahnya. Dipakai landing page agar calon pembeli melihat selisih,
// bukan mengulang daftar fitur yang sama di semua paket.
export function fiturPembeda(
  paket: { plan: string; fitur: string[] }[],
): Record<string, string[]> {
  const hasil: Record<string, string[]> = {}
  const urut = [...paket].sort((a, b) => a.fitur.length - b.fitur.length)
  let sebelumnya = new Set<string>()
  for (const p of urut) {
    const milik = new Set(p.fitur)
    hasil[p.plan] = URUTAN_FITUR.filter(k => milik.has(k) && !sebelumnya.has(k))
    // Kalau tidak ada yang baru sama sekali, tampilkan semua fitur paket itu
    // supaya kartunya tidak kosong.
    if (hasil[p.plan].length === 0) hasil[p.plan] = URUTAN_FITUR.filter(k => milik.has(k))
    sebelumnya = milik
  }
  return hasil
}
