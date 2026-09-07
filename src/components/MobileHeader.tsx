import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Bell, Moon, Sun, User, Lock, LogOut, ChevronDown, Repeat2 } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import Avatar from './ui/Avatar'

function roleLabel(role?: string) {
  switch (role) {
    case 'guru': return 'Guru'
    case 'wali_kelas': return 'Wali Kelas'
    case 'siswa': return 'Siswa'
    case 'kepala': return 'Kepala Sekolah'
    case 'admin': return 'Admin'
    case 'bendahara': return 'Bendahara'
    default: return 'User'
  }
}

export default function MobileHeader({
  basePath,
  onBell,
  showBell = true,
}: {
  basePath: string
  onBell: () => void
  showBell?: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)

  const teacherMode = user?.role === 'kepala' && !!user?.can_teach && location.pathname.startsWith('/guru')

  const base = (() => {
    if (basePath) return basePath
    if (!user?.role) return '/'
    if (user.role === 'siswa' || user.role === 'wali_murid') return '/siswa'
    if (user.role === 'guru' || user.role === 'wali_kelas') return '/guru'
    return '/admin'
  })()

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <div className="relative flex items-center justify-between w-full gap-3">
      {/* Kiri: Avatar (klik membuka menu dropdown profil/password/tema/logout) + Nama */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="relative shrink-0 active:scale-95 transition"
          aria-label="Menu akun"
        >
          <Avatar
            src={user?.avatar}
            name={user?.nama}
            size={42}
            className="!border-2 !border-slate-200 dark:!border-gray-700 shadow-sm"
          />
          <ChevronDown size={12} className="absolute -bottom-0.5 -right-0.5 text-slate-500 bg-white dark:bg-gray-800 rounded-full border border-slate-200 dark:border-gray-700 p-[1px] w-3.5 h-3.5" />
        </button>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setMenuOpen(o => !o)}>
          <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate leading-tight">
            {user?.nama || 'User'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-tight">
            {roleLabel(user?.role)}{teacherMode ? ' • Mode Guru' : ''}
          </p>
        </div>
      </div>

      {/* Kanan: Bell notifikasi */}
      {showBell && (
        <button
          onClick={onBell}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800 active:scale-95 transition"
          aria-label="Notifikasi"
        >
          <Bell size={19} />
        </button>
      )}

      {/* Dropdown menu langsung dari klik avatar */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-[90] bg-black/20 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute left-0 top-12 w-56 z-[100] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:bg-gray-900 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="border-b border-gray-100 dark:border-gray-800 px-4 py-3 bg-slate-50/50 dark:bg-gray-800/40">
              <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{user?.nama || 'User'}</p>
              <p className="text-xs text-slate-500 dark:text-gray-400">{roleLabel(user?.role)}</p>
            </div>

            <div className="py-1">
              {/* Switch role Kepala ↔ Guru jika punya can_teach */}
              {user?.role === 'kepala' && !!user?.can_teach && (
                <button
                  onClick={() => { setMenuOpen(false); navigate(teacherMode ? '/admin' : '/guru') }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left"
                >
                  <Repeat2 size={15} />
                  {teacherMode ? 'Buka Mode Manajemen' : 'Buka Mode Guru'}
                </button>
              )}

              <button
                onClick={() => { setMenuOpen(false); navigate(base + '/profile') }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800 text-left"
              >
                <User size={15} className="text-slate-400" /> Profil Saya
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate(base + '/change-password') }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800 text-left"
              >
                <Lock size={15} className="text-slate-400" /> Ubah Password
              </button>
              <button
                onClick={() => { toggleDark() }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800 text-left"
              >
                {dark ? <Sun size={15} className="text-amber-500" /> : <Moon size={15} className="text-indigo-500" />}
                {dark ? 'Mode Terang' : 'Mode Gelap'}
              </button>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 py-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
              >
                <LogOut size={15} /> Keluar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
