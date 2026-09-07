import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Moon, Sun, LogOut, Lock, User, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import Avatar from './ui/Avatar'
import { roleLabel } from '../lib/roles'

/**
 * Header mobile/tablet untuk dashboard (admin, guru, siswa, bendahara).
 * Menggantikan fungsi Header global (profil, ganti password, logout, toggle theme)
 * yang disembunyikan di mobile — tombol theme berdampingan dengan bell notifikasi,
 * dan foto profil admin/avatar menggantikan dropdown profil header.
 */
export default function MobileHeader({
  basePath,
  onBell,
  showBell = true,
  variant = 'hero',
}: {
  basePath: string
  onBell: () => void
  /** Set false when the page already renders its own notification button (reference design). */
  showBell?: boolean
  /** 'hero' = white-on-gradient (default). 'light' = for light page backgrounds. */
  variant?: 'hero' | 'light'
}) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)

  const base = useMemo(() => {
    if (basePath) return basePath
    if (!user?.role) return '/'
    if (user.role === 'siswa' || user.role === 'wali_murid') return '/siswa'
    if (user.role === 'guru' || user.role === 'wali_kelas') return '/guru'
    return '/admin'
  }, [basePath, user?.role])

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  const light = variant === 'light'
  const btnClass = light
    ? 'bg-slate-50 text-slate-700 ring-1 ring-slate-100 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700'
    : 'bg-white/15 text-white backdrop-blur-sm'
  const chevronClass = light ? 'text-slate-500 dark:text-gray-300' : 'text-white/90'
  const avatarRing = light ? '!border-2 !border-slate-200 !shadow-none' : '!border-2 !border-white/40 !shadow-none'

  return (
    <div className="flex items-center gap-2 shrink-0">
      {/* Bell notifikasi (fungsi header asli sudah dipindah dari Header global) */}
      {showBell && (
        <button
          onClick={onBell}
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-95 transition ${btnClass}`}
          aria-label="Posting"
        >
          <Bell size={20} />
        </button>
      )}

      {/* Theme toggle. Pada varian 'light' tombol ini pindah ke dalam dropdown akun
          agar baris header tidak memakan lebar nama (desain referensi). */}
      {!light && (
        <button
          onClick={toggleDark}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-95 transition ${btnClass}`}
          title={dark ? 'Mode Terang' : 'Mode Gelap'}
        >
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      )}

      {/* Foto profil: menggantikan dropdown header (profil, ganti password, logout) */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className={`flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 active:scale-95 transition ${btnClass}`}
          aria-label="Menu akun"
        >
          <Avatar src={user?.avatar} name={user?.nama} size={34} className={avatarRing} />
          <ChevronDown size={14} className={chevronClass} />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-[90]"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-52 z-[100] rounded-lg border bg-white shadow-xl dark:bg-gray-900 dark:border-gray-700 overflow-hidden">
              <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2.5">
                <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{user?.nama || 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{roleLabel(user?.role)}</p>
              </div>
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
              {light && (
                <button
                  onClick={() => { setMenuOpen(false); toggleDark() }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {dark ? <Sun size={16} /> : <Moon size={16} />}
                  {dark ? 'Mode Terang' : 'Mode Gelap'}
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut size={16} /> Keluar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}