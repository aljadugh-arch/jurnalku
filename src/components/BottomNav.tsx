import { Home, ClipboardCheck, FileText, Calendar, Award, Settings, Building2, CreditCard, CalendarDays, UserCheck } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

interface NavItem {
  label: string
  icon: React.ElementType
  path: string
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  // Guru/Wali: Home, Ceklok, Jadwal, Nilai
  { label: 'Home', icon: Home, path: '/guru', roles: ['guru', 'wali_kelas'] },
  { label: 'Ceklok', icon: ClipboardCheck, path: '/guru/absensi-guru', roles: ['guru', 'wali_kelas'] },
  { label: 'Jadwal', icon: Calendar, path: '/guru/jadwal', roles: ['guru', 'wali_kelas'] },
  { label: 'Nilai', icon: Award, path: '/guru/penilaian-harian', roles: ['guru', 'wali_kelas'] },

  // Admin/Kepala: Home, Ceklok, Absensi, Jadwal, Kalender KBM, Setting
  { label: 'Home', icon: Home, path: '/admin', roles: ['admin', 'kepala', 'operator'] },
  { label: 'Ceklok', icon: ClipboardCheck, path: '/admin/ceklok', roles: ['admin', 'kepala', 'operator'] },
  { label: 'Absensi', icon: UserCheck, path: '/admin/absensi-siswa', roles: ['admin', 'kepala', 'operator'] },
  { label: 'Jadwal', icon: Calendar, path: '/admin/jadwal', roles: ['admin', 'kepala', 'operator'] },
  { label: 'Kalender', icon: CalendarDays, path: '/admin/kalender-kbm', roles: ['admin', 'kepala', 'operator'] },
  { label: 'Setting', icon: Settings, path: '/admin/settings', roles: ['admin', 'kepala', 'operator'] },

  // Siswa: Home, Absensi, Jadwal, Nilai
  { label: 'Home', icon: Home, path: '/siswa', roles: ['siswa'] },
  { label: 'Absensi', icon: Calendar, path: '/siswa/absensi', roles: ['siswa'] },
  { label: 'Jadwal', icon: FileText, path: '/siswa/jadwal', roles: ['siswa'] },
  { label: 'Nilai', icon: Award, path: '/siswa/nilai', roles: ['siswa'] },

  // Super Admin: Home, Tenant, Invoice/Payment, Setting
  { label: 'Home', icon: Home, path: '/admin', roles: ['super_admin'] },
  { label: 'Tenant', icon: Building2, path: '/admin/tenants', roles: ['super_admin'] },
  { label: 'Invoice', icon: CreditCard, path: '/admin/tagihan', roles: ['super_admin'] },
  { label: 'Setting', icon: Settings, path: '/admin/settings', roles: ['super_admin'] },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()

  if (!user) return null

  const roleNavItems = NAV_ITEMS.filter(item => item.roles.includes(user.role))
  const roots = ['/admin', '/guru', '/siswa']

  // lg:hidden -> hanya mobile/tablet. Desktop pakai sidebar.
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 safe-area-bottom">
      <div className="flex items-center justify-around px-1 py-1.5">
        {roleNavItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path ||
            (!roots.includes(item.path) && location.pathname.startsWith(item.path))
          return (
            <button
              key={item.label + item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center flex-1 min-w-0 py-1.5 px-0.5 rounded-lg transition-colors ${
                isActive ? 'text-primary bg-primary/5' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span className="text-[10px] font-medium leading-tight truncate w-full text-center">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
