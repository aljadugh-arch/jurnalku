import { useState, useEffect } from 'react'
import {
  Users, GraduationCap, BookOpen,
  ClipboardList, UserCheck, TrendingUp, DollarSign, Layers, DoorOpen, Clock
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import api from '../../services/api'
import { PageHeader, Card, StatCard, Badge } from '../../components/ui'
import { Link } from 'react-router-dom'
import MobileMenuGrid from '../../components/MobileMenuGrid'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

const todayJakarta = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const ATTENDANCE_CATEGORIES = [
  ['QR Masuk/Pulang', 'qr_masuk_pulang'], ['Mata Pelajaran', 'mapel'], ['Jamaah', 'jamaah'],
  ['Kokurikuler', 'kokurikuler'], ['Ekstrakurikuler', 'ekskul'], ['Kegiatan Lain', 'kegiatan_lain'],
] as const

const ATTENDANCE_STATUSES = [
  ['Hadir', 'hadir', 'text-emerald-700'], ['Sakit', 'sakit', 'text-amber-700'],
  ['Izin', 'izin', 'text-blue-700'], ['Alpha', 'alpha', 'text-red-700'], ['Lain', 'lain', 'text-gray-600'],
] as const

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [classMonitor, setClassMonitor] = useState<any>({ sessions: [], summary: { aktif: 0, selesai: 0, terlambat: 0, total: 0 } })
  const [monitoring, setMonitoring] = useState<any>(null)
  const [attendanceOverview, setAttendanceOverview] = useState<any>(null)
  const [attendanceDate, setAttendanceDate] = useState(todayJakarta)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats').then(res => {
      setStats(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
    const loadClassMonitor = () => api.get('/admin/sesi-kelas/hari-ini').then(res => setClassMonitor(res.data)).catch(() => {})
    const loadMonitoring = () => api.get('/admin/monitoring').then(res => setMonitoring(res.data)).catch(() => {})
    loadClassMonitor()
    loadMonitoring()
    const timer = window.setInterval(loadClassMonitor, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    api.get('/admin/rekap-kehadiran', { params: { tanggal: attendanceDate } })
      .then(res => setAttendanceOverview(res.data)).catch(() => setAttendanceOverview(null))
  }, [attendanceDate])

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Memuat dashboard...</div>
  if (!stats) return <div className="text-center py-20 text-gray-400">Gagal memuat data</div>

  const statCards = [
    { label: 'Total Siswa', value: stats.total_siswa, icon: <GraduationCap size={20} />, gradient: 'from-blue-500 to-indigo-600', sub: `${stats.siswa_aktif} aktif`, path: '/admin/siswa' },
    { label: 'Total GTK', value: stats.total_gtk, icon: <Users size={20} />, gradient: 'from-green-500 to-emerald-600', sub: `${stats.gtk_aktif} aktif`, path: '/admin/gtk' },
    { label: 'Rombel', value: stats.total_rombel, icon: <Layers size={20} />, gradient: 'from-purple-500 to-violet-600', sub: '', path: '/admin/rombel' },
    { label: 'Mata Pelajaran', value: stats.total_mapel, icon: <BookOpen size={20} />, gradient: 'from-orange-500 to-amber-600', sub: '', path: '/admin/mapel' },
    { label: 'Jurnal Hari Ini', value: stats.jurnal_hari_ini, icon: <ClipboardList size={20} />, gradient: 'from-cyan-500 to-sky-600', sub: '', path: '/admin/jurnal' },
    { label: 'Tagihan Belum Bayar', value: stats.tagihan?.belum_bayar || 0, icon: <DollarSign size={20} />, gradient: 'from-rose-500 to-red-600', sub: `${stats.tagihan?.lunas || 0} lunas`, path: '/admin/tagihan' },
  ]

  const absensiSiswaPersen = stats.absensi_siswa.total > 0 ? Math.round(stats.absensi_siswa.hadir / stats.absensi_siswa.total * 100) : 0
  const absensiGuruPersen = stats.absensi_guru.total > 0 ? Math.round(stats.absensi_guru.hadir / stats.absensi_guru.total * 100) : 0

  const pieData = [
    { name: 'Hadir', value: stats.absensi_siswa.hadir || 0 },
    { name: 'Tidak Hadir', value: (stats.absensi_siswa.total - stats.absensi_siswa.hadir) || 0 },
  ]

  return (
    <div className="space-y-3">
      <PageHeader title="Dashboard" subtitle="Ringkasan data sekolah/madrasah hari ini" />
      <MobileMenuGrid />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {statCards.map((stat) => (
          <Link key={stat.label} to={stat.path} className="block active:scale-[0.98] transition-transform">
            <StatCard label={stat.label} value={stat.value} icon={stat.icon} gradient={stat.gradient} sub={stat.sub} />
          </Link>
        ))}
      </div>

      <Card title="Pemantauan Guru Masuk Kelas" icon={<DoorOpen size={18} className="text-emerald-600" />}>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-emerald-50 p-2"><p className="text-lg font-bold text-emerald-700">{classMonitor.summary?.aktif || 0}</p><p className="text-gray-500">Aktif</p></div>
          <div className="rounded-lg bg-blue-50 p-2"><p className="text-lg font-bold text-blue-700">{classMonitor.summary?.selesai || 0}</p><p className="text-gray-500">Selesai</p></div>
          <div className="rounded-lg bg-amber-50 p-2"><p className="text-lg font-bold text-amber-700">{classMonitor.summary?.terlambat || 0}</p><p className="text-gray-500">Terlambat</p></div>
        </div>
        {classMonitor.sessions?.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">Belum ada guru yang menekan Masuk Kelas hari ini</p>
        ) : (
          <div className="space-y-2">
            {classMonitor.sessions.map((session: any) => (
              <div key={session.id} className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800">{session.guru_nama}</p>
                  <p className="text-sm text-gray-500">{session.rombel_nama} • {session.mapel_nama} • {session.jam_mulai}–{session.jam_selesai}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500"><Clock size={12} /> Masuk {session.waktu_masuk}{session.waktu_selesai ? ` • Selesai ${session.waktu_selesai}` : ''}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {Number(session.menit_terlambat) > 0 && <Badge tone="yellow">Terlambat {session.menit_terlambat} menit</Badge>}
                  <Badge tone={session.status === 'aktif' ? 'green' : 'blue'}>{session.status === 'aktif' ? 'Di Kelas' : 'Selesai'}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Pemantauan Aktivitas & Penugasan" icon={<ClipboardList size={18} className="text-primary" />}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center text-xs">
          <div className="rounded-lg bg-indigo-50 p-2"><p className="text-lg font-bold text-indigo-700">{monitoring?.assignments?.total || 0}</p><p className="text-gray-500">Penugasan</p></div>
          <div className="rounded-lg bg-cyan-50 p-2"><p className="text-lg font-bold text-cyan-700">{monitoring?.student_qr?.total || 0}</p><p className="text-gray-500">Siswa QR</p></div>
          <div className="rounded-lg bg-emerald-50 p-2"><p className="text-lg font-bold text-emerald-700">{monitoring?.teacher_checkins?.total || 0}</p><p className="text-gray-500">Guru Ceklok</p></div>
          <div className="rounded-lg bg-amber-50 p-2"><p className="text-lg font-bold text-amber-700">{monitoring?.class_sessions?.total || 0}</p><p className="text-gray-500">Masuk Kelas</p></div>
        </div>
        {monitoring?.assignments?.rows?.length > 0 && <div className="mt-3 space-y-2">
          {monitoring.assignments.rows.slice(0, 5).map((task: any) => <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-2.5">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{task.judul}</p><p className="truncate text-xs text-gray-500">{task.guru_nama || '-'} • {task.rombel_nama || '-'} • {task.students || 0} siswa</p></div>
            <Badge tone="blue">{task.deadline ? `Batas ${task.deadline}` : 'Tanpa batas'}</Badge>
          </div>)}
        </div>}
      </Card>

      <Card title="Rekap Kehadiran Siswa" icon={<UserCheck size={18} className="text-primary" />}>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">Setiap scan masuk dan pulang dihitung sebagai satu kejadian.</p>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Tanggal
            <input type="date" value={attendanceDate} onChange={event => setAttendanceDate(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {ATTENDANCE_CATEGORIES.map(([label, key]) => {
            const recap = attendanceOverview?.[key] || {}
            return <div key={key} className="rounded-xl border border-gray-100 p-2.5">
              <p className="text-xs font-medium text-gray-600">{label}</p>
              <p className="mb-1.5 text-lg font-bold text-gray-800">{recap.hadir || 0}<span className="ml-1 text-xs font-normal text-gray-400">/{recap.total || 0}</span></p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                {ATTENDANCE_STATUSES.map(([statusLabel, statusKey, color]) => <span key={statusKey} className={color}>{statusLabel} {recap[statusKey] || 0}</span>)}
              </div>
            </div>
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Kehadiran Hari Ini */}
        <Card title="Kehadiran Hari Ini" icon={<UserCheck size={18} className="text-primary" />}>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Siswa</span>
                <span className="font-medium">{stats.absensi_siswa.hadir}/{stats.absensi_siswa.total} ({absensiSiswaPersen}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-500 rounded-full h-2.5 transition-all" style={{ width: `${absensiSiswaPersen}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">GTK/Guru</span>
                <span className="font-medium">{stats.absensi_guru.hadir}/{stats.absensi_guru.total} ({absensiGuruPersen}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-green-500 rounded-full h-2.5 transition-all" style={{ width: `${absensiGuruPersen}%` }} />
              </div>
            </div>
          </div>

          {stats.absensi_siswa.total > 0 && (
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={5} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-full inline-block"></span> Hadir</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-full inline-block"></span> Tidak Hadir</span>
              </div>
            </div>
          )}
        </Card>

        {/* Chart Rekap Absensi 7 Hari */}
        <div className="lg:col-span-2">
          <Card title="Rekap Absensi Siswa (7 Hari Terakhir)" icon={<TrendingUp size={18} className="text-primary" />}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.rekap_absensi} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hari" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="siswa_hadir" name="Hadir" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="siswa_sakit" name="Sakit" fill="#f59e0b" radius={[4,4,0,0]} />
                <Bar dataKey="siswa_izin" name="Izin" fill="#8b5cf6" radius={[4,4,0,0]} />
                <Bar dataKey="siswa_alpha" name="Alpha" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Chart Kehadiran Guru 7 Hari */}
        <Card title="Kehadiran Guru (7 Hari Terakhir)" icon={<Users size={18} className="text-green-600" />}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.rekap_absensi} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hari" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="guru_hadir" name="Guru Hadir" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Jurnal Mengajar Terbaru */}
        <Card title="Jurnal Mengajar Terbaru" icon={<ClipboardList size={18} className="text-primary" />}>
          {stats.jurnal_terbaru.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Belum ada jurnal</p>
          ) : (
            <div className="space-y-2.5">
              {stats.jurnal_terbaru.map((j: any) => (
                <div key={j.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{j.guru_nama || '-'}</p>
                    <p className="text-xs text-gray-500 truncate">{j.mapel_nama} &bull; {j.rombel_nama} &bull; {j.tanggal}</p>
                  </div>
                  <Badge tone={j.status === 'approved' ? 'green' : j.status === 'submitted' ? 'blue' : 'yellow'}>{j.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
