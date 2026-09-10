import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Bell, Moon, Sun, User, Lock, LogOut, ChevronDown, Repeat2, UserCheck, QrCode, DoorOpen, ClipboardList } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import Avatar from './ui/Avatar'
import api from '../services/api'

type NotifItem = { id: string; event_type: string; label: string; metadata: any; created_at: string }

const NOTIF_ICONS: Record<string, any> = {
  teacher_checkin: UserCheck,
  teacher_checkout: UserCheck,
  student_qr_attendance: QrCode,
  class_session_started: DoorOpen,
  class_session_finished: DoorOpen,
  assignment_created: ClipboardList,
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso + 'Z').getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'Baru saja'
  if (min < 60) return `${min} menit lalu`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} jam lalu`
  return `${Math.floor(hour / 24)} hari lalu`
}

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
  profilePhoto,
  light = false,
}: {
  basePath: string
  onBell?: () => void
  showBell?: boolean
  profilePhoto?: string | null
  light?: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifItems, setNotifItems] = useState<NotifItem[]>([])
  const [notifLoading, setNotifLoading] = useState(false)

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

  const handleBellClick = () => {
    if (onBell) return onBell()
    setNotifOpen(o => !o)
  }

  useEffect(() => {
    if (!notifOpen || onBell) return
    setNotifLoading(true)
    api.get('/notifications/feed', { params: { limit: 20 } })
      .then(res => setNotifItems(res.data || []))
      .catch(() => setNotifItems([]))
      .finally(() => setNotifLoading(false))
  }, [notifOpen, onBell])

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
            src={profilePhoto || user?.avatar}
            name={user?.nama}
            size={42}
            className={light ? "!border-2 !border-white/40 shadow-sm" : "!border-2 !border-slate-200 dark:!border-gray-700 shadow-sm"}
          />
          <ChevronDown size={12} className={light ? "absolute -bottom-0.5 -right-0.5 text-slate-700 bg-white rounded-full border border-white/40 p-[1px] w-3.5 h-3.5" : "absolute -bottom-0.5 -right-0.5 text-slate-500 bg-white dark:bg-gray-800 rounded-full border border-slate-200 dark:border-gray-700 p-[1px] w-3.5 h-3.5"} />
        </button>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setMenuOpen(o => !o)}>
          <p className={light ? "text-[13px] font-bold text-white truncate leading-tight" : "text-[13px] font-bold text-slate-900 dark:text-white truncate leading-tight"}>
            {user?.nama || 'User'}
          </p>
          <p className={light ? "text-[11px] text-white/80 leading-tight" : "text-[11px] text-slate-500 dark:text-gray-400 leading-tight"}>
            {roleLabel(user?.role)}{teacherMode ? ' • Mode Guru' : ''}
          </p>
        </div>
      </div>

      {/* Kanan: Bell notifikasi */}
      {showBell && (
        <button
          onClick={handleBellClick}
          className={light ? "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 active:scale-95 transition" : "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800 active:scale-95 transition"}
          aria-label="Notifikasi"
        >
          <Bell size={19} />
        </button>
      )}

      {/* Dropdown notifikasi aktivitas terkini (ceklok, absensi QR, sesi kelas, dll) */}
      {notifOpen && !onBell && (
        <>
          <div
            className="fixed inset-0 z-[90] bg-black/20 backdrop-blur-[1px]"
            onClick={() => setNotifOpen(false)}
          />
          <div className="absolute right-0 top-12 w-80 max-w-[88vw] z-[100] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:bg-gray-900 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="border-b border-gray-100 dark:border-gray-800 px-4 py-3 bg-slate-50/50 dark:bg-gray-800/40">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Notifikasi Terkini</p>
              <p className="text-xs text-slate-500 dark:text-gray-400">Ceklok, absensi QR, sesi kelas &amp; penugasan</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifLoading && <p className="px-4 py-6 text-center text-xs text-slate-400">Memuat...</p>}
              {!notifLoading && notifItems.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-slate-400">Belum ada aktivitas terbaru.</p>
              )}
              {!notifLoading && notifItems.map(item => {
                const Icon = NOTIF_ICONS[item.event_type] || Bell
                return (
                  <div key={item.id} className="flex items-start gap-3 border-b border-gray-50 dark:border-gray-800 px-4 py-3 last:border-0">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-100">{item.label}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(item.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
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
