import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

export default function GuruAbsensiSiswaPage() {
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [tanggal, setTanggal] = useState(todayWib())
  const [sesi, setSesi] = useState<'masuk' | 'pulang'>('masuk')
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/rombel').then(res => {
      setRombels(res.data)
      if (res.data.length > 0) setSelectedRombel(res.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedRombel && tanggal) {
      loadAbsensi()
    }
  }, [selectedRombel, tanggal, sesi])

  const loadAbsensi = async () => {
    const [siswaRes, absenRes] = await Promise.all([
      api.get('/siswa', { params: { rombel_id: selectedRombel } }),
      api.get('/absensi-siswa', { params: { rombel_id: selectedRombel, tanggal } })
    ])
    setSiswaList(siswaRes.data)
    const map: Record<string, string> = {}
    absenRes.data.forEach((a: any) => { map[a.siswa_id] = a.status })
    setAbsensi(map)
  }

  const setStatus = (siswaId: string, status: string) => {
    setAbsensi(prev => ({ ...prev, [siswaId]: status }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = siswaList.map(s => ({ siswa_id: s.id, status: absensi[s.id] || 'hadir' }))
      await api.post('/absensi-siswa/bulk', { tanggal, rombel_id: selectedRombel, jenis: sesi, data })
      toast.success('Absensi siswa berhasil disimpan')
    } catch { toast.error('Gagal menyimpan absensi') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">Input absensi harian per kelas</p>
        </div>
        <button onClick={handleSave} disabled={saving || siswaList.length === 0} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Absensi'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {rombels.map(r => <option key={r.id} value={r.id}>{r.nama} ({r.tingkat})</option>)}
        </select>
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={sesi} onChange={e => setSesi(e.target.value as 'masuk' | 'pulang')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="masuk">Sesi Masuk</option>
          <option value="pulang">Sesi Pulang</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
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
              {siswaList.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Tidak ada siswa di rombel ini</td></tr>}
              {siswaList.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nis}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'hadir')} className={`p-1.5 rounded-full ${(absensi[s.id] || 'hadir') === 'hadir' ? 'bg-green-100 text-green-700' : 'text-gray-300 hover:text-green-500'}`}><CheckCircle size={20} /></button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'sakit')} className={`p-1.5 rounded-full ${absensi[s.id] === 'sakit' ? 'bg-yellow-100 text-yellow-700' : 'text-gray-300 hover:text-yellow-500'}`}><Clock size={20} /></button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'izin')} className={`p-1.5 rounded-full ${absensi[s.id] === 'izin' ? 'bg-blue-100 text-blue-700' : 'text-gray-300 hover:text-blue-500'}`}><Clock size={20} /></button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'alpha')} className={`p-1.5 rounded-full ${absensi[s.id] === 'alpha' ? 'bg-red-100 text-red-700' : 'text-gray-300 hover:text-red-500'}`}><XCircle size={20} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
