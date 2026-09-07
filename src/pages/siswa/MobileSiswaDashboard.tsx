import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock,
  BookOpen,
  Activity,
  Calendar,
  ClipboardCheck,
  FileText,
  Award,
  GraduationCap,
  CalendarCheck,
  NotebookPen,
  ChevronRight,
} from 'lucide-react'
import api from '../../services/api'
import MobileHeader from '../../components/MobileHeader'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { heroColors } from '../../lib/applyTheme'

// ─── helpers ───────────────────────────────────────────────────────────────────

function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat Pagi'
  if (h < 15) return 'Selamat Siang'
  if (h < 19) return 'Selamat Sore'
  return 'Selamat Malam'
}

function getDayName() {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    timeZone: 'Asia/Jakarta',
  })
}

function getFormattedDate() {
  return new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
}

function getInitials(name?: string) {
  if (!name) return 'S'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function toMinutes(t: string) {
  if (!t) return -1
  const parts = String(t).split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1] || '0', 10)
  if (isNaN(h)) return -1
  return h * 60 + m
}

// ─── attendance ring (pure CSS conic-gradient) ──────────────────────────────────

function AttendanceRing({
  hadir,
  sakit,
  izin,
  alpha,
}: {
  hadir: number
  sakit: number
  izin: number
  alpha: number
}) {
  const total = hadir + sakit + izin + alpha
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-28 h-28 rounded-full border-[9px] border-gray-100 flex items-center justify-center">
          <span className="text-sm text-gray-400 text-center px-2">Belum ada data</span>
        </div>
      </div>
    )
  }

  const pctHadir = (hadir / total) * 100
  const pctSakit = (sakit / total) * 100
  const pctIzin = (izin / total) * 100
  // alpha fills the remainder

  const gradParts: string[] = []
  let cum = 0
  if (hadir > 0) {
    gradParts.push(`#22c55e ${cum}% ${cum + pctHadir}%`)
    cum += pctHadir
  }
  if (sakit > 0) {
    gradParts.push(`#f59e0b ${cum}% ${cum + pctSakit}%`)
    cum += pctSakit
  }
  if (izin > 0) {
    gradParts.push(`#3b82f6 ${cum}% ${cum + pctIzin}%`)
    cum += pctIzin
  }
  if (alpha > 0) {
    gradParts.push(`#ef4444 ${cum}% 100%`)
  }

  const bg = `conic-gradient(${gradParts.join(', ')})`

  const legend = [
    { label: 'Hadir', value: hadir, color: 'bg-green-500' },
    { label: 'Sakit', value: sakit, color: 'bg-amber-500' },
    { label: 'Izin', value: izin, color: 'bg-blue-500' },
    { label: 'Alpha', value: alpha, color: 'bg-red-500' },
  ]

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Ring */}
      <div className="relative w-28 h-28" style={{ background: bg, borderRadius: '50%' }}>
        {/* inner circle to create donut */}
        <div className="absolute inset-0 m-auto w-[76px] h-[76px] rounded-full bg-white flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-gray-800">{total}</span>
          <span className="text-[10px] text-gray-400 -mt-0.5">total hari</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${l.color} shrink-0`} />
            <span className="text-xs text-gray-500">{l.label}</span>
            <span className="text-xs font-semibold text-gray-700 ml-auto">{l.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── schedule item colours ──────────────────────────────────────────────────────

const SCHEDULE_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-pink-500',
]

// ─── menu grid config ───────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { label: 'Absensi', icon: ClipboardCheck, path: '/siswa/absensi', color: 'bg-emerald-500' },
  { label: 'Jadwal', icon: Calendar, path: '/siswa/jadwal', color: 'bg-blue-500' },
  { label: 'Tugas', icon: FileText, path: '/siswa/tugas', color: 'bg-orange-500' },
  { label: 'Nilai', icon: Award, path: '/siswa/nilai', color: 'bg-violet-500' },
  { label: 'Absensi Mapel', icon: GraduationCap, path: '/siswa/absensi-mapel', color: 'bg-indigo-500' },
  { label: 'Kegiatan', icon: CalendarCheck, path: '/siswa/kegiatan', color: 'bg-cyan-500' },
  { label: 'Ujian', icon: BookOpen, path: '/siswa/ujian', color: 'bg-rose-500' },
  { label: 'Tugas Siswa', icon: NotebookPen, path: '/siswa/tugas-siswa', color: 'bg-pink-500' },
]

// ─── main component ─────────────────────────────────────────────────────────────

export default function MobileSiswaDashboard() {
  const [data, setData] = useState<any>({
    siswa: null,
    jadwal_hari_ini: [],
    rekap: { hadir: 0, sakit: 0, izin: 0, alpha: 0 },
  })
  const navigate = useNavigate()
  const settings = useSettingsStore(s => s.settings)
  const dark = useThemeStore(s => s.dark)
  const hero = heroColors(settings, dark)

  useEffect(() => {
    api
      .get('/siswa/dashboard')
      .then((res) => setData(res.data))
      .catch(() => {})
  }, [])

  const cur = nowMinutes()
  const isCurrent = (j: any) => {
    const s = toMinutes(j.jam_mulai)
    const e = toMinutes(j.jam_selesai)
    return s >= 0 && e >= 0 && cur >= s && cur <= e
  }

  const { siswa, jadwal_hari_ini, rekap } = data

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-6">
      {/* ─── 1. HEADER: aksi akun terpisah dari nama agar tidak saling tertimpa ─── */}
      <div className="px-4 pt-6 pb-6 text-white relative" style={{ background: `linear-gradient(135deg, ${hero}, #0f172a)` }}>
        {/* dekorasi dikurung sendiri; hero tidak overflow-hidden agar dropdown akun/logout utuh */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -left-6 bottom-0 w-24 h-24 rounded-full bg-white/5" />
        </div>

        {/* Baris aksi akun */}
        <div data-mobile-account-row="true" className="relative z-30 flex items-center justify-end">
          <MobileHeader basePath="/siswa" onBell={() => navigate('/siswa/posting')} />
        </div>

        {/* Baris identitas siswa */}
        <div data-mobile-identity-row="true" className="relative z-10 mt-3 flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 text-base font-bold border-2 border-white/30">
            {getInitials(siswa?.nama)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-blue-100 leading-none">
              {greetingByHour()}, 👋
            </p>
            <h1 className="text-base font-bold leading-tight truncate mt-0.5">
              {siswa?.nama || 'Siswa'}
            </h1>
            {siswa?.kelas_nama && (
              <p className="text-[11px] text-blue-200 mt-0.5 truncate leading-none">{siswa.kelas_nama}</p>
            )}
          </div>
        </div>
      </div>

      <div data-mobile-compact-dashboard="true" className="px-3 -mt-2 relative z-10 pb-5 space-y-3">
        {/* ─── 2. DATE INFO CARD ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar size={15} className="text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-800">Informasi Hari Ini</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Hari</p>
              <p className="text-sm font-bold text-gray-800">{getDayName()}</p>
            </div>
            <div className="border-x border-gray-100 px-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Tanggal</p>
              <p className="text-sm font-bold text-gray-800 leading-tight">{getFormattedDate()}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Jam Sekolah</p>
              <p className="text-sm font-bold text-gray-800">07:00 – 15:00</p>
            </div>
          </div>
        </div>

        {/* ─── 3. ATTENDANCE RING ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
              <Activity size={15} className="text-green-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-800">Rekap Kehadiran</h2>
          </div>
          <AttendanceRing
            hadir={rekap.hadir}
            sakit={rekap.sakit}
            izin={rekap.izin}
            alpha={rekap.alpha}
          />
        </div>

        {/* ─── 4. SCHEDULE LIST ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Clock size={15} className="text-indigo-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Jadwal Hari Ini</h2>
            </div>
            <button
              onClick={() => navigate('/siswa/jadwal')}
              className="text-xs text-blue-600 font-medium active:opacity-60 transition"
            >
              Lihat Semua
            </button>
          </div>

          {jadwal_hari_ini.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Tidak ada jadwal hari ini</p>
          ) : (
            <div className="space-y-1.5">
              {jadwal_hari_ini.map((j: any, i: number) => {
                const active = isCurrent(j)
                const accentColor = SCHEDULE_COLORS[i % SCHEDULE_COLORS.length]

                return (
                  <div
                    key={j.id || i}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                      active
                        ? 'border-blue-200 bg-blue-50/60 ring-1 ring-blue-100'
                        : 'border-gray-100 bg-white'
                    }`}
                  >
                    {/* left colour accent */}
                    <div className={`w-1 self-stretch rounded-full shrink-0 ${accentColor} ${active ? 'opacity-100' : 'opacity-60'}`} />

                    {/* time block */}
                    <div
                      className={`flex flex-col items-center justify-center min-w-[52px] rounded-lg px-2 py-1.5 shrink-0 ${
                        active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <span className="text-xs font-bold leading-none">{j.jam_mulai}</span>
                      <span className="text-[9px] opacity-80 mt-0.5">{j.jam_selesai}</span>
                    </div>

                    {/* subject info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{j.mapel_nama}</p>
                      <p className="text-[11px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                        <BookOpen size={10} className="shrink-0" />
                        {j.guru_nama}
                        {j.ruang ? ` · ${j.ruang}` : ''}
                      </p>
                    </div>

                    {active && <ChevronRight size={16} className="text-blue-500 shrink-0" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── 5. MENU GRID ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">Menu</h2>
          <div className="grid grid-cols-4 gap-2">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="flex flex-col items-center gap-1.5 py-2 rounded-xl active:bg-gray-50 active:scale-95 transition"
                >
                  <div
                    className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center text-white shadow-sm`}
                  >
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-medium text-gray-600 leading-tight text-center">
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
