import { useState, useEffect } from 'react'
import { ClipboardCheck, CheckCircle, Clock, FileEdit, Calendar } from 'lucide-react'
import api from '../../services/api'

export default function SupervisiPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(today.toISOString().split('T')[0])

  const load = () => {
    setLoading(true)
    api.get('/supervisi/rekap', { params: { from, to } })
      .then(res => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [from, to])

  const totalJurnal = data.reduce((a, g) => a + (g.total_jurnal || 0), 0)
  const totalApproved = data.reduce((a, g) => a + (g.approved || 0), 0)
  const totalPending = data.reduce((a, g) => a + (g.submitted || 0), 0)
  const aktif = data.filter(g => (g.total_jurnal || 0) > 0).length

  const stats = [
    { label: 'Guru Aktif Mengajar', value: `${aktif}/${data.length}`, icon: <ClipboardCheck size={20} />, color: 'text-blue-600 bg-blue-100' },
    { label: 'Total Jurnal', value: totalJurnal, icon: <FileEdit size={20} />, color: 'text-purple-600 bg-purple-100' },
    { label: 'Disetujui', value: totalApproved, icon: <CheckCircle size={20} />, color: 'text-green-600 bg-green-100' },
    { label: 'Menunggu Approval', value: totalPending, icon: <Clock size={20} />, color: 'text-amber-600 bg-amber-100' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Supervisi Kepala Sekolah</h1>
        <p className="text-gray-500 text-sm mt-1">Pantau aktivitas mengajar dan kelengkapan jurnal guru</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dari Tanggal</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sampai Tanggal</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
            <p className="text-2xl font-bold text-gray-800 mt-3">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50"><h2 className="font-semibold text-gray-800 text-sm">Rekap Aktivitas per Guru</h2></div>
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama Guru</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIP</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Disetujui</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Pending</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Draft</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Memuat...</td></tr>}
              {!loading && data.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Belum ada data</td></tr>}
              {!loading && data.map(g => (
                <tr key={g.guru_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{g.guru_nama}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{g.nip || '-'}</td>
                  <td className="px-4 py-3 text-center font-semibold">{g.total_jurnal}</td>
                  <td className="px-4 py-3 text-center text-green-600">{g.approved}</td>
                  <td className="px-4 py-3 text-center text-amber-600">{g.submitted}</td>
                  <td className="px-4 py-3 text-center text-gray-400">{g.draft}</td>
                  <td className="px-4 py-3 text-gray-600">{g.terakhir_mengajar || <span className="text-red-400">Belum mengajar</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {loading && <p className="px-4 py-8 text-center text-gray-400 text-sm">Memuat...</p>}
          {!loading && data.length === 0 && <p className="px-4 py-8 text-center text-gray-400 text-sm">Belum ada data</p>}
          {!loading && data.map(g => (
            <div key={g.guru_id} className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-800">{g.guru_nama}</p>
                <span className="text-sm font-semibold text-gray-700">{g.total_jurnal} jurnal</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">Setuju {g.approved}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending {g.submitted}</span>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Draft {g.draft}</span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                <Calendar size={12} /> {g.terakhir_mengajar || <span className="text-red-400">Belum mengajar</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
