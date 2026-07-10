import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, GraduationCap, BookOpen, ClipboardList, UserCheck,
  TrendingUp, DollarSign, Layers, Plus, ArrowRight, CalendarDays, Activity
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#ec4899']

function StatCard({ label, value, icon, gradient, sub }: { label: string; value: number; icon: React.ReactNode; gradient: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 bg-gradient-to-br ${gradient} rounded-lg flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        {sub && <span className="text-[11px] text-gray-400 font-medium">{sub}</span>}
      </div>
      <div className="text-2xl font-extrabold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function Card({ title, icon, children, className = '' }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
        {icon}
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    yellow: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    gray: 'bg-gray-50 text-gray-600 border-gray-100',
  }
  return <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${tones[tone] || tones.gray}`}>{children}</span>
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()

  useEffect(() => {
    api.get('/dashboard/stats').then(res => {
      setStats(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 11) return 'Selamat Pagi'
    if (h < 15) return 'Selamat Siang'
    if (h < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  }

  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <Activity size={24} className="text-gray-300 animate-pulse mb-3" />
      <p className="text-sm text-gray-400">Memuat dashboard...</p>
    </div>
  )
  if (!stats) return <div className="text-center py-20 text-gray-400 text-sm">Gagal memuat data</div>

  const statCards = [
    { label: 'Total Siswa', value: stats.total_siswa, icon: <GraduationCap size={18} />, gradient: 'from-blue-500 to-indigo-600', sub: `${stats.siswa_aktif} aktif` },
    { label: 'Total GTK', value: stats.total_gtk, icon: <Users size={18} />, gradient: 'from-green-500 to-emerald-600', sub: `${stats.gtk_aktif} aktif` },
    { label: 'Rombel', value: stats.total_rombel, icon: <Layers size={18} />, gradient: 'from-purple-500 to-violet-600', sub: '' },
    { label: 'Mapel', value: stats.total_mapel, icon: <BookOpen size={18} />, gradient: 'from-orange-500 to-amber-600', sub: '' },
    { label: 'Jurnal Hari Ini', value: stats.jurnal_hari_ini, icon: <ClipboardList size={18} />, gradient: 'from-cyan-500 to-sky-600', sub: '' },
    { label: 'Tagihan Belum Bayar', value: stats.tagihan?.belum_bayar || 0, icon: <DollarSign size={18} />, gradient: 'from-rose-500 to-red-600', sub: `${stats.tagihan?.lunas || 0} lunas` },
  ]

  const absensiSiswaPersen = stats.absensi_siswa.total > 0 ? Math.round(stats.absensi_siswa.hadir / stats.absensi_siswa.total * 100) : 0
  const absensiGuruPersen = stats.absensi_guru.total > 0 ? Math.round(stats.absensi_guru.hadir / stats.absensi_guru.total * 100) : 0

  const pieData = [
    { name: 'Hadir', value: stats.absensi_siswa.hadir || 0 },
    { name: 'Tidak Hadir', value: (stats.absensi_siswa.total - stats.absensi_siswa.hadir) || 0 },
  ]

  const quickActions = [
    { label: 'Tambah Siswa', to: '/admin/siswa', icon: <GraduationCap size={16} />, color: 'text-blue-600 bg-blue-50' },
    { label: 'Input Jurnal', to: '/admin/jurnal', icon: <ClipboardList size={16} />, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Kelola GTK', to: '/admin/gtk', icon: <Users size={16} />, color: 'text-green-600 bg-green-50' },
    { label: 'Absensi', to: '/admin/absensi-siswa', icon: <UserCheck size={16} />, color: 'text-violet-600 bg-violet-50' },
  ]

  return (
    <div className="space-y-5">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900">{getGreeting()}, {user?.nama?.split(' ')[0] || 'Admin'} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            <CalendarDays size={14} /> {today}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {quickActions.map(a => (
            <Link key={a.to} to={a.to}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${a.color} hover:opacity-80 transition-all`}>
              {a.icon} {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Quick actions (mobile only) */}
      <div className="sm:hidden grid grid-cols-2 gap-2">
        {quickActions.map(a => (
          <Link key={a.to} to={a.to}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium ${a.color} border border-transparent hover:shadow-sm transition-all`}>
            {a.icon} {a.label} <ArrowRight size={12} className="ml-auto opacity-40" />
          </Link>
        ))}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Kehadiran Hari Ini" icon={<UserCheck size={16} className="text-primary" />}>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600">Siswa</span>
                <span className="font-semibold text-gray-900">{absensiSiswaPersen}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-blue-500 rounded-full h-2 transition-all" style={{ width: `${absensiSiswaPersen}%` }} />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{stats.absensi_siswa.hadir}/{stats.absensi_siswa.total} hadir</p>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600">GTK/Guru</span>
                <span className="font-semibold text-gray-900">{absensiGuruPersen}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-green-500 rounded-full h-2 transition-all" style={{ width: `${absensiGuruPersen}%` }} />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{stats.absensi_guru.hadir}/{stats.absensi_guru.total} hadir</p>
            </div>
          </div>
          {stats.absensi_siswa.total > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={4} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <Card title="Rekap Absensi Siswa (7 Hari)" icon={<TrendingUp size={16} className="text-primary" />}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.rekap_absensi} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hari" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="siswa_hadir" name="Hadir" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="siswa_sakit" name="Sakit" fill="#f59e0b" radius={[4,4,0,0]} />
                <Bar dataKey="siswa_izin" name="Izin" fill="#8b5cf6" radius={[4,4,0,0]} />
                <Bar dataKey="siswa_alpha" name="Alpha" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Kehadiran Guru (7 Hari)" icon={<Users size={16} className="text-green-600" />}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.rekap_absensi} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hari" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="guru_hadir" name="Guru Hadir" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Jurnal Mengajar Terbaru" icon={<ClipboardList size={16} className="text-primary" />}>
          {stats.jurnal_terbaru.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Belum ada jurnal hari ini</p>
          ) : (
            <div className="space-y-2">
              {stats.jurnal_terbaru.map((j: any) => (
                <div key={j.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{j.guru_nama || '-'}</p>
                    <p className="text-[11px] text-gray-400 truncate">{j.mapel_nama} · {j.rombel_nama} · {j.tanggal}</p>
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
