import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, UserCheck, QrCode, MapPin,
  X, ChevronDown, ChevronRight, LogOut, School, Layers,
  Activity, Globe, Sparkles, DollarSign, Settings, MessageSquare, FileText,
  Newspaper, NotebookPen, ClipboardCheck, PiggyBank
} from 'lucide-react'
import { clsx } from 'clsx'
import { roleLabel } from '../../lib/roles'

interface MenuItem {
  label: string
  icon: React.ReactNode
  path?: string
  children?: { label: string; path: string }[]
}

const adminMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Posting', icon: <Newspaper size={20} />, path: '/admin/posting' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Mata Pelajaran', icon: <BookOpen size={20} />, path: '/admin/mapel' },
  { label: 'Rombongan Belajar', icon: <Layers size={20} />, path: '/admin/rombel' },
  { label: 'Kalender KBM', icon: <Calendar size={20} />, path: '/admin/kalender-kbm' },
  {
    label: 'Jadwal Pelajaran', icon: <Calendar size={20} />,
    children: [
      { label: 'Kelola Jadwal', path: '/admin/jadwal' },
      { label: 'Pengajar', path: '/admin/pengajar' },
      { label: 'Wali Kelas', path: '/admin/wali-kelas' },
    ]
  },
  {
    label: 'Absensi', icon: <UserCheck size={20} />,
    children: [
      { label: 'Absensi Siswa', path: '/admin/absensi-siswa' },
      { label: 'Absensi Guru (Geolokasi)', path: '/admin/absensi-guru' },
      { label: 'Rekapitulasi', path: '/admin/rekap-absensi' },
      { label: 'Ekstrakurikuler', path: '/admin/ekskul' },
      { label: 'Absensi Ekskul', path: '/admin/absensi-ekskul' },
      { label: 'Absensi Kokurikuler', path: '/admin/absensi-kokurikuler' },
      { label: 'Absensi Kegiatan', path: '/admin/absensi-kegiatan' },
    ]
  },
  { label: 'Ceklok Saya', icon: <MapPin size={20} />, path: '/guru/absensi-guru' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/admin/jurnal' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
  { label: 'Catatan Kepribadian', icon: <NotebookPen size={20} />, path: '/admin/catatan-kepribadian' },
  { label: 'Generator Modul Ajar', icon: <Sparkles size={20} />, path: '/admin/modul-ajar' },
  { label: 'Tahun Ajaran', icon: <School size={20} />, path: '/admin/tahun-ajaran' },
  {
    label: 'Keuangan', icon: <DollarSign size={20} />,
    children: [
      { label: 'Tagihan & Pembayaran', path: '/admin/tagihan' },
      { label: 'Tabungan Siswa', path: '/admin/tabungan' },
    ]
  },
  {
    label: 'WhatsApp', icon: <MessageSquare size={20} />,
    children: [
      { label: 'Broadcast', path: '/admin/broadcast' },
      { label: 'Konfigurasi Gateway', path: '/admin/wa-gateway' },
      { label: 'Notifikasi Otomatis', path: '/admin/notif-settings' },
    ]
  },
  { label: 'Pengaturan', icon: <Settings size={20} />, path: '/admin/settings' },
  { label: 'Manajemen Pengguna', icon: <UserCheck size={20} />, path: '/admin/users' },
  { label: 'Manajemen Lembaga', icon: <Globe size={20} />, path: '/admin/tenants' },
]

const guruMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/guru' },
  { label: 'Posting', icon: <Newspaper size={20} />, path: '/guru/posting' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/guru/jurnal' },
  { label: 'Penilaian Harian', icon: <BookOpen size={20} />, path: '/guru/penilaian-harian' },
  { label: 'Catatan Kepribadian', icon: <NotebookPen size={20} />, path: '/guru/catatan-kepribadian' },
  { label: 'Jadwal Saya', icon: <Calendar size={20} />, path: '/guru/jadwal' },
  { label: 'Penugasan', icon: <ClipboardCheck size={20} />, path: '/guru#tugas' },
  { label: 'Absensi Siswa', icon: <QrCode size={20} />, path: '/guru/absensi-siswa' },
  { label: 'Absensi Ekskul/Peminatan', icon: <UserCheck size={20} />, path: '/guru/absensi-ekskul' },
  { label: 'Absensi Saya', icon: <MapPin size={20} />, path: '/guru/absensi-guru' },
  { label: 'Modul Ajar', icon: <Sparkles size={20} />, path: '/guru/modul-ajar' },
  { label: 'Kelas Wali Saya', icon: <Layers size={20} />, path: '/guru/rombel' },
]

const siswaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/siswa' },
  { label: 'Rekap Kehadiran', icon: <UserCheck size={20} />, path: '/siswa#kehadiran' },
  { label: 'Tagihan & Pembayaran', icon: <DollarSign size={20} />, path: '/siswa#tagihan' },
  { label: 'Tabungan', icon: <PiggyBank size={20} />, path: '/siswa#tabungan' },
  { label: 'Nilai', icon: <BookOpen size={20} />, path: '/siswa#nilai' },
  { label: 'Jadwal Hari Ini', icon: <Calendar size={20} />, path: '/siswa#jadwal' },
  { label: 'Tugas', icon: <ClipboardCheck size={20} />, path: '/siswa#tugas' },
]

