import {
  Banknote, Bell, BookOpen, Calendar, ClipboardList, Code2, Database, FileText,
  GraduationCap, Landmark, MapPin, MessageSquare, Newspaper, QrCode, Settings,
  ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Star, UserCheck, Users,
  UtensilsCrossed, Wallet, Wifi,
} from 'lucide-react'

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
  { key: 'absensi', label: 'Absensi QR Siswa', path: '/admin/absensi-qr-siswa', icon: <QrCode size={20} />, tile: 'bg-teal-600' },
  { key: 'ceklok', label: 'Ceklok GTK', path: '/admin/ceklok', icon: <MapPin size={20} />, tile: 'bg-cyan-600' },
  { key: 'penilaian', label: 'Penilaian', path: '/admin/rapor', icon: <Star size={20} />, tile: 'bg-fuchsia-600' },
  { key: 'keuangan', label: 'Keuangan', path: '/admin/tagihan', icon: <Wallet size={20} />, tile: 'bg-amber-600' },
  { key: 'rombel', label: 'Kelas/Rombel', path: '/admin/rombel', icon: <GraduationCap size={20} />, tile: 'bg-indigo-600' },
  { key: 'buku-kas', label: 'Buku Kas', path: '/admin/buku-kas', icon: <Landmark size={20} />, tile: 'bg-lime-600' },
  { key: 'tabungan', label: 'Tabungan', path: '/admin/tabungan', icon: <Banknote size={20} />, tile: 'bg-yellow-600' },
  { key: 'cashless', label: 'Cashless', path: '/admin/cashless', icon: <Wallet size={20} />, tile: 'bg-rose-500' },
  { key: 'cashless-topup', label: 'Top Up Cashless', path: '/admin/cashless-topup', icon: <Wallet size={20} />, tile: 'bg-rose-600' },
  { key: 'cashless-bank-config', label: 'Konfigurasi Bank', path: '/admin/cashless-bank-config', icon: <Landmark size={20} />, tile: 'bg-rose-700' },
  { key: 'kantin-menu', label: 'Menu Kantin', path: '/admin/kantin-menu', icon: <UtensilsCrossed size={20} />, tile: 'bg-orange-600' },
  { key: 'kantin-orders', label: 'Pesanan Kantin', path: '/admin/kantin-orders', icon: <ShoppingCart size={20} />, tile: 'bg-orange-700' },
  { key: 'kantin-scanner', label: 'Scanner Kantin', path: '/admin/kantin-scanner', icon: <QrCode size={20} />, tile: 'bg-orange-800' },
  { key: 'ekskul', label: 'Ekstrakurikuler', path: '/admin/ekskul', icon: <ShieldCheck size={20} />, tile: 'bg-emerald-700' },
  { key: 'absensi-ekskul', label: 'Absensi Ekskul', path: '/admin/absensi-ekskul', icon: <QrCode size={20} />, tile: 'bg-emerald-800' },
  { key: 'absensi-kokurikuler', label: 'Absensi Kokurikuler', path: '/admin/absensi-kokurikuler', icon: <QrCode size={20} />, tile: 'bg-teal-700' },
  { key: 'absensi-kegiatan', label: 'Absensi Kegiatan', path: '/admin/absensi-kegiatan', icon: <QrCode size={20} />, tile: 'bg-teal-800' },
  { key: 'absensi-jamaah', label: 'Absensi Jamaah', path: '/admin/absensi-jamaah', icon: <QrCode size={20} />, tile: 'bg-cyan-700' },
  { key: 'kalender-kbm', label: 'Kalender KBM', path: '/admin/kalender-kbm', icon: <Calendar size={20} />, tile: 'bg-violet-600' },
  { key: 'modul-ajar', label: 'Modul Ajar', path: '/admin/modul-ajar', icon: <BookOpen size={20} />, tile: 'bg-sky-600' },
  { key: 'posting', label: 'Posting', path: '/admin/posting', icon: <Newspaper size={20} />, tile: 'bg-indigo-700' },
  { key: 'broadcast', label: 'Broadcast', path: '/admin/broadcast', icon: <MessageSquare size={20} />, tile: 'bg-fuchsia-700' },
  { key: 'catatan-kepribadian', label: 'Catatan Kepribadian', path: '/admin/catatan-kepribadian', icon: <ClipboardList size={20} />, tile: 'bg-pink-600' },
  { key: 'supervisi', label: 'Supervisi', path: '/admin/supervisi', icon: <ShieldCheck size={20} />, tile: 'bg-purple-600' },
  { key: 'beasiswa', label: 'Beasiswa', path: '/admin/beasiswa', icon: <ShoppingBag size={20} />, tile: 'bg-amber-700' },
  { key: 'erkam', label: 'ERKAM', path: '/admin/erkam', icon: <BookOpen size={20} />, tile: 'bg-lime-700' },
  { key: 'backup-restore', label: 'Backup & Restore', path: '/admin/backup-restore', icon: <Database size={20} />, tile: 'bg-slate-600' },
  { key: 'users', label: 'Manajemen User', path: '/admin/users', icon: <Users size={20} />, tile: 'bg-blue-600' },
  { key: 'tenants', label: 'Manajemen Tenant', path: '/admin/tenants', icon: <Settings size={20} />, tile: 'bg-blue-700' },
  { key: 'wa-gateway', label: 'WhatsApp Gateway', path: '/admin/wa-gateway', icon: <Wifi size={20} />, tile: 'bg-green-600' },
  { key: 'notif-settings', label: 'Pengaturan Notifikasi', path: '/admin/notif-settings', icon: <Bell size={20} />, tile: 'bg-red-600' },
  { key: 'developer-api', label: 'Developer API', path: '/admin/developer-api', icon: <Code2 size={20} />, tile: 'bg-gray-700' },
  { key: 'settings', label: 'Pengaturan', path: '/admin/settings', icon: <Settings size={20} />, tile: 'bg-gray-600' },
  { key: 'pengajar', label: 'Pengajar', path: '/admin/pengajar', icon: <Users size={20} />, tile: 'bg-sky-700' },
  { key: 'wali-kelas', label: 'Wali Kelas', path: '/admin/wali-kelas', icon: <UserCheck size={20} />, tile: 'bg-emerald-500' },
  { key: 'mapel', label: 'Mata Pelajaran', path: '/admin/mapel', icon: <BookOpen size={20} />, tile: 'bg-violet-700' },
  { key: 'tahun-ajaran', label: 'Tahun Ajaran', path: '/admin/tahun-ajaran', icon: <Calendar size={20} />, tile: 'bg-indigo-500' },
  { key: 'smartphone-pwa', label: 'Aplikasi PWA', path: '/admin/settings#pwa', icon: <Smartphone size={20} />, tile: 'bg-cyan-500' },
]

export const defaultAdminDashboardShortcutKeys = adminDashboardShortcuts.slice(0, 8).map(item => item.key)

export function parseAdminDashboardShortcutKeys(value: unknown) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(String(value || '[]'))
    if (Array.isArray(parsed)) {
      const valid = [...new Set(parsed.filter(key => adminDashboardShortcuts.some(item => item.key === key)))].slice(0, adminDashboardShortcuts.length) as string[]
      if (valid.length >= 1) return valid
    }
  } catch { /* gunakan default */ }
  return defaultAdminDashboardShortcutKeys
}
