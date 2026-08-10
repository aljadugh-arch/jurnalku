import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import api from '../../services/api'

export default function SiswaAbsensiPage() {
  const [absensi, setAbsensi] = useState<any[]>([])

  useEffect(() => {
    api.get('/siswa/absensi').then(res => setAbsensi(res.data)).catch(() => {})
  }, [])

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'hadir': return <CheckCircle size={16} className="text-green-600" />
      case 'sakit': return <AlertTriangle size={16} className="text-yellow-600" />
      case 'izin': return <Clock size={16} className="text-blue-600" />
      case 'alpha': return <XCircle size={16} className="text-red-600" />
      default: return null
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      hadir: 'bg-green-100 text-green-700',
      sakit: 'bg-yellow-100 text-yellow-700',
      izin: 'bg-blue-100 text-blue-700',
      alpha: 'bg-red-100 text-red-700',
    }
    return styles[status] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Riwayat Absensi</h1>
        <p className="text-gray-500 text-sm mt-1">Rekap kehadiran kamu</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Waktu</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {absensi.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Belum ada data absensi</td></tr>}
              {absensi.map((a, i) => (
                <tr key={a.id || i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{a.tanggal}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(a.status)}`}>
                      {getStatusIcon(a.status)} {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.waktu_absen || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{a.keterangan || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
