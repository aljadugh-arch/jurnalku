import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, UserCheck, QrCode, MapPin,
  X, ChevronDown, ChevronRight, LogOut, School, Layers,
  Activity, Globe, Sparkles, DollarSign, Settings, MessageSquare, FileText, AlertCircle, ClipboardCheck
} from 'lucide-react'
import { clsx } from 'clsx'
import { roleLabel } from '../../lib/roles'
import api from '../../services/api'

interface MenuItem {
  label: string
  icon: React.ReactNode
  path?: string
  children?: { label: string; path: string }[]
}

const adminMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Mata Pelajaran', icon: <BookOpen size={20} />, path: '/admin/mapel' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
  { label: 'Rombongan Belajar', icon: <Layers size={20} />, path: '/admin/rombel' },
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
      { label: 'Ekstrakurikuler', path: '/admin/ekskul' },
      { label: 'Absensi Ekskul', path: '/admin/absensi-ekskul' },
      { label: 'Absensi Kokurikuler', path: '/admin/absensi-kokurikuler' },
      { label: 'Absensi Kegiatan', path: '/admin/absensi-kegiatan' },
      { label: 'Absensi Guru (Geolokasi)', path: '/admin/absensi-guru' },
      { label: 'Rekapitulasi', path: '/admin/rekap-absensi' },
    ]
  },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/admin/jurnal' },
  { label: 'Kalender KBM', icon: <Calendar size={20} />, path: '/admin/kalender-kbm' },
  { label: 'Generator Modul Ajar', icon: <Sparkles size={20} />, path: '/admin/modul-ajar' },
  {
    label: 'Keuangan', icon: <DollarSign size={20} />,
    children: [
      { label: 'Tagihan & Pembayaran', path: '/admin/tagihan' },
      { label: 'Tabungan Siswa', path: '/admin/tabungan' },
    ]
  },
  { label: 'Tahun Ajaran', icon: <School size={20} />, path: '/admin/tahun-ajaran' },
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
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/guru/jurnal' },
  { label: 'Penilaian Harian', icon: <BookOpen size={20} />, path: '/guru/penilaian-harian' },
  { label: 'Jadwal Saya', icon: <Calendar size={20} />, path: '/guru/jadwal' },
  { label: 'Absensi Siswa', icon: <QrCode size={20} />, path: '/guru/absensi-siswa' },
  { label: 'Absensi Saya', icon: <MapPin size={20} />, path: '/guru/absensi-guru' },
  { label: 'Modul Ajar', icon: <Sparkles size={20} />, path: '/guru/modul-ajar' },
  { label: 'Rombel Saya', icon: <Layers size={20} />, path: '/guru/rombel' },
]

const siswaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/siswa' },
  { label: 'Absensi Saya', icon: <QrCode size={20} />, path: '/siswa/absensi' },
  { label: 'Jadwal', icon: <Calendar size={20} />, path: '/siswa/jadwal' },
  { label: 'Ekskul', icon: <Activity size={20} />, path: '/siswa/ekskul' },
]

// Kepala Madrasah/Sekolah = pimpinan, read-only. Lihat data & laporan, tanpa menu config/tulis.
const kepalaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
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

export default function Sidebar() {
  const { isOpen, toggle, close } = useSidebarStore()
  const { user, logout } = useAuthStore()
  const settings = useSettingsStore(s => s.settings)
  const location = useLocation()
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [domainStatus, setDomainStatus] = useState<{ domain_custom: string | null; domain_status: string } | null>(null)

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      api.get('/tenant/domain-status').then(r => setDomainStatus(r.data)).catch(() => {})
    }
  }, [user?.role])

  const menuItems = (user?.role === 'kepala'
    ? kepalaMenuItems
    : user?.role === 'admin' || user?.role === 'super_admin'
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
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={toggle}
        />
      )}

      <aside className={clsx(
        'fixed top-0 left-0 h-full bg-sidebar text-white z-40 transition-all duration-300 flex flex-col',
        isOpen ? 'w-64' : 'w-0 lg:w-20',
        !isOpen && 'overflow-hidden lg:overflow-visible'
      )}
        style={settings.background ? { backgroundImage: `linear-gradient(rgba(15,23,42,0.88), rgba(15,23,42,0.94)), url(${settings.background})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-5 border-b border-sidebar-hover">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-white/10">
              <img src={settings.logo || '/logo-jurnalku-256.png'} alt="Logo" className="w-full h-full object-contain" />
            </div>
            {isOpen && (
              <div className="overflow-hidden flex-1">
                <h1 className="text-lg font-bold font-display truncate">{settings.nama_lembaga || 'JURNALKU'}</h1>
                <p className="text-xs text-gray-400 truncate">SIMS/M</p>
              </div>
            )}
          </div>
          {isOpen && (
            <button onClick={toggle} className="lg:hidden text-white hover:text-gray-300 flex-shrink-0">
              <X size={20} />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2">
          {/* Domain setup alert (admin only, when custom domain is pending) */}
          {domainStatus?.domain_custom && domainStatus.domain_status !== 'active' && (user?.role === 'admin') && (
            <Link
              to="/admin/domain-setup"
              onClick={handleNav}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-2 transition-colors',
                isActive('/admin/domain-setup')
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              )}
            >
              <AlertCircle size={20} />
              {isOpen && <span>Aktifkan Domain</span>}
            </Link>
          )}
          {menuItems.map((item) => (
            <div key={item.label} className="mb-1">
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleSubmenu(item.label)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                      'hover:bg-sidebar-hover text-gray-300 hover:text-white'
                    )}
                  >
                    {item.icon}
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
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.path}
                          to={child.path}
                          onClick={handleNav}
                          className={clsx(
                            'block px-3 py-2 rounded-lg text-sm transition-colors',
                            isActive(child.path)
                              ? 'bg-primary text-white'
                              : 'text-gray-400 hover:text-white hover:bg-sidebar-hover'
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
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    isActive(item.path)
                      ? 'bg-primary text-white'
                      : 'text-gray-300 hover:text-white hover:bg-sidebar-hover'
                  )}
                >
                  {item.icon}
                  {isOpen && <span>{item.label}</span>}
                </Link>
              )}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-hover p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-light rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {user?.avatar
                ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                : <span className="text-xs font-bold">{user?.nama?.charAt(0) || 'U'}</span>}
            </div>
            {isOpen && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{user?.nama || 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{roleLabel(user?.role)}</p>
              </div>
            )}
            {isOpen && (
              <button onClick={logout} className="text-gray-400 hover:text-red-400">
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
