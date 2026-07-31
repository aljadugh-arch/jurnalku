import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNavbar from './BottomNavbar'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useAuthStore } from '../../stores/authStore'
import { isReadOnly } from '../../lib/roles'
import { Eye } from 'lucide-react'
import { clsx } from 'clsx'

export default function DashboardLayout() {
  const { isOpen } = useSidebarStore()
  const role = useAuthStore(s => s.user?.role)

  return (
    <div className="min-h-screen bg-gray-50 pb-safe lg:pb-0">
      <Sidebar />
      <div className={clsx(
        'transition-all duration-300',
        isOpen ? 'lg:ml-64' : 'lg:ml-20'
      )}>
        <Header />
        {isReadOnly(role) && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 sm:px-6 py-2 flex items-center gap-2">
            <Eye size={14} /> Mode Pimpinan (Kepala Madrasah/Sekolah) — akses hanya-lihat, tidak dapat mengubah data.
          </div>
        )}
        <main className="p-4 sm:p-6 overflow-x-hidden pb-20 lg:pb-0">
          <Outlet />
        </main>
        <BottomNavbar />
      </div>
    </div>
  )
}
