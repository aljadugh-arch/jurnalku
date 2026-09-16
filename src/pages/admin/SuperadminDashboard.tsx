import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, CheckCircle2, XCircle, Users, GraduationCap, UserCheck, CreditCard, Gift, Crown, AlertTriangle, CalendarDays, Moon, Sun, LogOut, User, Lock, ChevronDown } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import MobileMenuGrid from '../../components/MobileMenuGrid'

function StatCard({ label, value, icon, gradient, sub, to }: { label: string; value: number; icon: React.ReactNode; gradient: string; sub?: string; to?: string }) {
  const inner = (
    <div className="bg-white border border-gray-200 rounded-xl p-2.5 sm:p-4 hover:shadow-md transition-all group h-full">
      <div className="flex items-center gap-2 sm:items-start sm:justify-between sm:mb-3">
        <div className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 bg-gradient-to-br ${gradient} rounded-lg flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <div className="min-w-0 sm:hidden">
          <div className="text-lg font-extrabold text-gray-900 leading-tight">{value}</div>
          <div className="text-[10px] text-gray-500 truncate">{label}</div>
        </div>
        {sub && <span className="hidden sm:inline text-[11px] text-gray-400 font-medium">{sub}</span>}
      </div>
      <div className="hidden sm:block text-2xl font-extrabold text-gray-900">{value}</div>
      <div className="hidden sm:block text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
  return to ? <Link to={to} className="block">{inner}</Link> : inner
}

export default function SuperadminDashboard() {
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const navigate = useNavigate()
  const [showDropdown, setShowDropdown] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  useEffect(() => {
    api.get('/tenants').then(res => { setTenants(res.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  const total = tenants.length
  const aktif = tenants.filter(t => t.aktif).length
  const nonaktif = total - aktif
  const totalUsers = tenants.reduce((s, t) => s + (t.user_count || 0), 0)
  const totalSiswa = tenants.reduce((s, t) => s + (t.siswa_count || 0), 0)
  const totalGtk = tenants.reduce((s, t) => s + (t.gtk_count || 0), 0)

  const berbayar = tenants.filter(t => t.plan && t.plan !== 'free').length
  const gratis = tenants.filter(t => !t.plan || t.plan === 'free').length
  const now = Date.now()
  const expired = tenants.filter(t => t.expired_at && new Date(t.expired_at).getTime() < now).length

  const statCards = [
    { label: 'Total Lembaga', value: total, icon: <Building2 size={18} />, gradient: 'from-blue-500 to-indigo-600', sub: `${aktif} aktif`, to: '/admin/tenants' },
    { label: 'Lembaga Aktif', value: aktif, icon: <CheckCircle2 size={18} />, gradient: 'from-green-500 to-emerald-600', sub: '', to: '/admin/tenants' },
    { label: 'Lembaga Nonaktif', value: nonaktif, icon: <XCircle size={18} />, gradient: 'from-rose-500 to-red-600', sub: '', to: '/admin/tenants' },
    { label: 'Langganan Berbayar', value: berbayar, icon: <CreditCard size={18} />, gradient: 'from-purple-500 to-violet-600', sub: `${gratis} gratis`, to: '/admin/tenants' },
    { label: 'Langganan Gratis', value: gratis, icon: <Gift size={18} />, gradient: 'from-cyan-500 to-sky-600', sub: '', to: '/admin/tenants' },
    { label: 'Langganan Kadaluarsa', value: expired, icon: <AlertTriangle size={18} />, gradient: 'from-orange-500 to-amber-600', sub: 'perlu perpanjang', to: '/admin/tenants' },
    { label: 'Total Pengguna', value: totalUsers, icon: <Users size={18} />, gradient: 'from-teal-500 to-cyan-600', sub: '', to: '/admin/tenants' },
    { label: 'Total Siswa', value: totalSiswa, icon: <GraduationCap size={18} />, gradient: 'from-indigo-500 to-blue-600', sub: '', to: '/admin/tenants' },
    { label: 'Total GTK', value: totalGtk, icon: <UserCheck size={18} />, gradient: 'from-fuchsia-500 to-pink-600', sub: '', to: '/admin/tenants' },
  ]

  const planColor: Record<string, string> = {
    free: 'bg-gray-100 text-gray-600', basic: 'bg-cyan-100 text-cyan-700',
    pro: 'bg-blue-100 text-blue-700', enterprise: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="space-y-3">
      {/* Mobile/tablet header — hanya tampil di bawah lg (desktop pakai DashboardLayout Header) */}
      <div className="lg:hidden sticky top-0 z-30 -mx-4 -mt-4 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Crown size={18} className="text-amber-500" />
          <span className="font-bold text-sm text-gray-800 dark:text-gray-100">Superadmin</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleDark} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400" title={dark ? 'Mode Terang' : 'Mode Gelap'}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)} className="flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 py-1">
              <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user?.nama?.charAt(0) || 'S'}
              </div>
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border dark:border-gray-700 z-50">
                  <div className="px-4 py-2 border-b dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{user?.nama}</p>
                    <p className="text-xs text-gray-400">Super Admin</p>
                  </div>
                  <button onClick={() => { navigate('/admin/profile'); setShowDropdown(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <User size={16} /> Profil Saya
                  </button>
                  <button onClick={() => { navigate('/admin/change-password'); setShowDropdown(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Lock size={16} /> Ubah Password
                  </button>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-b-lg">
                    <LogOut size={16} /> Keluar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <h1 className="text-xl md:text-2xl font-extrabold text-gray-900">Dashboard Superadmin 👑</h1>
        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5"><CalendarDays size={14} /> {today}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {statCards.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Menu layanan mobile/tablet: di bawah stat cards */}
      <MobileMenuGrid />

      {/* Ringkasan Invoice / Langganan per lembaga */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Crown size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-800">Status Langganan Lembaga</h3>
          </div>
          <Link to="/admin/tenants" className="text-xs text-primary hover:underline">Kelola →</Link>
        </div>
        <div className="divide-y divide-gray-100">
          {tenants.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Belum ada lembaga terdaftar</div>}
          {tenants.map((t) => {
            const isExpired = t.expired_at && new Date(t.expired_at).getTime() < now
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  {(t.nama || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800 text-sm truncate">{t.nama}</div>
                  <div className="text-xs text-gray-500 truncate">{t.siswa_count || 0} siswa · {t.user_count || 0} pengguna</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${planColor[t.plan] || 'bg-gray-100 text-gray-600'}`}>{t.plan || 'free'}</span>
                  <span className={`text-[10px] font-medium ${isExpired ? 'text-red-600' : t.aktif ? 'text-green-600' : 'text-gray-400'}`}>
                    {isExpired ? 'Kadaluarsa' : t.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
