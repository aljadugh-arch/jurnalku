import type { UserRole } from '../types'

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin Lembaga / Operator',
  kepala: 'Kepala Madrasah / Sekolah',
  guru: 'Guru',
  wali_kelas: 'Wali Kelas',
  siswa: 'Siswa',
}

export const roleLabel = (r?: string) => ROLE_LABELS[r || ''] || r || 'Guest'

// Kepala = pimpinan, read-only (tak boleh CRUD). Operator/admin = tulis penuh.
export const isReadOnly = (r?: UserRole | string) => r === 'kepala'
