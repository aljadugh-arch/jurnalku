import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  GraduationCap, Users, BookOpen, Layers,
  ClipboardList, DollarSign, FileText,
  Calendar, MapPin, School,
  BarChart3, Activity, TrendingUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { Card } from '../../components/ui'
import { heroColors } from '../../lib/applyTheme'
import MobileHeader from '../../components/MobileHeader'
import MobileMenuSheet from '../../components/MobileMenuSheet'

/* ─── menu items for 2-col grid ─── */
const MENU_ITEMS = [
  { label: 'Absensi Siswa', icon: <ClipboardList size={22} />, color: 'bg-emerald-100 text-emerald-700', path: '/admin/absensi-siswa' },
  { label: 'Absensi Guru', icon: <MapPin size={22} />, color: 'bg-blue-100 text-blue-700', path: '/admin/absensi-guru' },
  { label: 'Jurnal Kelas', icon: <FileText size={22} />, color: 'bg-purple-100 text-purple-700', path: '/admin/jurnal' },
  { label: 'Penilaian', icon: <Activity size={22} />, color: 'bg-indigo-100 text-indigo-700', path: '/admin/rapor' },
  { label: 'Rapor', icon: <GraduationCap size={22} />, color: 'bg-rose-100 text-rose-700', path: '/admin/rapor' },
  { label: 'Agenda Guru', icon: <Calendar size={22} />, color: 'bg-amber-100 text-amber-700', path: '/admin/jadwal' },
  { label: 'Pembayaran SPP', icon: <DollarSign size={22} />, color: 'bg-teal-100 text-teal-700', path: '/admin/tagihan' },
  { label: 'Lainnya', icon: <School size={22} />, color: 'bg-gray-100 text-gray-600', path: '/admin' },
]

/* ─── greeting helper ─── */
function getGreetingName(user: any): string {
  if (!user?.nama) return 'Admin'
  return user.nama.split(' ')[0] || 'Admin'
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Selamat Pagi'
  if (h < 17) return 'Selamat Siang'
  return 'Selamat Malam'
}

/* ─── component ─── */
interface Props {
  stats: any
  loading?: boolean
}

export default function MobileAdminDashboard({ stats }: Props) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuthStore()
  const settings = useSettingsStore(s => s.settings)
  const dark = useThemeStore(s => s.dark)
  const hero = heroColors(settings, dark)

  const greeting = useMemo(() => getGreeting(), [])
  const greetingName = useMemo(() => getGreetingName(user), [user])

  const initials = useMemo(() => {
    if (!user?.nama) return '?'
    return user.nama.split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase()
  }, [user])

  /* ─── stat cards data ─── */
  const statCards = [
    {
      label: 'Siswa',
      value: stats?.total_siswa ?? 0,
      icon: <GraduationCap size={20} />,
      borderColor: 'border-l-blue-500',
      iconBg: 'bg-blue-100 text-blue-600',
      path: '/admin/siswa',
    },
    {
      label: 'Guru',
      value: stats?.total_gtk ?? 0,
      icon: <Users size={20} />,
      borderColor: 'border-l-emerald-500',
      iconBg: 'bg-emerald-100 text-emerald-600',
      path: '/admin/gtk',
    },
    {
      label: 'Kelas',
      value: stats?.total_rombel ?? 0,
      icon: <Layers size={20} />,
      borderColor: 'border-l-purple-500',
      iconBg: 'bg-purple-100 text-purple-600',
      path: '/admin/rombel',
    },
    {
      label: 'Mapel',
      value: stats?.total_mapel ?? 0,
      icon: <BookOpen size={20} />,
      borderColor: 'border-l-orange-500',
      iconBg: 'bg-orange-100 text-orange-600',
      path: '/admin/mapel',
    },
  ]

  /* ─── chart data ─── */
  const chartData = stats?.rekap_absensi ?? []

  return (
    <div className="lg:hidden min-h-screen -mx-4 -mt-3 bg-gray-50 dark:bg-gray-950">
      {/* ─── HEADER ─── */}
      <div className="px-4 pt-5 pb-8 text-white" style={{ background: `linear-gradient(135deg, ${hero}, #0f172a)` }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" className="w-10 h-10 rounded-full object-cover bg-white shadow-sm" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white font-bold text-sm">{initials}</span>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-white font-bold text-sm leading-tight truncate">
                {settings.nama_lembaga || 'Jurnal Madrasah'}
              </h1>
              <p className="text-white/80 text-xs">Admin Sekolah</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MobileHeader basePath="/admin" onBell={() => navigate('/admin/posting')} />
          </div>
        </div>

        {/* ─── GREETING CARD ─── */}
        <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4">
          <p className="text-white font-bold text-lg leading-tight">
            {greeting}, {greetingName} 👋
          </p>
          <p className="text-white/80 text-xs mt-1">
            Jurnal Madrasah — Semoga hari ini penuh keberkahan
          </p>
          <button
            onClick={() => setMenuOpen(true)}
            className="inline-flex items-center gap-1 mt-3 bg-white/20 hover:bg-white/30 active:scale-95 text-white text-xs font-medium px-3 py-1.5 rounded-full transition"
          >
            Lihat Semua
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        {/* ─── STAT CARDS ─── */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map(card => (
            <Link
              key={card.label}
              to={card.path}
              className={`bg-white dark:bg-gray-900 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-800 border-l-4 ${card.borderColor} active:scale-[0.97] transition-transform`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 leading-none">{card.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{card.label}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* ─── MENU GRID ─── */}
        <Card className="!rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Menu Layanan</h3>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-medium active:scale-95 transition-transform"
            >
              Lihat Semua →
            </button>
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {MENU_ITEMS.map(item => (
              <Link
                key={item.label}
                to={item.path}
                className="flex flex-col items-center text-center group active:scale-95 transition-transform"
              >
                <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${item.color} transition-transform group-active:scale-90`}>
                  {item.icon}
                </span>
                <span className="mt-2 text-[11px] leading-4 font-medium text-gray-600 dark:text-gray-300 line-clamp-2">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </Card>

        {/* ─── CHART: REKAP ABSENSI ─── */}
        {chartData.length > 0 && (
          <Card className="!rounded-2xl" title="Rekap Absensi (7 Hari)" icon={<BarChart3 size={16} className="text-emerald-600" />}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hari" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="siswa_hadir" name="Hadir" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="siswa_sakit" name="Sakit" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="siswa_izin" name="Izin" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="siswa_alpha" name="Alpha" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* ─── KEGIATAN HARI INI ─── */}
        <Card className="!rounded-2xl" title="Kegiatan Hari Ini" icon={<Activity size={16} className="text-emerald-600" />}>
          {stats?.jurnal_terbaru?.length > 0 ? (
            <div className="space-y-2.5">
              {stats.jurnal_terbaru.slice(0, 4).map((j: any) => (
                <div key={j.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <ClipboardList size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{j.guru_nama || '-'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {j.mapel_nama} • {j.rombel_nama}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    j.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                      : j.status === 'submitted' ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {j.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center">
              <ClipboardList size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Belum ada kegiatan hari ini</p>
            </div>
          )}
        </Card>

        {/* ─── QUICK STATS ROW ─── */}
        {stats && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="!rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Jurnal Hari Ini</p>
                  <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.jurnal_hari_ini ?? 0}</p>
                </div>
              </div>
            </Card>
            <Card className="!rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <DollarSign size={20} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tagihan Belum Bayar</p>
                  <p className="text-xl font-bold text-gray-800">{stats.tagihan?.belum_bayar ?? 0}</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
      <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
