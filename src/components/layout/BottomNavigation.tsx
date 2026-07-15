import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  GraduationCap,
  Home,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react'

type NavItem = {
  label: string
  path: string
  icon: React.ReactNode
  group?: string
}

const iconSize = 21

function roleItems(role?: string, hideStaffCeklok?: boolean): NavItem[] {
  const ceklok: NavItem = { label: 'Ceklok', path: '/guru/absensi-guru', icon: <MapPin size={iconSize} /> }
  const ceklokStaff: NavItem = { label: 'Ceklok', path: '/admin/ceklok', icon: <MapPin size={iconSize} /> }
  if (role === 'guru' || role === 'wali_kelas') {
    return [
      { label: 'Home', path: '/guru', icon: <Home size={iconSize} /> },
      { label: 'Ceklok', path: '/guru/absensi-guru', icon: <MapPin size={iconSize} /> },
      { label: 'Rekap', path: '/guru/jadwal', icon: <BarChart3 size={iconSize} /> },
      { label: 'Jurnal', path: '/guru/jurnal', icon: <ClipboardList size={iconSize} /> },
      { label: 'Absensi', path: '/guru/absensi-siswa', icon: <UserCheck size={iconSize} /> },
      { label: 'Nilai', path: '/guru/penilaian-harian', icon: <BookOpen size={iconSize} /> },
      { label: 'Catatan', path: '/guru/catatan-kepribadian', icon: <FileText size={iconSize} /> },
      { label: 'Modul', path: '/guru/modul-ajar', icon: <FileText size={iconSize} /> },
      { label: 'Rombel', path: '/guru/rombel', icon: <GraduationCap size={iconSize} /> },
    ]
  }

  if (role === 'siswa') {
    return [
      { label: 'Home', path: '/siswa', icon: <Home size={iconSize} /> },
      { label: 'Absensi', path: '/siswa/absensi', icon: <UserCheck size={iconSize} /> },
      { label: 'Bayar', path: '/siswa', icon: <CreditCard size={iconSize} /> },
      { label: 'Tugas', path: '/siswa/jadwal', icon: <ClipboardCheck size={iconSize} /> },
      { label: 'Nilai', path: '/siswa', icon: <BookOpen size={iconSize} /> },
      { label: 'Jadwal', path: '/siswa/jadwal', icon: <Calendar size={iconSize} /> },
      { label: 'Ekskul', path: '/siswa/ekskul', icon: <ListChecks size={iconSize} /> },
    ]
  }

  if (role === 'kepala') {
    return [
      { label: 'Home', path: '/admin', icon: <Home size={iconSize} /> },
      ...(hideStaffCeklok ? [] : [ceklokStaff]),
      { label: 'Presensi', path: '/admin/rekap-absensi', icon: <UserCheck size={iconSize} /> },
      { label: 'KBM', path: '/admin/jurnal', icon: <ClipboardList size={iconSize} /> },
      { label: 'Keuangan', path: '/admin/tagihan', icon: <DollarSign size={iconSize} /> },
      { label: 'Supervisi', path: '/admin/supervisi', icon: <ShieldCheck size={iconSize} /> },
      { label: 'Siswa', path: '/admin/siswa', icon: <GraduationCap size={iconSize} /> },
      { label: 'GTK', path: '/admin/gtk', icon: <Users size={iconSize} /> },
      { label: 'Rombel', path: '/admin/rombel', icon: <ListChecks size={iconSize} /> },
    ]
  }

  return [
    { label: 'Rekap', path: '/admin', icon: <BarChart3 size={iconSize} /> },
    ...(hideStaffCeklok ? [] : [ceklokStaff]),
    { label: 'Siswa', path: '/admin/siswa', icon: <GraduationCap size={iconSize} /> },
    { label: 'GTK', path: '/admin/gtk', icon: <Users size={iconSize} /> },
    { label: 'Jadwal', path: '/admin/jadwal', icon: <Calendar size={iconSize} /> },
    { label: 'Pengajar', path: '/admin/pengajar', icon: <BookOpen size={iconSize} /> },
    { label: 'Wali Kelas', path: '/admin/wali-kelas', icon: <Users size={iconSize} /> },
    { label: 'Mapel', path: '/admin/mapel', icon: <BookOpen size={iconSize} /> },
    { label: 'Rombel', path: '/admin/rombel', icon: <ListChecks size={iconSize} /> },
    { label: 'Presensi', path: '/admin/absensi-siswa', icon: <UserCheck size={iconSize} /> },
    { label: 'Abs. Guru', path: '/admin/absensi-guru', icon: <MapPin size={iconSize} /> },
    { label: 'Rekap Absen', path: '/admin/rekap-absensi', icon: <ClipboardCheck size={iconSize} /> },
    { label: 'Jurnal', path: '/admin/jurnal', icon: <ClipboardList size={iconSize} /> },
    { label: 'Kalender', path: '/admin/kalender-kbm', icon: <Calendar size={iconSize} /> },
    { label: 'Rapor', path: '/admin/rapor', icon: <FileText size={iconSize} /> },
    { label: 'Catatan', path: '/admin/catatan-kepribadian', icon: <FileText size={iconSize} /> },
    { label: 'Modul', path: '/admin/modul-ajar', icon: <FileText size={iconSize} /> },
    { label: 'Tagihan', path: '/admin/tagihan', icon: <DollarSign size={iconSize} /> },
    { label: 'Tabungan', path: '/admin/tabungan', icon: <CreditCard size={iconSize} /> },
    { label: 'Ekskul', path: '/admin/ekskul', icon: <ListChecks size={iconSize} /> },
    { label: 'Broadcast', path: '/admin/broadcast', icon: <FileText size={iconSize} /> },
    { label: 'WA', path: '/admin/wa-gateway', icon: <Settings size={iconSize} /> },
    { label: 'Pengguna', path: '/admin/users', icon: <ShieldCheck size={iconSize} /> },
    { label: 'Setting', path: '/admin/settings', icon: <Settings size={iconSize} /> },
  ]
}

