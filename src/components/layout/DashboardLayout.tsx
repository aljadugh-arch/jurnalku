import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNav from '../BottomNav'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { isReadOnly } from '../../lib/roles'
import { Eye } from 'lucide-react'
import { clsx } from 'clsx'

export default function DashboardLayout() {
  const { isOpen } = useSidebarStore()
  const role = useAuthStore(s => s.user?.role)
  const settings = useSettingsStore(s => s.settings)
  const background = settings.background

  const bgStyle = background
    ? {
        backgroundImage: `url(${background})`,
        backgroundSize: (settings.bg_size as string) || 'cover',
        backgroundPosition: (settings.bg_position as string) || 'center',
        backgroundRepeat: (settings.bg_repeat as string) || 'no-repeat',
        backgroundAttachment: 'fixed' as const,
      }
    : undefined

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950" style={bgStyle}>
      <Sidebar />
      <div className={clsx(
        'transition-all duration-300',
        isOpen ? 'lg:ml-64' : 'lg:ml-20'
      )}>
        <Header />
        {isReadOnly(role) && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs px-4 sm:px-6 py-2 flex items-center gap-2">
            <Eye size={14} /> Mode Pimpinan (Kepala Madrasah/Sekolah) — akses hanya-lihat, tidak dapat mengubah data.
          </div>
        )}
        <main className={clsx('p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6 overflow-x-hidden', background && 'min-h-screen bg-white/70 dark:bg-gray-950/80 backdrop-blur-sm')}>
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
