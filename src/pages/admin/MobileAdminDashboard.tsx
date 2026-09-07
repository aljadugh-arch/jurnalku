import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell, CalendarClock, ChevronRight, ClipboardList,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import api from '../../services/api'
import { adminDashboardShortcuts, parseAdminDashboardShortcutKeys } from '../../lib/adminDashboardShortcuts'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import MobileHeader from '../../components/MobileHeader'
import MobileMenuSheet from '../../components/MobileMenuSheet'


interface Props { stats: any; loading?: boolean }

export default function MobileAdminDashboard({ stats }: Props) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [todaySchedules, setTodaySchedules] = useState<any[]>([])
  const user = useAuthStore(s => s.user)
  const settings = useSettingsStore(s => s.settings)
  const quickMenus = parseAdminDashboardShortcutKeys(settings.dashboard_quick_menus)
    .map(key => adminDashboardShortcuts.find(item => item.key === key))
    .filter(Boolean) as typeof adminDashboardShortcuts

  useEffect(() => {
    api.get('/jadwal/hari-ini').then(res => setTodaySchedules(res.data?.rows || [])).catch(() => setTodaySchedules([]))
  }, [])

  const notifications = useMemo(() => {
    const hadir = Number(stats?.absensi_siswa?.hadir || 0)
    const total = Number(stats?.absensi_siswa?.total || 0)
    const first = todaySchedules[0]
    return [
      {
        title: 'Presensi Hari Ini',
        detail: total ? `${hadir} siswa hadir dari ${total} data presensi` : 'Belum ada presensi siswa tercatat',
        path: '/admin/absensi-siswa', icon: <ClipboardList size={17} />, tone: 'bg-emerald-100 text-emerald-700',
      },
      {
        title: 'Jadwal Mengajar Hari Ini',
        detail: first ? `${first.jam_mulai || '--:--'} · ${first.mapel_nama || first.nama_kegiatan || 'Kegiatan'} · ${first.rombel_nama || '-'}` : 'Tidak ada jadwal mengajar hari ini',
        path: '/admin/kalender-kbm', icon: <CalendarClock size={17} />, tone: 'bg-violet-100 text-violet-700',
      },
    ]
  }, [stats, todaySchedules])

  const chartData = Array.isArray(stats?.rekap_absensi) ? stats.rekap_absensi : []
  const summaryCards = [
    { label: 'Total GTK', value: stats?.total_gtk ?? 0, note: 'GTK terdaftar', tone: 'bg-sky-100 text-sky-700' },
    { label: 'Guru Hadir', value: stats?.absensi_guru?.hadir ?? 0, note: 'hadir hari ini', tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Rombel', value: stats?.total_rombel ?? 0, note: 'kelas aktif', tone: 'bg-violet-100 text-violet-700' },
    { label: 'Mata Pelajaran', value: stats?.total_mapel ?? 0, note: 'mapel tersedia', tone: 'bg-amber-100 text-amber-700' },
  ]

  return (
    <div className="lg:hidden min-h-screen -mx-4 -mt-3 bg-slate-50 pb-8 dark:bg-gray-950">
      <div className="px-4 pb-2 pt-4"><MobileHeader basePath="/admin" onBell={() => navigate('/admin/posting')} /></div>
      <main className="space-y-4 px-4 pt-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-gray-400">Selamat datang,</p>
          <h1 className="text-xl font-bold text-slate-950 dark:text-white">{user?.nama || 'Kepala Lembaga'}</h1>
        </div>

        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Menu Layanan</h2><p className="text-[11px] text-slate-400">Pintasan utama lembaga</p></div>
            <button type="button" onClick={() => setMenuOpen(true)} className="flex items-center gap-0.5 text-xs font-semibold text-primary">Lihat Semua <ChevronRight size={14} /></button>
          </div>
          <div data-admin-menu-grid="true" data-dashboard-quick-menus="dashboard_quick_menus" className="grid grid-cols-4 gap-x-2 gap-y-4">
            {quickMenus.map(item => (
              <Link key={item.key} to={item.path} className="flex min-w-0 flex-col items-center text-center active:scale-95">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm ${item.tile}`}>{item.icon}</span>
                <span className="mt-1.5 w-full text-[10px] font-medium leading-3 text-slate-600 dark:text-gray-300">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Bell size={16} className="text-amber-500" /> Notifikasi Terkini</h2>
            <button type="button" onClick={() => navigate('/admin/posting')} className="text-xs font-semibold text-primary">Lihat Semua</button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-gray-800">
            {notifications.map(item => (
              <button key={item.title} onClick={() => navigate(item.path)} className="flex w-full items-center gap-3 py-3 text-left">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>{item.icon}</span>
                <span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900 dark:text-white">{item.title}</strong><span className="block truncate text-[11px] text-slate-500">{item.detail}</span></span>
                <ChevronRight size={15} className="text-slate-300" />
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3 flex items-end justify-between"><div><p className="text-xs text-slate-500">Total Siswa</p><p className="text-3xl font-bold text-slate-950 dark:text-white">{stats?.total_siswa ?? 0}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">{stats?.siswa_aktif ?? 0} aktif</span></div>
          <h2 className="mb-2 text-xs font-bold text-slate-700 dark:text-gray-200">Rekap Absensi Siswa (7 Hari Terakhir)</h2>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData} margin={{ top: 5, right: 0, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="hari" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip />
              <Bar dataKey="siswa_hadir" name="Hadir" fill="#10b981" radius={[3, 3, 0, 0]} /><Bar dataKey="siswa_alpha" name="Alpha" fill="#f43f5e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="grid grid-cols-2 gap-3">
          {summaryCards.map(item => <div key={item.label} className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900"><span className={`inline-flex rounded-xl px-2.5 py-1 text-[10px] font-semibold ${item.tone}`}>{item.label}</span><p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{item.value}</p><p className="text-[11px] text-slate-500">{item.note}</p></div>)}
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Kehadiran Guru/GTK (7 Hari Terakhir)</h2>
          <ResponsiveContainer width="100%" height={185}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -28, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="hari" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip /><Line type="monotone" dataKey="guru_hadir" name="Guru Hadir" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 3 }} /></LineChart>
          </ResponsiveContainer>
        </section>
      </main>
      <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
