import { useEffect, useState } from 'react'
import { CheckCircle, Clock, Save, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

export default function AbsensiEkskulPage() {
  const [ekskulList, setEkskulList] = useState<any[]>([])
  const [selectedEkskul, setSelectedEkskul] = useState('')
  const [tanggal, setTanggal] = useState(todayWib())
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/ekskul').then(res => {
      setEkskulList(res.data)
      setSelectedEkskul(res.data[0]?.id || '')
    }).catch(() => toast.error('Gagal memuat data ekskul'))
  }, [])

  useEffect(() => {
    if (!selectedEkskul || !tanggal) { setSiswaList([]); setAbsensi({}); return }
    setLoading(true)
    Promise.all([
      api.get('/ekskul/' + selectedEkskul + '/anggota'),
      api.get('/absensi-ekskul', { params: { ekskul_id: selectedEkskul, tanggal } })
    ]).then(([anggota, existing]) => {
      setSiswaList(anggota.data)
      const map: Record<string, string> = {}
      existing.data.forEach((item: any) => { map[item.siswa_id] = item.status })
      setAbsensi(map)
    }).catch((err: any) => {
      setSiswaList([]); setAbsensi({})
      toast.error(err.response?.data?.error || 'Gagal memuat peserta ekskul')
    }).finally(() => setLoading(false))
  }, [selectedEkskul, tanggal])

  const setStatus = (siswaId: string, status: string) => setAbsensi(prev => ({ ...prev, [siswaId]: status }))

  const handleSave = async () => {
    if (!selectedEkskul || siswaList.length === 0) return
    setSaving(true)
    try {
      const data = siswaList.map(s => ({ siswa_id: s.id, status: absensi[s.id] || 'hadir' }))
      await api.post('/absensi-ekskul/bulk', { ekskul_id: selectedEkskul, tanggal, data })
      toast.success('Absensi ekskul berhasil disimpan')
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Ekstrakurikuler</h1>
          <p className="text-gray-500 text-sm mt-1">Kehadiran hanya untuk siswa yang sudah ditetapkan sebagai anggota</p>
        </div>
        <button onClick={handleSave} disabled={saving || loading || !selectedEkskul || siswaList.length === 0} className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Absensi'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <select value={selectedEkskul} onChange={e => setSelectedEkskul(e.target.value)} className="min-w-0 flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {ekskulList.length === 0 && <option value="">Belum ada ekskul</option>}
          {ekskulList.map(e => <option key={e.id} value={e.id}>{e.nama} · {e.jumlah_anggota || 0} peserta · {e.pembina_nama || 'Belum ada pembina'} · {e.hari || '-'}</option>)}
        </select>
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">NIS</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Rombel</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Hadir</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Izin</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Sakit</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Alpa</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Memuat peserta...</td></tr>}
              {!loading && selectedEkskul && siswaList.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Belum ada peserta yang ditetapkan. Atur anggota pada menu Ekstrakurikuler terlebih dahulu.</td></tr>}
              {!loading && !selectedEkskul && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Belum ada kegiatan ekstrakurikuler.</td></tr>}
              {!loading && siswaList.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nis}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                  <td className="px-4 py-3 text-gray-500">{s.rombel_nama || '-'}</td>
                  {['hadir', 'izin', 'sakit', 'alpa'].map(status => <td key={status} className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, status)} aria-label={`${status} ${s.nama}`} className={`p-1.5 rounded-full ${(absensi[s.id] || 'hadir') === status ? (status === 'hadir' ? 'bg-green-100 text-green-700' : status === 'alpa' ? 'bg-red-100 text-red-700' : status === 'sakit' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700') : 'text-gray-300 hover:text-primary'}`}>
                      {status === 'hadir' ? <CheckCircle size={20} /> : status === 'alpa' ? <XCircle size={20} /> : <Clock size={20} />}
                    </button>
                  </td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
