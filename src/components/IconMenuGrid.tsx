import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Users, GraduationCap, UserCheck, Calendar, BookOpen, Layers, ClipboardList, DollarSign, Settings, BarChart, Grid3x3, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

interface MenuItem {
  label: string
  icon: React.ElementType
  path: string
  roles: string[]
  color: string
}

// Ikon menu ini hanya menampilkan menu yang BELUM ada di kartu statistik dashboard
// (siswa/gtk/rombel/mapel/jurnal/tagihan sudah bisa diklik lewat kartu).
const MENU_ITEMS: MenuItem[] = [
  { label: 'Pengajar', icon: UserCheck, path: '/admin/pengajar', roles: ['admin', 'kepala', 'operator'], color: 'bg-purple-500' },
  { label: 'Jadwal', icon: Calendar, path: '/admin/jadwal', roles: ['admin', 'kepala', 'operator'], color: 'bg-orange-500' },
  { label: 'Wali Kelas', icon: Users, path: '/admin/wali-kelas', roles: ['admin', 'kepala', 'operator'], color: 'bg-teal-500' },
  { label: 'Absensi Siswa', icon: ClipboardList, path: '/admin/absensi-siswa', roles: ['admin', 'kepala', 'operator'], color: 'bg-cyan-500' },
  { label: 'Absensi Guru', icon: UserCheck, path: '/admin/absensi-guru', roles: ['admin', 'kepala', 'operator'], color: 'bg-sky-500' },
  { label: 'Rapor', icon: BarChart, path: '/admin/rapor', roles: ['admin', 'kepala', 'operator'], color: 'bg-fuchsia-500' },
  { label: 'Modul Ajar', icon: BookOpen, path: '/admin/modul-ajar', roles: ['admin', 'kepala', 'operator'], color: 'bg-amber-500' },
  { label: 'Tabungan', icon: DollarSign, path: '/admin/tabungan', roles: ['admin', 'kepala', 'operator'], color: 'bg-lime-600' },
  { label: 'Ekskul', icon: Layers, path: '/admin/ekskul', roles: ['admin', 'kepala', 'operator'], color: 'bg-indigo-500' },
  { label: 'Supervisi', icon: BarChart, path: '/admin/supervisi', roles: ['kepala'], color: 'bg-red-500' },
  { label: 'Pengaturan', icon: Settings, path: '/admin/settings', roles: ['admin', 'kepala', 'operator'], color: 'bg-gray-500' },
]

interface IconMenuGridProps {
  className?: string
}

function MenuButton({ item, onClick }: { item: MenuItem; onClick: () => void }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all active:scale-95"
    >
      <div className={`w-12 h-12 rounded-full ${item.color} flex items-center justify-center mb-2`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <span className="text-xs font-medium text-gray-700 text-center leading-tight">{item.label}</span>
    </button>
  )
}

export default function IconMenuGrid({ className = '' }: IconMenuGridProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [showMore, setShowMore] = useState(false)

  if (!user) return null

  const roleMenuItems = MENU_ITEMS.filter(item => item.roles.includes(user.role))

  // Show 3 items + "Lainnya" tile when there are more than 4 total
  const needsMore = roleMenuItems.length > 4
  const primary = needsMore ? roleMenuItems.slice(0, 3) : roleMenuItems
  const rest = needsMore ? roleMenuItems.slice(3) : []

  return (
    <div className={className}>
      <div className="grid grid-cols-4 gap-3 sm:gap-4">
        {primary.map((item) => (
          <MenuButton key={item.path} item={item} onClick={() => navigate(item.path)} />
        ))}
        {needsMore && (
          <button
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all active:scale-95"
          >
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-2">
              <Grid3x3 className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-medium text-gray-700 text-center leading-tight">Lainnya</span>
          </button>
        )}
      </div>

      {/* Sheet menu lainnya — muncul dari ATAS (portal escape backdrop-filter containing block) */}
      {showMore && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-3 pt-4 sm:pt-16" onClick={() => setShowMore(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-2xl p-5 max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">Menu Lainnya</h3>
              <button onClick={() => setShowMore(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-4 gap-3 sm:gap-4">
              {rest.map((item) => (
                <MenuButton key={item.path} item={item} onClick={() => { setShowMore(false); navigate(item.path) }} />
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
