import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNavigation from './BottomNavigation'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useAuthStore } from '../../stores/authStore'
import { isReadOnly } from '../../lib/roles'
import { Eye } from 'lucide-react'
import { clsx } from 'clsx'

export default function DashboardLayout() {
  const { isOpen } = useSidebarStore()
  const role = useAuthStore(s => s.user?.role)

  return (
    <div className="h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className={clsx(
        'flex h-full flex-col transition-all duration-300',
        isOpen ? 'lg:ml-64' : 'lg:ml-20'
      )}>
        <Header />
        {isReadOnly(role) && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 sm:px-6 py-2 flex items-center gap-2">
            <Eye size={14} /> Mode Pimpinan (Kepala Madrasah/Sekolah) — akses hanya-lihat, tidak dapat mengubah data.
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 lg:pb-6">
          <Outlet />
        </main>
        <BottomNavigation />
      </div>
    </div>
  )
}

