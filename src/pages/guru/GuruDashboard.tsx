import { useState, useEffect } from 'react'
import { Calendar, ClipboardList, BookOpen, QrCode, MapPin, Users, PenLine, ChevronRight, CheckCircle2, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { Card, StatCard, Badge, Avatar } from '../../components/ui'
import MobileMenuGrid from '../../components/MobileMenuGrid'

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
  const [data, setData] = useState<any>({ jadwal_hari_ini: [], rekap_jurnal: { draft: 0, submitted: 0, approved: 0 }, rombel_count: 0, wali_rombel: [], gtk: null })
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
    <div className="space-y-4">
      {/* Greeting header */}
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left gap-3 min-w-0">
        <Avatar src={data.gtk?.foto || null} name={data.gtk?.nama} size={76} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-gray-500 text-sm">{tanggal}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 font-display">
            {greetingByHour()}, {data.gtk?.nama || 'Guru'} 👋
          </h1>
        </div>
      </div>

      {/* CTA banner */}
      <div className="relative overflow-hidden rounded-2xl bg-primary p-5 text-white shadow-sm shadow-primary/30">
        <div className="absolute -right-8 -top-10 w-40 h-40 bg-white/10 rounded-full"></div>
        <div className="absolute -right-4 -bottom-12 w-32 h-32 bg-white/5 rounded-full"></div>
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-white/80">Jurnal Mengajar</p>
            <h2 className="text-lg sm:text-xl font-bold mt-0.5">Input Jurnal Mengajar</h2>
            <p className="text-sm text-white/80 mt-1">Catat kegiatan pembelajaran hari ini</p>
          </div>
          <button
            onClick={() => navigate('/guru/jurnal')}
            className="shrink-0 inline-flex items-center gap-2 bg-white text-primary px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-white/90 active:scale-95 transition"
          >
            <PenLine size={16} />
            Isi Jurnal
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Jadwal Hari Ini" value={data.jadwal_hari_ini.length + ' JP'} icon={<Calendar size={18} />} gradient="from-blue-500 to-indigo-600" onClick={() => navigate('/guru/jadwal')} />
        <StatCard label="Jurnal Disetujui" value={data.rekap_jurnal.approved} icon={<CheckCircle2 size={18} />} gradient="from-green-500 to-emerald-600" sub={persenApproved + '% selesai'} onClick={() => navigate('/guru/jurnal')} />
        <StatCard label="Jurnal Pending" value={pending} icon={<ClipboardList size={18} />} gradient="from-orange-500 to-amber-600" onClick={() => navigate('/guru/jurnal')} />
        <StatCard label="Rombel Diampu" value={data.rombel_count} icon={<Users size={18} />} gradient="from-purple-500 to-fuchsia-600" onClick={() => navigate('/guru/rombel')} />
        {data.wali_rombel.length > 0 && <StatCard label="Wali Kelas" value={data.wali_rombel.length} icon={<Users size={18} />} gradient="from-rose-500 to-pink-600" sub={data.wali_rombel.map((r: any) => r.nama).join(', ')} onClick={() => navigate('/guru/rombel')} />}
      </div>

      {/* Menu layanan: di bawah card stats, mobile/tablet only */}
      <MobileMenuGrid />

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
              ? 'flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 ring-1 ring-primary/20'
              : 'flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition'
            const tileCls = active
              ? 'flex flex-col items-center justify-center min-w-[64px] rounded-lg bg-primary text-white px-2 py-1.5'
              : 'flex flex-col items-center justify-center min-w-[64px] rounded-lg bg-gray-100 text-gray-700 px-2 py-1.5'
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button onClick={() => navigate('/guru/absensi-siswa')} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-white mb-3">
            <QrCode size={18} />
          </div>
          <h4 className="font-medium text-gray-800">Absensi Siswa</h4>
          <p className="text-sm text-gray-500 mt-1">Input absensi kelas</p>
        </button>
        {data.wali_rombel.length > 0 && (
          <button onClick={() => navigate('/guru/rombel')} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white mb-3">
              <Users size={18} />
            </div>
            <h4 className="font-medium text-gray-800">Kelas Wali Saya</h4>
            <p className="text-sm text-gray-500 mt-1">Pantau siswa dan rombel wali</p>
          </button>
        )}
        <button onClick={() => navigate('/guru/modul-ajar')} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mb-3">
            <BookOpen size={18} />
          </div>
          <h4 className="font-medium text-gray-800">Modul Ajar AI</h4>
          <p className="text-sm text-gray-500 mt-1">Generate modul otomatis</p>
        </button>
      </div>
    </div>
  )
}
