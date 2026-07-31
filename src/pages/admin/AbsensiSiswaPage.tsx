import { useState, useEffect } from 'react'
import { QrCode, CheckCircle, XCircle, AlertCircle, Clock, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

const statusColors: Record<string, string> = {
  hadir: 'bg-green-100 text-green-700',
  sakit: 'bg-yellow-100 text-yellow-700',
  izin: 'bg-blue-100 text-blue-700',
  alpha: 'bg-red-100 text-red-700',
}

export default function AbsensiSiswaPage() {
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0])
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [existing, setExisting] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/rombel').then(res => {
      setRombels(res.data)
      if (res.data.length > 0) setSelectedRombel(res.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedRombel) loadData()
  }, [selectedRombel, tanggal])

  const loadData = async () => {
    const [siswaRes, absensiRes] = await Promise.all([
      api.get('/siswa', { params: { rombel_id: selectedRombel } }),
      api.get('/absensi-siswa', { params: { tanggal, rombel_id: selectedRombel } })
    ])
    setSiswaList(siswaRes.data)
    setExisting(absensiRes.data)
    const map: Record<string, string> = {}
    for (const a of absensiRes.data) { map[a.siswa_id] = a.status }
    setAbsensi(map)
  }

  const setStatus = (siswaId: string, status: string) => {
    setAbsensi(prev => ({ ...prev, [siswaId]: status }))
  }

  const handleSave = async () => {
    const data = siswaList.map(s => ({
      siswa_id: s.id,
      status: absensi[s.id] || 'alpha',
      metode: 'manual',
    }))
    setLoading(true)
    try {
      await api.post('/absensi-siswa/bulk', { tanggal, rombel_id: selectedRombel, data })
      toast.success('Absensi tersimpan')
      loadData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal simpan') }
    finally { setLoading(false) }
  }

  const summary = {
    hadir: Object.values(absensi).filter(s => s === 'hadir').length,
    sakit: Object.values(absensi).filter(s => s === 'sakit').length,
    izin: Object.values(absensi).filter(s => s === 'izin').length,
    alpha: siswaList.length - Object.values(absensi).filter(s => s && s !== 'alpha').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">QR Code & Manual oleh Wali Kelas</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            <QrCode size={16} /> Generate QR
          </button>
          <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> {loading ? 'Menyimpan...' : 'Simpan Absensi'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{summary.hadir}</p>
          <p className="text-sm text-green-600">Hadir</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-700">{summary.sakit}</p>
          <p className="text-sm text-yellow-600">Sakit</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{summary.izin}</p>
          <p className="text-sm text-blue-600">Izin</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{summary.alpha}</p>
          <p className="text-sm text-red-600">Alpha</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIS</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Hadir</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Sakit</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Izin</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Alpha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {siswaList.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Pilih rombel yang memiliki siswa</td></tr>
              )}
              {siswaList.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nis}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                  {['hadir', 'sakit', 'izin', 'alpha'].map(st => (
                    <td key={st} className="text-center px-4 py-3">
                      <input type="radio" name={`abs-${s.id}`} checked={absensi[s.id] === st} onChange={() => setStatus(s.id, st)} className="w-4 h-4 text-primary" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
