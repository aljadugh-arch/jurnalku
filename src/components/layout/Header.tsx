import { useAuthStore } from '../../stores/authStore'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useThemeStore } from '../../stores/themeStore'
import { Bell, Search, Menu, LogOut, Lock, ChevronDown, User, Sun, Moon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { roleLabel } from '../../lib/roles'

export default function Header() {
  const { user, logout } = useAuthStore()
  const { toggle } = useSidebarStore()
  const { dark, toggle: toggleTheme } = useThemeStore()
  const navigate = useNavigate()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNotif, setShowNotif] = useState(false)

  const base = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'kepala' ? '/admin'
    : user?.role === 'guru' || user?.role === 'wali_kelas' ? '/guru' : '/siswa'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={toggle} className="hidden lg:block text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <Menu size={22} />
          </button>
          <div className="relative hidden sm:block">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari..."
              className="pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-40 sm:w-64"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title={dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
          >
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="relative text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              aria-label="Buka notifikasi"
            >
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-white text-[10px] rounded-full flex items-center justify-center">
                3
              </span>
            </button>
            {showNotif && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotif(false)} />
                <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-[20rem] sm:w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Notifikasi</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">3 notifikasi belum dibaca</p>
                  </div>
                  {[
                    ['Absensi guru', 'Ada guru belum ceklok hari ini'],
                    ['Pembayaran', 'Tagihan siswa perlu dipantau'],
                    ['Tabungan', 'Belum ada transaksi tabungan hari ini'],
                  ].map(([title, body]) => (
                    <button key={title} className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b last:border-b-0 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">{body}</p>
                    </button>
                  ))}
                  <button
                    onClick={() => { navigate(base + '/notif-settings'); setShowNotif(false) }}
                    className="w-full px-4 py-2 text-sm text-primary hover:bg-primary/5"
                  >
                    Pengaturan notifikasi
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)} className="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 py-1">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center overflow-hidden">
                {user?.avatar
                  ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  : <span className="text-white text-sm font-bold">{user?.nama?.charAt(0) || 'U'}</span>}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.nama || 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{roleLabel(user?.role)}</p>
              </div>
              <ChevronDown size={16} className="text-gray-400" />
            </button>
            
            {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-50">
                  <button
                    onClick={() => { navigate(base + '/profile'); setShowDropdown(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
                  >
                    <User size={16} />
                    Profil Saya
                  </button>
                  <button
                    onClick={() => { navigate(base + '/change-password'); setShowDropdown(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <Lock size={16} />
                    Ubah Password
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-b-lg"
                  >
                    <LogOut size={16} />
                    Keluar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
