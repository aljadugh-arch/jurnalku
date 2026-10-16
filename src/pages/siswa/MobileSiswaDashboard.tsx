import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  ClipboardCheck,
  Award,
  FileText,
  Wallet,
  BookOpen,
  LayoutGrid,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Receipt,
} from 'lucide-react'
import api from '../../services/api'
import MobileDashboardHeader from '../../components/MobileDashboardHeader'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { heroColors } from '../../lib/applyTheme'

// ─── helpers ───────────────────────────────────────────────────────────────────

function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi,'
  if (h < 15) return 'Selamat siang,'
  if (h < 19) return 'Selamat sore,'
  return 'Selamat malam,'
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

const rupiah = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

// Nominal ringkas untuk kartu 3 kolom di layar kecil (Rp 1,2 jt / Rp 360 rb).
function rupiahSingkat(n: number) {
  const v = Number(n || 0)
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1).replace('.', ',')} jt`
  if (v >= 1_000) return `Rp ${Math.round(v / 1_000)} rb`
  return rupiah(v)
}

// ─── SVG circular progress ring ────────────────────────────────────────────────

function CircularProgress({ percentage = 100, size = 64, strokeWidth = 6 }: { percentage: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#22C55E"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <span className="absolute text-xs font-bold text-emerald-600">
        {Math.round(percentage)}%
      </span>
    </div>
  )
}

// ─── quick action menu items (2 rows x 4 columns) ──────────────────────────────

const MENU_ITEMS = [
  { label: 'Jadwal', icon: Calendar, path: '/siswa/jadwal', color: 'bg-blue-500 text-white' },
  { label: 'Absensi', icon: ClipboardCheck, path: '/siswa/absensi', color: 'bg-emerald-500 text-white' },
  { label: 'Nilai', icon: Award, path: '/siswa/nilai', color: 'bg-purple-500 text-white' },
  { label: 'Tugas', icon: FileText, path: '/siswa/tugas', color: 'bg-orange-500 text-white' },
  { label: 'Keuangan', icon: Wallet, path: '/siswa/tagihan', color: 'bg-pink-500 text-white' },
  { label: 'Tabungan', icon: Wallet, path: '/siswa/tabungan', color: 'bg-sky-500 text-white' },
  { label: 'Perpus', icon: BookOpen, path: '/siswa/perpustakaan', color: 'bg-emerald-600 text-white' },
  { label: 'Lainnya', icon: LayoutGrid, path: '/siswa/menu', color: 'bg-slate-400 text-white' },
]

export default function MobileSiswaDashboard() {
  const [data, setData] = useState<any>({
    siswa: null,
    jadwal_hari_ini: [],
    rekap: { hadir: 0, sakit: 0, izin: 0, alpha: 0 },
  })
  const navigate = useNavigate()
  const settings = useSettingsStore(s => s.settings)
  const { dark } = useThemeStore()

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
  const totalHari = (rekap.hadir || 0) + (rekap.sakit || 0) + (rekap.izin || 0) + (rekap.alpha || 0)
  const attendancePct = totalHari > 0 ? ((rekap.hadir || 0) / totalHari) * 100 : 100
  const nilaiCount = (data?.nilai_detail || []).length
  const hero = heroColors(settings, dark)

  return (
    <div className="min-h-screen -mx-4 -mt-3 bg-[#F8FAFC] pb-8 text-slate-800 dark:bg-gray-950 dark:text-gray-100 sm:-mx-6">
      <div className="px-4 pt-4"><MobileDashboardHeader photo={siswa?.foto || null} /></div>

      <div data-mobile-compact-dashboard="true" className="space-y-3 px-4 pt-3">
        {/* ─── 2. MOTIVATIONAL BANNER (Semangat Belajar) ─────────────── */}
        <div 
          className="relative overflow-hidden rounded-2xl p-4 text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${hero}, #1e1b4b)` }}
        >
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="relative z-10 max-w-[75%]">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-medium backdrop-blur-sm mb-1.5">
              <Sparkles size={11} /> Semangat Baru
            </div>
            <h2 className="text-base font-bold leading-tight">
              Semangat belajar hari ini!
            </h2>
            <p className="text-xs text-blue-100 mt-1 leading-snug">
              Jadilah versi terbaik dari dirimu setiap hari.
            </p>
          </div>
        </div>

        {/* ─── 3. ATTENDANCE PROGRESS CARD ──────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-gray-400 font-medium">Total Kehadiran</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {rekap.hadir || 0} <span className="text-xs font-normal text-slate-400">/ {totalHari || 0} hari</span>
              </p>
            </div>
          </div>
          <CircularProgress percentage={attendancePct} size={52} strokeWidth={5} />
        </div>

        {/* ─── 4. QUICK ACTION GRID (8 TILES) ───────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-gray-800">
          <div className="grid grid-cols-4 gap-y-3.5 gap-x-2">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition group"
                >
                  <div className={`w-11 h-11 rounded-2xl ${item.color} flex items-center justify-center shadow-sm group-hover:shadow transition`}>
                    <Icon size={20} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-gray-300 truncate w-full text-center">
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── 4b. RINGKASAN NILAI / TAGIHAN / TABUNGAN ─────────────── */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={() => navigate('/siswa/nilai')}
            className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 p-3 text-left shadow-sm active:scale-95 transition"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center mb-2">
              <Award size={16} />
            </div>
            <p className="text-[10px] font-medium text-slate-400">Nilai Harian</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {nilaiCount > 0 ? nilaiCount : '—'}
              {nilaiCount > 0 && <span className="text-[10px] font-normal text-slate-400"> entri</span>}
            </p>
          </button>
          <button
            onClick={() => navigate('/siswa/tagihan')}
            className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 p-3 text-left shadow-sm active:scale-95 transition"
          >
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mb-2">
              <Wallet size={16} />
            </div>
            <p className="text-[10px] font-medium text-slate-400">Belum Bayar</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {rupiahSingkat(data?.tagihan?.belum_bayar)}
            </p>
          </button>
          <button
            onClick={() => navigate('/siswa/tabungan')}
            className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 p-3 text-left shadow-sm active:scale-95 transition"
          >
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 flex items-center justify-center mb-2">
              <Wallet size={16} />
            </div>
            <p className="text-[10px] font-medium text-slate-400">Saldo Tabungan</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {rupiahSingkat(data?.tabungan?.saldo)}
            </p>
          </button>
        </div>

        {/* ─── 4c. NILAI TERBARU ─────────────────────────────────────── */}
        {(data?.nilai_detail || []).length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award size={16} className="text-purple-600" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Nilai Terbaru</h2>
              </div>
              <button
                onClick={() => navigate('/siswa/nilai')}
                className="text-xs font-semibold text-purple-600 flex items-center gap-0.5 active:opacity-70 transition"
              >
                Lihat Semua
                <ChevronRight size={13} />
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-gray-800">
              {(data.nilai_detail || []).slice(0, 4).map((n: any, idx: number) => (
                <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.mapel_nama || 'Mata Pelajaran'}</p>
                    <p className="text-[11px] text-slate-400">{n.tanggal || '-'}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold">P {n.pengetahuan ?? '-'}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold">K {n.keaktifan ?? '-'}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold">S {n.sikap ?? '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── 4d. TAGIHAN BELUM BAYAR ───────────────────────────────── */}
        {(data?.tagihan_detail || []).some((t: any) => t.status !== 'lunas') && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-rose-600" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Tagihan</h2>
              </div>
              <button
                onClick={() => navigate('/siswa/tagihan')}
                className="text-xs font-semibold text-rose-600 flex items-center gap-0.5 active:opacity-70 transition"
              >
                Lihat Semua
                <ChevronRight size={13} />
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-gray-800">
              {(data.tagihan_detail || []).filter((t: any) => t.status !== 'lunas').slice(0, 3).map((t: any, idx: number) => (
                <div key={t.id || idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{t.jenis_nama || 'Tagihan'}</p>
                    <p className="text-[11px] text-slate-400 truncate">{t.bulan || '-'} {t.tahun || ''}</p>
                  </div>
                  <p className="text-xs font-bold text-rose-600 shrink-0">{rupiah(t.nominal)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── 5. JADWAL HARI INI ───────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Jadwal Hari Ini</h2>
            </div>
            <button
              onClick={() => navigate('/siswa/jadwal')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 active:opacity-70 transition"
            >
              Lihat Semua
              <ChevronRight size={13} />
            </button>
          </div>

          {jadwal_hari_ini.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Tidak ada jadwal pelajaran hari ini
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-gray-800">
              {jadwal_hari_ini.map((j: any, idx: number) => {
                const active = isCurrent(j)
                return (
                  <div key={j.id || idx} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                        active 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600'
                      }`}>
                        {j.jam_ke || idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {j.mapel_nama || j.mata_pelajaran || 'Mata Pelajaran'}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {j.jam_mulai || '07:00'} - {j.jam_selesai || '08:00'} {j.guru_nama ? `• ${j.guru_nama}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800 shrink-0">
                      Hadir
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