// Kepala Madrasah/Sekolah = pimpinan. Sesuai live bundle (Sc).
const kepalaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Posting', icon: <Newspaper size={20} />, path: '/admin/posting' },
  { label: 'Ceklok Saya', icon: <MapPin size={20} />, path: '/guru/absensi-guru' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
  { label: 'Catatan Kepribadian', icon: <NotebookPen size={20} />, path: '/admin/catatan-kepribadian' },
  { label: 'Rombongan Belajar', icon: <Layers size={20} />, path: '/admin/rombel' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/admin/jurnal' },
  { label: 'Supervisi Guru', icon: <ClipboardCheck size={20} />, path: '/admin/supervisi' },
  {
    label: 'Absensi', icon: <UserCheck size={20} />,
    children: [
      { label: 'Absensi Siswa', path: '/admin/absensi-siswa' },
      { label: 'Absensi Guru (Geolokasi)', path: '/admin/absensi-guru' },
      { label: 'Rekapitulasi', path: '/admin/rekap-absensi' },
    ]
  },
  { label: 'Kalender KBM', icon: <Calendar size={20} />, path: '/admin/kalender-kbm' },
  {
    label: 'Keuangan', icon: <DollarSign size={20} />,
    children: [
      { label: 'Tagihan & Pembayaran', path: '/admin/tagihan' },
      { label: 'Tabungan Siswa', path: '/admin/tabungan' },
    ]
  },
]

// Bendahara menu — sesuai live bundle (xc)
const bendaharaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin/bendahara' },
  { label: 'Tagihan & Pembayaran', icon: <DollarSign size={20} />, path: '/admin/tagihan' },
  { label: 'Tabungan Siswa', icon: <PiggyBank size={20} />, path: '/admin/tabungan' },
]

export default function Sidebar() {
  const { isOpen, toggle, close } = useSidebarStore()
  const { user, logout } = useAuthStore()
  const settings = useSettingsStore(s => s.settings)
  const location = useLocation()
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])

  const menuItems = (
    user?.role === 'bendahara'
      ? bendaharaMenuItems
      : user?.role === 'kepala'
        ? kepalaMenuItems
        : user?.role === 'admin' || user?.role === 'super_admin'
          ? adminMenuItems
          : user?.role === 'operator' || user?.role === 'tata_usaha' || user?.role === 'tu'
            ? adminMenuItems
            : user?.role === 'guru' || user?.role === 'wali_kelas'
              ? guruMenuItems
              : siswaMenuItems
  ).filter(item => item.path !== '/admin/tenants' || user?.role === 'super_admin')

  const handleNav = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) close()
  }

  const toggleSubmenu = (label: string) => {
    setExpandedMenus(prev =>
      prev.includes(label) ? prev.filter(m => m !== label) : [...prev, label]
    )
  }

  const isActive = (path?: string) => path === location.pathname

  return (
    <>
      {/* Mobile backdrop overlay */}
      {false && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed left-0 top-0 h-full z-40 transition-all duration-300 hidden lg:flex flex-col',
          'bg-sidebar text-sidebar-foreground',
          'w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
            {settings.logo
              ? <img src={settings.logo} alt="Logo" className="w-full h-full object-contain" />
              : <img src="/logo-jurnalku-256.png" alt="Logo" className="w-full h-full object-contain" />
            }
          </div>
          {isOpen && (
            <div className="min-w-0">
              <p className="font-bold text-sm truncate text-white">{settings.nama_lembaga || 'Madrasah Digital'}</p>
              <p className="text-xs text-white/60">SIMS/M</p>
            </div>
          )}
          <button onClick={close} className="ml-auto lg:hidden text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {menuItems.map((item) => (
            <div key={item.label} className="mb-1">
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleSubmenu(item.label)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      'text-white/70 hover:text-white hover:bg-white/10'
                    )}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {isOpen && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        {expandedMenus.includes(item.label)
                          ? <ChevronDown size={16} />
                          : <ChevronRight size={16} />
                        }
                      </>
                    )}
                  </button>
                  {isOpen && expandedMenus.includes(item.label) && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                      {item.children.map(child => (
                        <Link
                          key={child.path}
                          to={child.path}
                          onClick={handleNav}
                          className={clsx(
                            'block px-3 py-1.5 rounded-lg text-xs transition-colors',
                            isActive(child.path)
                              ? 'bg-white/20 text-white font-medium'
                              : 'text-white/60 hover:text-white hover:bg-white/10'
                          )}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  to={item.path!}
                  onClick={handleNav}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive(item.path)
                      ? 'bg-white/20 text-white font-medium'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {isOpen && <span>{item.label}</span>}
                </Link>
              )}
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="border-t border-white/10 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.nama?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          {isOpen && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.nama || 'User'}</p>
              <p className="text-xs text-white/60 truncate">{roleLabel(user?.role)}</p>
            </div>
          )}
          <button
            onClick={() => { logout(); }}
            className="text-white/60 hover:text-white flex-shrink-0"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </>
  )
}
