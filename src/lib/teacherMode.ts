import type { User } from '../types'

// Jabatan manajemen yang boleh MERANGKAP mengajar dengan satu akun
// (kepala/admin/operator/TU/bendahara sekaligus guru). Satu sumber untuk FE;
// server punya daftar sepadan `ROLE_BISA_RANGKAP_MENGAJAR` di server/index.cjs.
export const ROLES_BISA_MENGAJAR = ['kepala', 'admin', 'super_admin', 'operator', 'tata_usaha', 'tu', 'bendahara']

/**
 * Benar bila pengguna memegang jabatan manajemen DAN ditandai juga mengajar.
 * Dipakai untuk menampilkan tombol "Mode Guru" dan memilih menu guru.
 */
export function bisaModeGuru(user?: Pick<User, 'role' | 'can_teach'> | null): boolean {
  if (!user?.role) return false
  if (user.role === 'guru' || user.role === 'wali_kelas') return true
  return ROLES_BISA_MENGAJAR.includes(user.role) && !!user.can_teach
}
