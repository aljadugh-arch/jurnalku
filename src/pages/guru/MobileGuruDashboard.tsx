import { useState, useEffect } from 'react'
import { BookOpen, ClipboardCheck, ClipboardList, Clock, PenLine, ScrollText, CheckCircle2, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import MobileHeader from '../../components/MobileHeader'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { heroColors } from '../../lib/applyTheme'

/* ─── helpers ─── */
function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat Pagi'
  if (h < 15) return 'Selamat Siang'
  if (h < 19) return 'Selamat Sore'
  return 'Selamat Malam'
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
  const [h, m] = t.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function teacherDisplayName(gtk: any) {
  const name = gtk?.nama || 'Guru'
  return `${String(gtk?.jenis_kelamin || '').toUpperCase() === 'P' ? 'Ibu' : 'Pak'} ${name}`
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
    rombel_count: 0, gtk: null,
  })
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const settings = useSettingsStore(s => s.settings)
  const dark = useThemeStore(s => s.dark)
  const hero = heroColors(settings, dark)

  useEffect(() => {
    api.get('/guru/dashboard')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const cur = nowMinutes()
  const rekap = data.rekap_jurnal || {}
  const draft = rekap.draft ?? 0
  const submitted = rekap.submitted ?? 0
  const approved = rekap.approved ?? 0
  const totalJurnal = (draft + submitted + approved) || (rekap.total ?? 0)
  const persenApproved = totalJurnal > 0 ? Math.round((approved / totalJurnal) * 100) : 0

  // Find currently active schedule
  const activeJadwal = data.jadwal_hari_ini?.find((j: any) => getJadwalStatus(j, cur) === 'active')

  // Sort jadwal by start time
  const sortedJadwal = [...(data.jadwal_hari_ini || [])].sort(
    (a: any, b: any) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai)
  )

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950">
      {/* ── HEADER: hero gradient, aksi akun di baris sendiri agar tidak tertimpa ── */}
      <div className="px-4 pt-6 pb-6 text-white relative" style={{ background: `linear-gradient(135deg, ${hero}, #0f172a)` }}>
        {/* decorative circles dikurung agar hero tidak perlu overflow-hidden (dropdown akun tetap utuh) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/[0.07] rounded-full" />
          <div className="absolute right-12 -bottom-14 w-24 h-24 bg-white/[0.05] rounded-full" />
        </div>

        {/* Baris aksi akun (bell, tema, profil/logout) — terpisah dari nama */}
        <div data-mobile-account-row="true" className="relative z-30 flex items-center justify-end">
          <MobileHeader basePath="/guru" onBell={() => navigate('/guru/posting')} />
        </div>

        {/* Baris identitas: nama tidak lagi berbagi ruang dengan tombol aksi */}
        <div data-mobile-identity-row="true" className="relative z-10 mt-3 flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-bold text-sm shrink-0 border-2 border-white/30">
            {data.gtk?.foto ? (
              <img src={data.gtk.foto} alt={data.gtk?.nama} className="w-full h-full rounded-full object-cover" />
            ) : (
              initials(data.gtk?.nama)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white/80 text-[10px] font-medium tracking-wide leading-none">Guru</p>
            <h1 className="text-base font-bold leading-tight truncate mt-0.5">{data.gtk?.nama || 'Guru'}</h1>
            <p className="text-white/70 text-[11px] leading-none mt-0.5">{data.rombel_count} rombel</p>
          </div>
        </div>
      </div>

      {/* ── Content (lifts over header) ── */}
      <div data-mobile-compact-dashboard="true" className="px-3 -mt-2 relative z-10 pb-5 space-y-3">

        {/* ── GREETING + CURRENT ACTIVITY ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <p className="text-gray-800 font-bold text-sm">
            {greetingByHour()}, {teacherDisplayName(data.gtk)} 👋
          </p>

          {/* Current activity */}
          <div className="mt-2 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Sedang Berlangsung</p>
            </div>
            {activeJadwal ? (
              <div>
                <p className="font-bold text-gray-800 text-sm">{activeJadwal.mapel_nama}</p>
                <p className="text-gray-600 text-xs mt-0.5">
                  {activeJadwal.rombel_nama} · {activeJadwal.jam_mulai} – {activeJadwal.jam_selesai}
                </p>
              </div>
            ) : (
              <p className="text-gray-400 text-xs">Tidak ada jadwal aktif</p>
            )}
          </div>
        </div>

        {/* ── JADWAL HARI INI ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-gray-800 text-sm">Jadwal Hari Ini</h2>
            <button onClick={() => navigate('/guru/jadwal')} className="text-[11px] font-semibold text-blue-600 active:text-blue-800 transition">
              Lihat Semua
            </button>
          </div>

          {sortedJadwal.length === 0 ? (
            <p className="text-gray-400 text-xs text-center py-3">Tidak ada jadwal hari ini</p>
          ) : (
            <div className="space-y-1.5">
              {sortedJadwal.map((j: any, i: number) => {
                const status = getJadwalStatus(j, cur)
                const isActive = status === 'active'
                const isDone = status === 'done'

                return (
                  <button
                    key={j.id || i}
                    onClick={() => navigate(`/guru/jurnal?jadwal_id=${encodeURIComponent(j.id)}`)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                        : isDone
                          ? 'bg-gray-50 text-gray-400 opacity-60'
                          : 'bg-white border border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    {/* Time column */}
                    <div className={`w-14 text-center shrink-0 rounded-lg py-1.5 ${isActive ? 'bg-white/20' : isDone ? 'bg-gray-100' : 'bg-gray-50'}`}>
                      <p className={`text-sm font-bold leading-none ${isActive ? 'text-white' : isDone ? 'text-gray-400' : 'text-gray-700'}`}>
                        {j.jam_mulai}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                        {j.jam_selesai}
                      </p>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isActive ? 'text-white' : isDone ? 'text-gray-400' : 'text-gray-800'}`}>
                        {j.mapel_nama}
                      </p>
                      <p className={`text-xs truncate ${isActive ? 'text-white/70' : 'text-gray-500'}`}>
                        {j.rombel_nama}
                      </p>
                    </div>

                    {/* Status indicator */}
                    {isActive && (
                      <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[10px] font-bold px-2 py-1 rounded-full shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        Aktif
                      </span>
                    )}
                    {isDone && <CheckCircle2 size={16} className="text-gray-300 shrink-0" />}
                    {status === 'upcoming' && <Clock size={16} className="text-gray-300 shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── QUICK ACCESS GRID (2x2) ── */}
        <div className="grid grid-cols-2 gap-2">
          <QuickCard
            label="Absensi Harian"
            color="from-amber-400 to-amber-500"
            bg="bg-amber-50"
            icon={<AlertCircle size={20} className="text-amber-500" />}
            onClick={() => navigate('/guru/absensi-harian')}
          />
          <QuickCard
            label="Catatan Kepribadian"
            color="from-orange-400 to-orange-500"
            bg="bg-orange-50"
            icon={<ScrollText size={20} className="text-orange-500" />}
            onClick={() => navigate('/guru/catatan-kepribadian')}
          />
          <QuickCard
            label="Modul Ajar AI"
            color="from-blue-500 to-blue-600"
            bg="bg-blue-50"
            icon={<BookOpen size={20} className="text-blue-500" />}
            onClick={() => navigate('/guru/modul-ajar')}
          />
          <QuickCard
            label="Jurnal"
            color="from-emerald-400 to-emerald-500"
            bg="bg-emerald-50"
            icon={<ClipboardList size={20} className="text-emerald-500" />}
            onClick={() => navigate('/guru/jurnal')}
          />
        </div>

        {/* ── REKAP JURNAL ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <h2 className="font-bold text-gray-800 text-sm mb-2">Rekap Jurnal</h2>

          {/* Progress bar */}
          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1.5">
            <span>{approved} disetujui dari {totalJurnal} jurnal</span>
            <span className="font-bold text-blue-600">{persenApproved}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: persenApproved + '%' }}
            />
          </div>

          {/* Count breakdown */}
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <div className="rounded-xl bg-gray-50 p-2 text-center">
              <p className="text-lg font-bold text-gray-700">{draft}</p>
              <p className="text-[10px] text-gray-400 font-medium">Draft</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-2 text-center">
              <p className="text-lg font-bold text-amber-600">{submitted}</p>
              <p className="text-[10px] text-gray-400 font-medium">Terkirim</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2 text-center">
              <p className="text-lg font-bold text-emerald-600">{approved}</p>
              <p className="text-[10px] text-gray-400 font-medium">Disetujui</p>
            </div>
          </div>
        </div>

        {/* ── QUICK ACTIONS (bottom) ── */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => navigate('/guru/absensi-guru')}
            className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-xl border border-gray-100 shadow-sm active:scale-95 transition"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white">
              <ClipboardCheck size={18} />
            </div>
            <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">Ceklok Kehadiran</span>
          </button>
          <button
            onClick={() => navigate('/guru/absensi-siswa')}
            className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-xl border border-gray-100 shadow-sm active:scale-95 transition"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-white">
              <AlertCircle size={18} />
            </div>
            <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">Absensi Siswa</span>
          </button>
          <button
            onClick={() => navigate('/guru/jurnal')}
            className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-xl border border-gray-100 shadow-sm active:scale-95 transition"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white">
              <PenLine size={18} />
            </div>
            <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">Isi Jurnal</span>
          </button>
        </div>

      </div>
    </div>
  )
}

/* ── Quick Access Card ── */
function QuickCard({
  label, color, bg, icon, onClick,
}: {
  label: string; color: string; bg: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`${bg} rounded-2xl p-3 flex flex-col items-center justify-center gap-2 min-h-[104px] active:scale-[0.97] transition-all text-center`}
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-sm`}>
        {icon}
      </div>
      <span className="text-xs font-semibold text-gray-700 leading-tight">{label}</span>
    </button>
  )
}