function isActive(current: string, path: string) {
  if (path === '/admin' || path === '/guru' || path === '/siswa') return current === path
  return current === path || current.startsWith(path + '/')
}

export default function BottomNavigation() {
  const role = useAuthStore(s => s.user?.role)
  const settings = useSettingsStore(s => s.settings)
  const location = useLocation()
  const [open, setOpen] = useState(false)
  // Demo tenant (demo.jurnal.cc.cd): ceklok hanya untuk guru, sembunyikan dari admin/kepala.
  const isDemo = typeof window !== 'undefined' && window.location.hostname.startsWith('demo.')
  const items = useMemo(() => roleItems(role, isDemo), [role, isDemo])
  const primary = items.slice(0, 4)
  const more = items.slice(4)
  const activeMore = more.some(item => isActive(location.pathname, item.path))

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-3 bottom-24 max-h-[70vh] overflow-y-auto rounded-3xl bg-white p-3 shadow-2xl dark:bg-gray-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Menu lainnya</p>
                <p className="text-xs text-gray-500">{settings.nama_lembaga || 'JURNALKU'}</p>
              </div>
              <button
                type="button"
                className="rounded-full bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {more.map(item => (
                <Link
                  key={item.label}
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={clsx(
                    'flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center text-xs font-semibold',
                    isActive(location.pathname, item.path)
                      ? 'bg-primary text-white shadow-lg shadow-primary/25'
                      : 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95 lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {primary.map(item => (
            <Link
              key={item.label}
              to={item.path}
              className={clsx(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition',
                isActive(location.pathname, item.path)
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              )}
            >
              {item.icon}
              <span className="leading-none">{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className={clsx(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition',
              open || activeMore
                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            )}
          >
            <MoreHorizontal size={iconSize} />
            <span className="leading-none">Lainnya</span>
          </button>
        </div>
      </nav>
    </>
  )
}
