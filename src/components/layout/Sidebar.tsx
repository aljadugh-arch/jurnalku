import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, UserCheck, QrCode, MapPin,
  X, ChevronDown, ChevronRight, LogOut, Layers,
  DollarSign, FileText, Newspaper, PiggyBank, ClipboardCheck, NotebookPen
} from 'lucide-react'
import { clsx } from 'clsx'
import { roleLabel } from '../../lib/roles'
import { useSubscriptionStore } from '../../stores/subscriptionStore'
import { pathEnabled } from '../../lib/featureAccess'
import { menuForRole } from '../../lib/menuItems'

interface MenuItem {
  label: string
  icon: React.ReactNode
  path?: string
  external?: string
  children?: { label: string; path: string; external?: string }[]
}


const siswaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/siswa' },
  { label: 'Rekap Kehadiran', icon: <UserCheck size={20} />, path: '/siswa#kehadiran' },
  { label: 'Tagihan & Pembayaran', icon: <DollarSign size={20} />, path: '/siswa#tagihan' },
  { label: 'Top-up QRIS', icon: <QrCode size={20} />, path: '/siswa/qris-topup' },
  { label: 'Tabungan', icon: <PiggyBank size={20} />, path: '/siswa#tabungan' },
  { label: 'Nilai', icon: <BookOpen size={20} />, path: '/siswa#nilai' },
  { label: 'Jadwal Hari Ini', icon: <Calendar size={20} />, path: '/siswa#jadwal' },
  { label: 'Tugas', icon: <ClipboardCheck size={20} />, path: '/siswa#tugas' },
  { label: 'Perpustakaan Digital', icon: <BookOpen size={20} />, path: '/siswa/perpustakaan' },
]

