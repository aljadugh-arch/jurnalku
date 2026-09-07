import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  BarChart3,
  Calendar,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  MapPin,
  School,
  Star,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { heroColors } from '../../lib/applyTheme'
import MobileHeader from '../../components/MobileHeader'
import MobileMenuSheet from '../../components/MobileMenuSheet'

/* ─── greeting helpers ─── */
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 19) return 'Selamat sore'
  return 'Selamat malam'
}

function initialsOf(name?: string) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('')
}

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

  const totalSiswa = stats?.total_siswa ?? 0
  const siswaAktif = stats?.siswa_aktif ?? totalSiswa

  /* ─── quick actions (baris pintasan atas) ─── */
  const quickActions = [
    { label: 'Kelola Siswa', icon: <UserCheck size={20} />, tile: 'bg-emerald-600', path: '/admin/siswa' },
    { label: 'Kelola GTK', icon: <Users size={20} />, tile: 'bg-sky-500', path: '/admin/gtk' },
    { label: 'Jadwal', icon: <Calendar size={20} />, tile: 'bg-violet-500', path: '/admin/jadwal' },
    { label: 'Laporan', icon: <FileText size={20} />, tile: 'bg-orange-500', path: '/admin/rapor' },
  ]

  /* ─── menu layanan ─── */
  const serviceMenu = [
    { label: 'Absensi Siswa', icon: <ClipboardList size={20} />, tile: 'bg-emerald-600', path: '/admin/absensi-siswa' },
    { label: 'Ceklok GTK', icon: <MapPin size={20} />, tile: 'bg-sky-500', path: '/admin/absensi-guru' },
    { label: 'Penilaian', icon: <Star size={20} />, tile: 'bg-violet-500', path: '/admin/rapor' },
    { label: 'Keuangan', icon: <Wallet size={20} />, tile: 'bg-orange-500', path: '/admin/tagihan' },
  ]

  /* ─── notifikasi: diturunkan dari data nyata dashboard ─── */
  const notifications = useMemo(() => {
    const list: { id: string; title: string; subtitle: string; time: string; tone: string; icon: any; path: string }[] = []

    const absensiTotal = stats?.absensi_siswa?.total ?? 0
    const absensiHadir = stats?.absensi_siswa?.hadir ?? 0
    if (absensiTotal === 0) {
      list.push({
        id: 'absensi',
        title: 'Presensi hari ini belum lengkap',
        subtitle: 'Belum ada absensi siswa tercatat',
        time: 'Hari ini',
        tone: 'bg-orange-100 text-orange-600',
        icon: <ClipboardList size={16} />,
        path: '/admin/absensi-siswa',
      })
    } else {
      list.push({
        id: 'absensi',
        title: 'Presensi siswa tercatat',
        subtitle: `${absensiHadir} hadir dari ${absensiTotal} tercatat`,
        time: 'Hari ini',
        tone: 'bg-emerald-100 text-emerald-600',
        icon: <ClipboardList size={16} />,
        path: '/admin/absensi-siswa',
      })
    }

    const jurnalTerbaru = stats?.jurnal_terbaru?.[0]
    if (jurnalTerbaru) {
      list.push({
        id: 'jurnal',
        title: 'Jurnal mengajar terbaru',
        subtitle: `${jurnalTerbaru.mapel_nama || 'Mapel'} · ${jurnalTerbaru.rombel_nama || '-'}`,
        time: String(jurnalTerbaru.created_at || '').slice(11, 16) || '—',
        tone: 'bg-violet-100 text-violet-600',
        icon: <CalendarClock size={16} />,
        path: '/admin/jurnal',
      })
    }

    const belumBayar = stats?.tagihan?.belum_bayar ?? 0
    if (belumBayar > 0) {
      list.push({
        id: 'tagihan',
        title: 'Tagihan belum dibayar',
        subtitle: `${belumBayar} tagihan menunggu pembayaran`,
        time: 'Hari ini',
        tone: 'bg-rose-100 text-rose-600',
        icon: <Wallet size={16} />,
        path: '/admin/tagihan',
      })
    }

    return list.slice(0, 3)
  }, [stats])

  return (
    <div className="lg:hidden min-h-screen -mx-4 -mt-3 bg-slate-50 dark:bg-gray-950 pb-6">
      {/* ── HEADER MINIMALIS: avatar + nama di kiri, bell notif di kanan ── */}
      <div className="px-4 pt-4 pb-2">
        <MobileHeader basePath="/admin" onBell={() => navigate('/admin/posting')} />
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* ── GREETING ── */}
        <div data-admin-greeting="true">
          <p className="text-[13px] text-slate-500 dark:text-gray-400">{greeting},</p>
          <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
            {user?.nama || 'Admin Sekolah'} 👋
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-slate-500 dark:text-gray-400">
            Semoga hari ini berjalan dengan lancar dan penuh keberkahan.
          </p>
        </div>

        {/* ── HERO: Total Siswa ── */}
        <Link
          to="/admin/siswa"
          data-admin-hero="true"
          className="relative block overflow-hidden rounded-3xl p-4 text-white shadow-lg active:scale-[0.99] transition"
          style={{ background: `linear-gradient(135deg, ${hero}, #064e3b)` }}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <School size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-white/80">Total Siswa</p>
              <p className="flex items-baseline gap-1.5">
                <span data-admin-hero-value="true" className="text-3xl font-bold leading-none">{totalSiswa}</span>
                <span className="text-[12px] text-white/80">aktif {siswaAktif !== totalSiswa ? `dari ${totalSiswa}` : ''}</span>
              </p>
            </div>
            <ChevronRight size={20} className="shrink-0 text-white/80" />
          </div>
        </Link>

        {/* ── QUICK ACTIONS ── */}
        <div data-admin-quick-row="true" className="rounded-3xl bg-white p-3 shadow-sm dark:bg-gray-900">
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map(a => (
              <Link
                key={a.label}
                to={a.path}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-1.5 text-center active:scale-95 transition"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${a.tile} text-white shadow-sm`}>
                  {a.icon}
                </span>
                <span className="text-[10px] font-medium leading-tight text-slate-600 dark:text-gray-300">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── MENU LAYANAN ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Menu Layanan</h3>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 active:opacity-70 transition"
            >
              Lihat Semua
              <ChevronRight size={13} />
            </button>
          </div>
          <div data-admin-menu-grid="true" className="grid grid-cols-4 gap-2">
            {serviceMenu.map(item => (
              <Link
                key={item.label}
                to={item.path}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-1.5 text-center active:scale-95 transition"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tile} text-white shadow-sm`}>
                  {item.icon}
                </span>
                <span className="text-[10px] font-medium leading-tight text-slate-600 dark:text-gray-300">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── NOTIFIKASI TERBARU ── */}
        <section data-admin-notif-card="true" className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <span className="relative">
                <Bell size={16} className="text-amber-500" />
                {notifications.length > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                    {notifications.length}
                  </span>
                )}
              </span>
              Notifikasi Terbaru
            </h3>
            <button
              type="button"
              onClick={() => navigate('/admin/posting')}
              className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 active:opacity-70 transition"
            >
              Lihat Semua
              <ChevronRight size={13} />
            </button>
          </div>

          {notifications.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">Belum ada notifikasi</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-gray-800">
              {notifications.map(n => (
                <button
                  key={n.id}
                  data-admin-notif-row="true"
                  onClick={() => navigate(n.path)}
                  className="flex w-full items-center gap-3 py-2.5 text-left first:pt-0 last:pb-0 active:opacity-70 transition"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.tone}`}>
                    {n.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-white">{n.title}</span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{n.subtitle}</span>
                  </span>
                  <span data-admin-notif-time="true" className="shrink-0 text-[11px] text-slate-400">{n.time}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── RINGKASAN LEMBAGA ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <BarChart3 size={16} className="text-emerald-600" />
            Ringkasan Lembaga
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Total GTK', value: stats?.total_gtk ?? 0, caption: 'aktif', icon: <Users size={18} />, tile: 'bg-emerald-100 text-emerald-700' },
              { label: 'Rombel', value: stats?.total_rombel ?? 0, caption: 'kelas', icon: <GraduationCap size={18} />, tile: 'bg-sky-100 text-sky-700' },
              { label: 'Mata Pelajaran', value: stats?.total_mapel ?? 0, caption: 'mapel', icon: <FileText size={18} />, tile: 'bg-violet-100 text-violet-700' },
              { label: 'Jurnal Hari Ini', value: stats?.jurnal_hari_ini ?? 0, caption: 'jurnal', icon: <ClipboardList size={18} />, tile: 'bg-orange-100 text-orange-700' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/60">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.tile}`}>{s.icon}</span>
                <p className="mt-2 text-xl font-bold leading-none text-slate-900 dark:text-white">{s.value}</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">{s.label} · {s.caption}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
