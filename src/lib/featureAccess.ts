import type { FeatureKey } from '../stores/subscriptionStore'

// Peta path halaman -> kunci fitur. Halaman yang TIDAK ada di sini selalu
// tampil (mis. Dashboard, Pengaturan, Manajemen Pengguna).
//
// PENTING: setiap fitur baru yang digerbang paket HARUS ditambahkan di sini
// (FE) DAN di FEATURE_PREFIXES (server/subscription.cjs), kalau tidak menu-nya
// tetap muncul untuk paket yang seharusnya tidak memilikinya.
const rules: [FeatureKey, string[]][] = [
  ['master_data', ['/admin/siswa', '/admin/gtk', '/admin/mapel', '/admin/rombel', '/admin/tahun-ajaran', '/admin/users', '/admin/mutasi', '/admin/substitusi', '/guru/rombel']],
  ['jadwal', ['/admin/jadwal', '/admin/pengajar', '/admin/wali-kelas', '/admin/kalender-kbm', '/guru/jadwal']],
  ['absensi', ['/admin/absensi', '/admin/absensi-siswa', '/admin/absensi-qr-siswa', '/admin/absensi-guru', '/admin/absensi-ekskul', '/admin/absensi-jamaah', '/admin/absensi-kokurikuler', '/admin/absensi-kegiatan', '/admin/rekap-absensi', '/admin/ceklok', '/admin/ekskul', '/admin/rfid', '/admin/panduan-absensi-alat', '/guru/absensi', '/guru/absensi-siswa', '/guru/absensi-mapel', '/guru/absensi-ekskul', '/siswa/absensi', '/siswa/ekskul']],
  ['jurnal', ['/admin/jurnal', '/guru/jurnal']],
  ['penilaian', ['/admin/rapor', '/admin/cetak-rapor', '/admin/kkm', '/admin/buku-induk', '/admin/catatan-kepribadian', '/admin/supervisi', '/admin/bk', '/guru/penilaian', '/guru/penilaian-harian', '/guru/penilaian-ekskul', '/guru/catatan', '/guru/catatan-kepribadian', '/guru/rekap-nilai', '/guru/nilai-sts', '/guru/nilai-sas', '/guru/koreksi-jawaban', '/siswa/nilai']],
  ['keuangan', ['/admin/tagihan', '/admin/tabungan', '/admin/bendahara', '/admin/beasiswa', '/admin/cashless', '/admin/payment-gateway', '/admin/buku-kas', '/admin/laporan-keuangan']],
  ['whatsapp', ['/admin/broadcast', '/admin/wa-gateway', '/admin/notif-settings']],
  ['posting', ['/admin/posting', '/guru/posting', '/siswa/posting']],
  ['modul_ajar', ['/admin/modul-ajar', '/admin/lms', '/guru/modul-ajar']],
  ['backup_drive', ['/admin/backup-restore']],
  ['website', ['/admin/website-lembaga', '/admin/domain']],
  ['rest_api', ['/admin/developer-api']],
  ['cashless', ['/admin/cashless', '/admin/cashless-topup', '/admin/cashless-bank-config']],
  ['ekantin', ['/admin/kantin-menu', '/admin/kantin-orders', '/admin/kantin-scanner', '/siswa/kantin']],
  // Fitur baru — sebelumnya tidak digerbang sehingga muncul di semua paket.
  ['ppdb', ['/admin/ppdb']],
  ['administrasi', ['/admin/administrasi']],
  ['perpustakaan', ['/admin/perpustakaan', '/admin/pustaka', '/guru/perpustakaan', '/siswa/perpustakaan']],
  ['ujian', ['/admin/bank-soal', '/admin/kisi-kisi', '/admin/paket-ujian', '/admin/jadwal-ujian', '/guru/bank-soal', '/guru/kisi-kisi', '/guru/paket-ujian', '/siswa/ujian', '/proktor']],
  ['program_belajar', ['/admin/program-belajar', '/admin/program-peserta']],
  ['smtp', ['/admin/smtp']],
  ['monitoring', ['/admin/monitoring', '/admin/monitoring-nilai', '/admin/nilai-ledger', '/admin/rekap-nilai', '/guru/nilai-ledger', '/admin/payroll', '/admin/rkas']],
  ['foundation', ['/admin/foundation-sync', '/admin/foundations']],
  // Pesantren/pondok: asrama & kamar, penempatan santri, izin pulang.
  ['pesantren', ['/admin/asrama', '/admin/perizinan']],
]

export function featureForFrontendPath(path: string) {
  return rules.find(([, prefixes]) => prefixes.some(p => path === p || path.startsWith(p + '/')))?.[0]
}

/** Apakah nilai `settings.jenjang` menandakan lembaga nonformal (kursus/bimbel/sanggar/diklat)? */
export function jenjangNonformal(jenjang: unknown): boolean {
  const j = String(jenjang ?? '').trim().toUpperCase()
  if (!j) return false
  return j === 'NF' || j.includes('NONFORMAL') || j.includes('NON-FORMAL') || j.includes('KURSUS') || j.includes('DIKLAT') || j.includes('BIMBEL')
}

export function pathEnabled(path: string, features?: Partial<Record<FeatureKey, boolean>>, jenjang?: unknown) {
  const key = featureForFrontendPath(path)
  if (key && features?.[key] === false) return false
  // Program Belajar HANYA untuk lembaga nonformal — sekolah formal memakai
  // Mata Pelajaran & Rombongan Belajar, jadi menunya tidak ditampilkan.
  if (key === 'program_belajar' && jenjang !== undefined && !jenjangNonformal(jenjang)) return false
  return true
}

/** Semua aturan (untuk uji & audit). */
export const ATURAN_FITUR = rules
