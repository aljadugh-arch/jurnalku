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

/**
 * MobileHeader — header minimalis untuk dashboard mobile.
 * Hanya: avatar + nama + role di kiri, bell notifikasi di kanan.
 * Menu Profil/Ubah Password/Keluar dipindah ke dropdown avatar (klik avatar).
 * Switch role Kepala↔Guru tersedia di dropdown untuk user kepala dengan can_teach.
 */
export default function MobileHeader({
  basePath,
  onBell,
  showBell = true,
}: {
  basePath: string
  onBell: () => void
  /** Set false jika halaman sudah render tombol bell sendiri. */
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
    <div className="flex items-center justify-between w-full gap-3">
      {/* Kiri: avatar + nama + role */}
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
          <ChevronDown size={10} className="absolute -bottom-0.5 -right-0.5 text-slate-400 bg-white dark:bg-gray-900 rounded-full border border-slate-200 dark:border-gray-700 p-[1px] w-3.5 h-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate leading-tight">
            {user?.nama || 'User'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-tight">
            {roleLabel(user?.role)}{teacherMode ? ' • Mode Guru' : ''}
          </p>
        </div>
      </div>

      {/* Kanan: bell notifikasi */}
      {showBell && (
        <button
          onClick={onBell}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800 active:scale-95 transition"
          aria-label="Notifikasi"
        >
          <Bell size={19} />
        </button>
      )}

      {/* Dropdown akun */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute left-0 top-full mt-2 w-52 z-[100] rounded-xl border bg-white shadow-xl dark:bg-gray-900 dark:border-gray-700 overflow-hidden">
            <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2.5">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{user?.nama || 'User'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{roleLabel(user?.role)}</p>
            </div>

            {/* Switch role Kepala ↔ Guru */}
            {user?.role === 'kepala' && !!user?.can_teach && (
              <button
                onClick={() => { setMenuOpen(false); navigate(teacherMode ? '/admin' : '/guru') }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <Repeat2 size={16} />
                {teacherMode ? 'Mode Manajemen' : 'Mode Guru'}
              </button>
            )}

            <button
              onClick={() => { setMenuOpen(false); navigate(base + '/profile') }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <User size={16} /> Profil Saya
            </button>
            <button
              onClick={() => { setMenuOpen(false); navigate(base + '/change-password') }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Lock size={16} /> Ubah Password
            </button>
            <button
              onClick={() => { setMenuOpen(false); toggleDark() }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              {dark ? 'Mode Terang' : 'Mode Gelap'}
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-gray-100 dark:border-gray-700"
            >
              <LogOut size={16} /> Keluar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
