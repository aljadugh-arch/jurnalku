import { Calendar, ClipboardList, FileText, GraduationCap, MapPin, Star, UserCheck, Users, Wallet } from 'lucide-react'

export interface AdminDashboardShortcut {
  key: string
  label: string
  path: string
  icon: React.ReactNode
  tile: string
}

export const adminDashboardShortcuts: AdminDashboardShortcut[] = [
  { key: 'siswa', label: 'Kelola Siswa', path: '/admin/siswa', icon: <UserCheck size={20} />, tile: 'bg-emerald-600' },
  { key: 'gtk', label: 'Kelola GTK', path: '/admin/gtk', icon: <Users size={20} />, tile: 'bg-sky-500' },
  { key: 'jadwal', label: 'Jadwal', path: '/admin/jadwal', icon: <Calendar size={20} />, tile: 'bg-violet-500' },
  { key: 'rekap', label: 'Rekapitulasi', path: '/admin/rekap-absensi', icon: <FileText size={20} />, tile: 'bg-orange-500' },
  { key: 'absensi', label: 'Absensi Siswa', path: '/admin/absensi-siswa', icon: <ClipboardList size={20} />, tile: 'bg-teal-600' },
  { key: 'ceklok', label: 'Ceklok GTK', path: '/admin/ceklok', icon: <MapPin size={20} />, tile: 'bg-cyan-600' },
  { key: 'penilaian', label: 'Penilaian', path: '/admin/rapor', icon: <Star size={20} />, tile: 'bg-fuchsia-600' },
  { key: 'keuangan', label: 'Keuangan', path: '/admin/tagihan', icon: <Wallet size={20} />, tile: 'bg-amber-600' },
  { key: 'rombel', label: 'Kelas/Rombel', path: '/admin/rombel', icon: <GraduationCap size={20} />, tile: 'bg-indigo-600' },
]

export const defaultAdminDashboardShortcutKeys = adminDashboardShortcuts.slice(0, 8).map(item => item.key)

export function parseAdminDashboardShortcutKeys(value: unknown) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(String(value || '[]'))
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(key => adminDashboardShortcuts.some(item => item.key === key)).slice(0, 8)
      if (valid.length === 8) return valid as string[]
    }
  } catch { /* gunakan default */ }
  return defaultAdminDashboardShortcutKeys
}