// Kepala Madrasah/Sekolah = pimpinan. Sesuai live bundle (Sc).
const kepalaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Posting', icon: <Newspaper size={20} />, path: '/admin/posting' },
  { label: 'Ceklok Saya', icon: <MapPin size={20} />, path: '/admin/ceklok' },
  { label: 'Absensi Saya', icon: <MapPin size={20} />, path: '/admin/absensi-saya' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
  { label: 'Catatan Kepribadian', icon: <NotebookPen size={20} />, path: '/admin/catatan-kepribadian' },
  { label: 'Rombongan Belajar', icon: <Layers size={20} />, path: '/admin/rombel' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/admin/jurnal' },
  { label: 'Supervisi Guru', icon: <ClipboardCheck size={20} />, path: '/admin/supervisi' },
  { label: 'Perpustakaan Digital', icon: <BookOpen size={20} />, path: '/admin/perpustakaan' },
  {
    label: 'Absensi', icon: <UserCheck size={20} />,
    children: [
      { label: 'Presensi Siswa', path: '/admin/absensi-siswa' },
      { label: 'Absensi QR Siswa', path: '/admin/absensi-qr-siswa' },
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
      { label: 'E-Kantin & Cashless', path: '/admin/kantin-menu' },
    ]
  },
]

// Bendahara menu — sesuai live bundle (xc)
const bendaharaMenuItems: MenuItem[] = [
  { label: 'Dashboard Bendahara', icon: <LayoutDashboard size={20} />, path: '/admin/bendahara' },
  { label: 'Ceklok Saya', icon: <MapPin size={20} />, path: '/admin/ceklok' },
  { label: 'Tagihan & Pembayaran', icon: <DollarSign size={20} />, path: '/admin/tagihan' },
  { label: 'Tabungan Siswa', icon: <PiggyBank size={20} />, path: '/admin/tabungan' },
  { label: 'Buku Kas', icon: <FileText size={20} />, path: '/admin/buku-kas' },
  { label: 'Laporan Keuangan', icon: <FileText size={20} />, path: '/admin/bendahara#laporan' },
  { label: 'Perpustakaan Digital', icon: <BookOpen size={20} />, path: '/admin/perpustakaan' },
]

export default function Sidebar() {
  const { isOpen, close } = useSidebarStore()
  const { user, logout } = useAuthStore()
  const settings = useSettingsStore(s => s.settings)
  const features = useSubscriptionStore(s => s.subscription?.features)
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const teacherMode = user?.role === 'kepala' && !!user.can_teach && location.pathname.startsWith('/guru')

  const menuItems = (
    user?.role === 'bendahara'
      ? bendaharaMenuItems
      : user?.role === 'kepala'
        ? teacherMode ? menuForRole('guru') : kepalaMenuItems
        : user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'operator' || user?.role === 'tata_usaha' || user?.role === 'tu'
          ? menuForRole(user?.role)
          : user?.role === 'guru' || user?.role === 'wali_kelas'
            ? menuForRole(user?.role)
            : user?.role === 'proktor'
              ? menuForRole(user.role)
              : siswaMenuItems
  )
    // menuForRole membatasi /guru/rombel hanya ketika user?.role === 'wali_kelas'.
    .map(item => ({ ...item, children: item.children?.filter(child => pathEnabled(child.path, features)) }))
    .filter(item => item.path ? pathEnabled(item.path, features) : !!item.children?.length)

  const handleNav = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) close()
  }

  const toggleSubmenu = (label: string) => {
    setExpandedMenus(prev =>
      prev.includes(label) ? prev.filter(m => m !== label) : [...prev, label]
    )
  }

  const isActive = (path?: string) => path === location.pathname

  // Grouping configuration untuk admin desktop view (sesuai struktur yang diminta user)
  const adminMenuGroups: Array<{ name: string; indices: number[] }> = [
    { name: 'DASHBOARD', indices: [0] },
    { name: 'MASTER DATA', indices: [2, 3, 4, 6, 35] }, // Data Siswa, GTK, Mapel, Rombel, Tahun Ajaran (Pengajar adalah subitem Jadwal)
    { name: 'AKADEMIK', indices: [7, 8, 12, 22, 23, 24] }, // Kalender KBM, Jadwal Pelajaran, Absensi, Ceklok, Absensi Saya, Jurnal Mengajar
    { name: 'PENILAIAN & EVALUASI', indices: [28, 26, 27, 25, 32] }, // Ujian & Bank Soal, Ledger Nilai, Rekap Nilai, Rapor Siswa, Catatan Kepribadian
    { name: 'LAYANAN', indices: [34, 33] }, // Perpustakaan Digital, Generator AI Guru
    { name: 'KEUANGAN & OPERASIONAL', indices: [36, 49] }, // Keuangan (dengan sub), E-Kantin & Cashless (dengan sub)
    { name: 'KOMUNIKASI', indices: [39] }, // WhatsApp (dengan sub)
    { name: 'MANAJEMEN LEMBAGA', indices: [43, 45, 47, 48, 44] }, // Pengaturan, Manajemen Pengguna, Backup & Restore, Kelola Website, REST API Developer
  ]

  const isAdminRole = ['admin', 'super_admin', 'operator', 'tata_usaha', 'tu'].includes(user?.role || '')
  const showGrouping = isAdminRole && isOpen

  return (
    <>
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
            <img src={(settings.logo as string) || '/logo-jurnalku-256.png'} onError={e => { e.currentTarget.src = '/logo-jurnalku-256.png' }} alt="Logo" className="w-full h-full object-contain" />
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
        {user?.role === 'kepala' && user.can_teach && isOpen && (
          <div className="mx-2 mt-3 grid grid-cols-2 gap-1 rounded-lg bg-white/10 p-1 text-xs">
            <button onClick={() => navigate('/admin')} className={clsx('rounded-md px-2 py-2', !teacherMode ? 'bg-white text-sidebar' : 'text-white/70')}>Mode Manajemen</button>
            <button onClick={() => navigate('/guru')} className={clsx('rounded-md px-2 py-2', teacherMode ? 'bg-white text-sidebar' : 'text-white/70')}>Mode Guru</button>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {showGrouping ? (
            // Admin grouping view (expanded sidebar only)
            <div className="space-y-6">
              {adminMenuGroups.map(group => {
                const groupItems = group.indices.map(idx => menuItems[idx]).filter(Boolean)
                return (
                  <div key={group.name}>
                    <p className="px-3 mb-2 text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                      {group.name}
                    </p>
                    <div className="space-y-0.5">
                      {groupItems.map((item) => (
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
                                <span className="flex-1 text-left">{item.label}</span>
                                {expandedMenus.includes(item.label)
                                  ? <ChevronDown size={16} />
                                  : <ChevronRight size={16} />}
                              </button>
                              {expandedMenus.includes(item.label) && (
                                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                                  {item.children.map(child => (
                                    child.external ? (
                                      <a
                                        key={child.path}
                                        href={child.external}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={handleNav}
                                        className="block px-3 py-1.5 rounded-lg text-xs transition-colors text-white/60 hover:text-white hover:bg-white/10"
                                      >
                                        {child.label} ↗
                                      </a>
                                    ) : (
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
                                    )
                                  ))}
                                </div>
                              )}
                            </>
                          ) : item.external ? (
                            <a
                              href={item.external}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={handleNav}
                              className={clsx(
                                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                                'text-white/70 hover:text-white hover:bg-white/10'
                              )}
                            >
                              <span className="flex-shrink-0">{item.icon}</span>
                              <span>{item.label} ↗</span>
                            </a>
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
                              <span>{item.label}</span>
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Original non-grouped view (untuk non-admin atau collapsed sidebar)
            <>
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
                              : <ChevronRight size={16} />}
                          </>
                        )}
                      </button>
                      {isOpen && expandedMenus.includes(item.label) && (
                        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                          {item.children.map(child => (
                            child.external ? (
                              <a
                                key={child.path}
                                href={child.external}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={handleNav}
                                className="block px-3 py-1.5 rounded-lg text-xs transition-colors text-white/60 hover:text-white hover:bg-white/10"
                              >
                                {child.label} ↗
                              </a>
                            ) : (
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
                            )
                          ))}
                        </div>
                      )}
                    </>
                  ) : item.external ? (
                    <a
                      href={item.external}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleNav}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        isOpen ? 'text-white/70 hover:text-white hover:bg-white/10' : 'w-10 mx-auto text-white/70 hover:text-white hover:bg-white/10'
                      )}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      {isOpen && <span>{item.label} ↗</span>}
                    </a>
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
            </>
          )}
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
