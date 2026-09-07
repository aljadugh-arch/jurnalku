import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell,
  BookOpen,
  Calendar,
  CalendarDays,
  ChevronRight,
  Fingerprint,
  LogIn,
  Star,
  Target,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import MobileHeader from '../../components/MobileHeader'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { heroColors } from '../../lib/applyTheme'

/* ─── helpers ─── */
function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 19) return 'Selamat sore'
  return 'Selamat malam'
}

function longDateJakarta() {
  return new Date().toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function nowMinutes() {
  const wib = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const [h, m] = wib.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function toMinutes(t: string) {
  if (!t) return -1
  const [h, m] = String(t).split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function initials(name?: string) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('')
}

function getJadwalStatus(j: any, cur: number): 'active' | 'done' | 'upcoming' {
  const s = toMinutes(j.jam_mulai)
  const e = toMinutes(j.jam_selesai)
  if (j.sesi_status === 'selesai' || (e >= 0 && cur > e)) return 'done'
  if (s >= 0 && e >= 0 && cur >= s && cur <= e) return 'active'
  return 'upcoming'
}

/* ─── component ─── */
export default function MobileGuruDashboard() {
  const [data, setData] = useState<any>({
    jadwal_hari_ini: [], sesi_kelas_aktif: null,
    rekap_jurnal: { draft: 0, submitted: 0, approved: 0, total: 0 },
    rombel_count: 0, gtk: null, siswa_rombel_count: 0, nilai_siswa_count: 0,
    absensi_hari_ini: 0,
  })
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const settings = useSettingsStore(s => s.settings)
  const dark = useThemeStore(s => s.dark)
  const hero = heroColors(settings, dark)

  const load = useCallback(
    () => api.get('/guru/dashboard').then(res => setData(res.data)).catch(() => {}),
    [],
  )

  useEffect(() => { load() }, [load])

  const cur = nowMinutes()

  const sortedJadwal = useMemo(
    () => [...(data.jadwal_hari_ini || [])].sort(
      (a: any, b: any) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai),
    ),
    [data.jadwal_hari_ini],
  )

  // Reference hero shows the class the teacher should enter next:
  // the one running now, otherwise the earliest upcoming one.
  const nextClass = useMemo(() => {
    const active = sortedJadwal.find((j: any) => getJadwalStatus(j, cur) === 'active')
    if (active) return active
    return sortedJadwal.find((j: any) => getJadwalStatus(j, cur) === 'upcoming') || null
  }, [sortedJadwal, cur])

  const pendingJurnal = useMemo(() => {
    const r = data.rekap_jurnal || {}
    const draft = r.draft ?? 0
    const submitted = r.submitted ?? 0
    return draft + submitted
  }, [data.rekap_jurnal])

  const enterClass = async (jadwal: any) => {
    if (!jadwal?.id) return toast.error('Tidak ada jadwal mengajar hari ini')
    setBusy(true)
    try {
      await api.post('/guru/sesi-kelas/masuk', { jadwal_id: jadwal.id })
      toast.success(`Masuk kelas ${jadwal.rombel_nama || ''}`.trim())
      await load()
      navigate(`/guru/jurnal?jadwal_id=${encodeURIComponent(jadwal.id)}`)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mencatat masuk kelas')
    } finally {
      setBusy(false)
    }
  }

  const quickActions = [
    {
      label: 'Jadwal Mengajar',
      subtitle: `Hari ini ${sortedJadwal.length} jadwal`,
      icon: <BookOpen size={20} />,
      tile: 'bg-blue-500',
      bg: 'bg-blue-50',
      path: '/guru/jadwal',
    },
    {
      label: 'Ceklok Kehadiran',
      subtitle: 'Absen masuk/pulang',
      icon: <Fingerprint size={20} />,
      tile: 'bg-emerald-600',
      bg: 'bg-emerald-50',
      path: '/guru/absensi-guru',
    },
    {
      label: 'Absensi Siswa',
      subtitle: `${data.absensi_hari_ini ?? 0} siswa hari ini`,
      icon: <Users size={20} />,
      tile: 'bg-rose-500',
      bg: 'bg-rose-50',
      path: '/guru/absensi-siswa',
    },
    {
      label: 'Penilaian Siswa',
      subtitle: `${data.nilai_siswa_count ?? 0} penilaian`,
      icon: <Star size={20} />,
      tile: 'bg-violet-500',
      bg: 'bg-violet-50',
      path: '/guru/penilaian-harian',
    },
  ]

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-gray-950 pb-6">
      {/* ── HEADER MINIMALIS: avatar + nama di kiri, bell notif di kanan ── */}
      <div className="px-4 pt-4 pb-2">
        <MobileHeader basePath="/guru" onBell={() => navigate('/guru/posting')} />
      </div>

      <div data-mobile-compact-dashboard="true" className="px-4 space-y-4">
        {/* ── HERO: Fokus Hari Ini ── */}
        <section
          data-guru-focus-card="true"
          className="relative overflow-hidden rounded-3xl p-4 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${hero}, #1e3a8a)` }}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
            <div className="absolute -right-2 bottom-8 h-20 w-20 rounded-full bg-white/[0.07]" />
          </div>

          <button
            onClick={() => navigate('/guru/jurnal')}
            className="relative z-10 w-full text-left active:scale-[0.99] transition"
          >
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/80">
              <Target size={14} />
              Fokus Hari Ini
              <ChevronRight size={16} className="ml-auto text-white/80" />
            </span>
            <h2 className="mt-2 text-2xl font-bold leading-tight">Jurnal Mengajar</h2>
            <p className="mt-1 max-w-[240px] text-[13px] leading-snug text-white/80">
              Catat kegiatan pembelajaran hari ini dengan mudah.
            </p>
          </button>

          {/* nested white next-class card */}
          <div data-guru-next-class="true" className="relative z-10 mt-4 rounded-2xl bg-white p-3 shadow-sm dark:bg-gray-900">
            {nextClass ? (
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15">
                  <BookOpen size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{nextClass.mapel_nama}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-gray-400">
                    {nextClass.jam_mulai} - {nextClass.jam_selesai}
                    {nextClass.rombel_nama ? ` · ${nextClass.rombel_nama}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => enterClass(nextClass)}
                  disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white active:scale-95 transition disabled:opacity-60"
                >
                  <LogIn size={14} />
                  Masuk Kelas
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-gray-800">
                  <BookOpen size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Tidak ada kelas berikutnya</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">Jadwal hari ini sudah selesai</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── QUICK ACTIONS 2x2 ── */}
        <div data-guru-quick-grid="true" className="grid grid-cols-2 gap-3">
          {quickActions.map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              className={`${a.bg} dark:bg-gray-900 rounded-2xl p-3 text-left active:scale-[0.97] transition`}
            >
              <div className="flex items-start justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.tile} text-white shadow-sm`}>
                  {a.icon}
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </div>
              <p className="mt-2.5 text-[13px] font-bold leading-tight text-slate-900 dark:text-white">{a.label}</p>
              <p data-guru-quick-subtitle="true" className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-gray-400">
                {a.subtitle}
              </p>
            </button>
          ))}
        </div>

        {/* ── SCHEDULE LIST ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Calendar size={16} className="text-blue-600" />
              Jadwal Mengajar Hari Ini
            </h2>
            <button
              onClick={() => navigate('/guru/jadwal')}
              className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 active:opacity-70 transition"
            >
              Lihat Semua
              <ChevronRight size={13} />
            </button>
          </div>

          {sortedJadwal.length === 0 ? (
            <p className="py-5 text-center text-xs text-slate-400">Tidak ada jadwal hari ini</p>
          ) : (
            <div className="space-y-2">
              {sortedJadwal.map((j: any, i: number) => {
                const status = getJadwalStatus(j, cur)
                const isDone = status === 'done'
                return (
                  <div
                    key={j.id || i}
                    data-guru-schedule-row="true"
                    className={`flex items-center gap-3 rounded-2xl border p-2.5 transition ${
                      status === 'active'
                        ? 'border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10'
                        : 'border-slate-100 bg-white dark:border-gray-800 dark:bg-gray-900'
                    }`}
                  >
                    <div
                      data-guru-schedule-time="true"
                      className="flex w-[52px] shrink-0 flex-col items-center rounded-xl bg-slate-100 py-1.5 dark:bg-gray-800"
                    >
                      <span className="text-[13px] font-bold leading-none text-slate-800 dark:text-gray-100">{j.jam_mulai}</span>
                      <span className="mt-0.5 text-[10px] leading-none text-slate-400">{j.jam_selesai}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] font-semibold ${isDone ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {j.mapel_nama}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-gray-400">
                        <Users size={11} className="shrink-0" />
                        {j.rombel_nama}
                      </p>
                    </div>

                    <div data-guru-schedule-action="true" className="shrink-0">
                      {isDone ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 dark:bg-gray-800">
                          Selesai
                        </span>
                      ) : (
                        <button
                          onClick={() => enterClass(j)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95 transition disabled:opacity-60"
                        >
                          <LogIn size={12} />
                          Masuk
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
