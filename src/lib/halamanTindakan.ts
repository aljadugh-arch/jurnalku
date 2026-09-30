/**
 * Halaman tindak lanjut dari monitoring kelengkapan data.
 *
 * Sebagian halaman tujuan (mis. Pengaturan Lembaga, Rekap Nilai per Mapel)
 * hanya boleh dibuka admin/super_admin — lihat allowedRoles di src/App.tsx.
 * Kepala madrasah juga melihat halaman monitoring, jadi tombolnya harus
 * disembunyikan untuk mereka; kalau tidak, klik akan memantul balik ke
 * /admin tanpa penjelasan apa pun.
 *
 * Daftar ini SENGAJA kecil dan diuji terhadap src/App.tsx oleh
 * tests/dashboard-kelengkapan-ui.test.cjs — kalau guard route berubah,
 * tesnya gagal dan daftar ini harus ikut disesuaikan.
 */
export const HALAMAN_HANYA_ADMIN: ReadonlySet<string> = new Set([
  '/admin/settings',
  '/admin/rekap-nilai',
])

const PERAN_ADMIN = ['admin', 'super_admin']

/** Apakah peran ini boleh membuka tautan tindak lanjut tersebut? */
export function bisaBukaHalaman(role: string | undefined | null, tautan?: string | null): boolean {
  if (!tautan) return false
  if (!HALAMAN_HANYA_ADMIN.has(tautan)) return true
  return PERAN_ADMIN.includes(role || '')
}
