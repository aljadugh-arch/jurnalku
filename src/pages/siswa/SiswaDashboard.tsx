import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, BookOpen, Activity, ChevronRight, Clock, ClipboardCheck } from 'lucide-react'
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

export default function SiswaDashboard() {
  const [data, setData] = useState<any>({ siswa: null, jadwal_hari_ini: [], rekap: { hadir: 0, sakit: 0, izin: 0, alpha: 0 } })
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/siswa/dashboard').then(res => setData(res.data)).catch(() => {})
  }, [])

  const totalAbsensi = data.rekap.hadir + data.rekap.sakit + data.rekap.izin + data.rekap.alpha
  const persenHadir = totalAbsensi > 0 ? Math.round((data.rekap.hadir / totalAbsensi) * 100) : 0

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
        <Avatar src={data.siswa?.foto || null} name={data.siswa?.nama} size={76} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-gray-500 text-sm">{tanggal}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 font-display">
            {greetingByHour()}, {data.siswa?.nama || 'Siswa'} 👋
          </h1>
        </div>
      </div>

      {/* CTA banner */}
      <div className="relative overflow-hidden rounded-2xl bg-primary p-5 text-white shadow-sm shadow-primary/30">
        <div className="absolute -right-8 -top-10 w-40 h-40 bg-white/10 rounded-full"></div>
        <div className="absolute -right-4 -bottom-12 w-32 h-32 bg-white/5 rounded-full"></div>
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-white/80">Kehadiran</p>
            <h2 className="text-lg sm:text-xl font-bold mt-0.5">Riwayat Absensi</h2>
            <p className="text-sm text-white/80 mt-1">Pantau catatan kehadiranmu</p>
          </div>
          <button
            onClick={() => navigate('/siswa/absensi')}
            className="shrink-0 inline-flex items-center gap-2 bg-white text-primary px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-white/90 active:scale-95 transition"
          >
            <ClipboardCheck size={16} />
            Lihat
          </button>
        </div>
      </div>

      {/* Rekap Absensi Bulan Ini */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Hadir" value={data.rekap.hadir} icon={<CheckCircle size={18} />} gradient="from-green-500 to-emerald-600" onClick={() => navigate('/siswa/absensi')} />
        <StatCard label="Sakit" value={data.rekap.sakit} icon={<Activity size={18} />} gradient="from-yellow-500 to-amber-600" onClick={() => navigate('/siswa/absensi')} />
        <StatCard label="Izin" value={data.rekap.izin} icon={<Calendar size={18} />} gradient="from-blue-500 to-indigo-600" onClick={() => navigate('/siswa/absensi')} />
        <StatCard label="Alpha" value={data.rekap.alpha} icon={<Activity size={18} />} gradient="from-red-500 to-rose-600" onClick={() => navigate('/siswa/absensi')} />
      </div>

      {/* Menu layanan mobile/tablet: di bawah stat cards */}
      <MobileMenuGrid />

      {/* Persentase Kehadiran */}
      <Card title="Kehadiran Bulan Ini" icon={<CheckCircle size={18} className="text-primary" />}>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>{data.rekap.hadir} hadir dari {totalAbsensi} hari</span>
          <span className="text-lg font-bold text-primary">{persenHadir}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div className="bg-primary h-full rounded-full transition-all" style={{ width: persenHadir + '%' }}></div>
        </div>
      </Card>

      {/* Jadwal Hari Ini */}
      <Card title="Jadwal Hari Ini" icon={<Calendar size={18} className="text-primary" />}>
        <div className="space-y-2">
          {data.jadwal_hari_ini.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">Tidak ada jadwal hari ini</p>
          )}
          {data.jadwal_hari_ini.map((j: any, i: number) => {
            const active = isCurrent(j)
            const rowCls = active
              ? 'flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 ring-1 ring-primary/20'
              : 'flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white'
            const tileCls = active
              ? 'flex flex-col items-center justify-center min-w-[64px] rounded-lg bg-primary text-white px-2 py-1.5'
              : 'flex flex-col items-center justify-center min-w-[64px] rounded-lg bg-gray-100 text-gray-700 px-2 py-1.5'
            return (
              <div key={j.id || i} className={rowCls}>
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
                    <Clock size={12} /> {j.guru_nama}
                  </p>
                </div>
                {active && <ChevronRight size={18} className="text-primary shrink-0" />}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
