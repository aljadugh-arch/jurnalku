import { useState, useEffect } from 'react'
import { Calendar, ClipboardList, BookOpen, QrCode, MapPin, Users, PenLine, ChevronRight, CheckCircle2, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { Card, StatCard, Badge, Avatar } from '../../components/ui'

function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat Pagi'
  if (h < 15) return 'Selamat Siang'
  if (h < 19) return 'Selamat Sore'
  return 'Selamat Malam'
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

export default function GuruDashboard() {
  const [data, setData] = useState<any>({ jadwal_hari_ini: [], rekap_jurnal: { draft: 0, submitted: 0, approved: 0 }, rombel_count: 0, gtk: null })
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/guru/dashboard').then(res => setData(res.data)).catch(() => {})
  }, [])

  const pending = data.rekap_jurnal.submitted + data.rekap_jurnal.draft
  const totalJurnal = data.rekap_jurnal.approved + data.rekap_jurnal.submitted + data.rekap_jurnal.draft
  const persenApproved = totalJurnal > 0 ? Math.round((data.rekap_jurnal.approved / totalJurnal) * 100) : 0

  const cur = nowMinutes()
  const isCurrent = (j: any) => {
    const s = toMinutes(j.jam_mulai)
    const e = toMinutes(j.jam_selesai)
    return s >= 0 && e >= 0 && cur >= s && cur <= e
  }

  const tanggal = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[28px] bg-slate-950 p-5 sm:p-6 text-white shadow-xl shadow-slate-200">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,.45),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,.35),transparent_32%)]"></div>
        <div className="relative grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col justify-between gap-8">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar src={data.gtk?.foto || null} name={data.gtk?.nama} size={72} className="shrink-0 ring-4 ring-white/10" />
              <div className="min-w-0">
                <p className="text-sm text-slate-300">{tanggal}</p>
                <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight">
                  {greetingByHour()}, {data.gtk?.nama || 'Guru'} 👋
                </h1>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-indigo-200">Jurnal Mengajar</p>
                <h2 className="text-xl sm:text-2xl font-bold mt-1">Input jurnal hari ini</h2>
                <p className="text-sm text-slate-300 mt-1">Catat kegiatan pembelajaran tanpa mengubah alur kerja.</p>
              </div>
              <button
                onClick={() => navigate('/guru/jurnal')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-black/10 hover:bg-slate-100 active:scale-95 transition"
              >
                <PenLine size={16} />
                Isi Jurnal
              </button>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Progress Jurnal</p>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{persenApproved}%</span>
            </div>
            <div className="mt-5 flex items-end gap-3">
              <p className="text-5xl font-bold tracking-tight">{data.rekap_jurnal.approved}</p>
              <p className="pb-2 text-sm text-slate-300">disetujui dari {totalJurnal}</p>
            </div>
            <div className="mt-5 h-2.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-indigo-300 transition-all" style={{ width: persenApproved + '%' }}></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-lg font-bold">{data.rekap_jurnal.draft}</p><p className="text-slate-300">Draft</p></div>
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-lg font-bold">{data.rekap_jurnal.submitted}</p><p className="text-slate-300">Terkirim</p></div>
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-lg font-bold">{pending}</p><p className="text-slate-300">Pending</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Jadwal Hari Ini" value={data.jadwal_hari_ini.length + ' JP'} icon={<Calendar size={18} />} gradient="from-blue-500 to-indigo-600" />
        <StatCard label="Jurnal Disetujui" value={data.rekap_jurnal.approved} icon={<CheckCircle2 size={18} />} gradient="from-green-500 to-emerald-600" sub={persenApproved + '% selesai'} />
        <StatCard label="Jurnal Pending" value={pending} icon={<ClipboardList size={18} />} gradient="from-orange-500 to-amber-600" />
        <StatCard label="Rombel Diampu" value={data.rombel_count} icon={<Users size={18} />} gradient="from-purple-500 to-fuchsia-600" />
      </div>

      {/* Rekap Jurnal + progress */}
      <Card title="Rekap Jurnal" icon={<ClipboardList size={18} className="text-primary" />}>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>{data.rekap_jurnal.approved} disetujui dari {totalJurnal} jurnal</span>
          <span className="font-semibold text-primary">{persenApproved}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div className="bg-primary h-full rounded-full transition-all" style={{ width: persenApproved + '%' }}></div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div className="rounded-lg bg-gray-50 p-2">
            <p className="text-lg font-bold text-gray-700">{data.rekap_jurnal.draft}</p>
            <p className="text-xs text-gray-500">Draft</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <p className="text-lg font-bold text-amber-600">{data.rekap_jurnal.submitted}</p>
            <p className="text-xs text-gray-500">Terkirim</p>
          </div>
          <div className="rounded-lg bg-green-50 p-2">
            <p className="text-lg font-bold text-green-600">{data.rekap_jurnal.approved}</p>
            <p className="text-xs text-gray-500">Disetujui</p>
          </div>
        </div>
      </Card>

      {/* Jadwal Hari Ini */}
      <Card title="Jadwal Mengajar Hari Ini" icon={<Calendar size={18} className="text-primary" />}>
        <div className="space-y-2">
          {data.jadwal_hari_ini.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">Tidak ada jadwal hari ini</p>
          )}
          {data.jadwal_hari_ini.map((j: any, i: number) => {
            const active = isCurrent(j)
            const rowCls = active
              ? 'flex items-center gap-3 p-3 rounded-2xl border border-primary/30 bg-primary/5 ring-1 ring-primary/20 shadow-sm'
              : 'flex items-center gap-3 p-3 rounded-2xl border border-gray-100 bg-white hover:bg-slate-50 hover:shadow-sm transition'
            const tileCls = active
              ? 'flex flex-col items-center justify-center min-w-[64px] rounded-xl bg-primary text-white px-2 py-1.5'
              : 'flex flex-col items-center justify-center min-w-[64px] rounded-xl bg-slate-100 text-slate-700 px-2 py-1.5'
            return (
              <button
                key={j.id || i}
                onClick={() => navigate('/guru/jurnal')}
                className={rowCls + ' w-full text-left'}
              >
                <div className={tileCls}>
                  <span className="text-sm font-bold leading-none">{j.jam_mulai}</span>
                  <span className="text-[10px] opacity-80 mt-0.5">{j.jam_selesai}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800 truncate">{j.mapel_nama}</p>
                    {active && <Badge tone="blue">Sekarang</Badge>}
                  </div>
                  <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                    <Clock size={12} /> {j.rombel_nama} • {j.ruangan || '-'}
                  </p>
                </div>
                <ChevronRight size={18} className="text-gray-400 shrink-0" />
              </button>
            )
          })}
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => navigate('/guru/absensi-guru')} className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:-translate-y-0.5 hover:shadow-lg transition text-left">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-green-100">
            <MapPin size={18} />
          </div>
          <h4 className="font-medium text-gray-800">Ceklok Kehadiran</h4>
          <p className="text-sm text-gray-500 mt-1">Absen masuk/pulang via GPS</p>
        </button>
        <button onClick={() => navigate('/guru/absensi-siswa')} className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:-translate-y-0.5 hover:shadow-lg transition text-left">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-purple-100">
            <QrCode size={18} />
          </div>
          <h4 className="font-medium text-gray-800">Absensi Siswa</h4>
          <p className="text-sm text-gray-500 mt-1">Input absensi kelas</p>
        </button>
        <button onClick={() => navigate('/guru/modul-ajar')} className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:-translate-y-0.5 hover:shadow-lg transition text-left">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-100">
            <BookOpen size={18} />
          </div>
          <h4 className="font-medium text-gray-800">Modul Ajar AI</h4>
          <p className="text-sm text-gray-500 mt-1">Generate modul otomatis</p>
        </button>
      </div>
    </div>
  )
}
