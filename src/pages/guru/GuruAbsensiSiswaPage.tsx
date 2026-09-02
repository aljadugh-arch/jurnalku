import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, Clock, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

export default function GuruAbsensiSiswaPage() {
  const [jadwal, setJadwal] = useState<any[]>([])
  const [contextSiswa, setContextSiswa] = useState<any[]>([])
  const [selectedJadwal, setSelectedJadwal] = useState('')
  const [selectedRombel, setSelectedRombel] = useState('')
  const [tanggal, setTanggal] = useState(todayWib())

  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const loadContext = useCallback(async (date: string) => {
    const res = await api.get('/guru/jadwal-context', { params: { tanggal: date } })
    setJadwal(res.data.jadwal || [])
    setContextSiswa(res.data.siswa || [])
    const first = res.data.jadwal?.[0]
    setSelectedJadwal(first?.jadwal_id || '')
    setSelectedRombel(first?.rombel_id || '')
    if (!first) {
      setSiswaList([])
      setAbsensi({})
    }
  }, [])

  useEffect(() => { void loadContext(tanggal) }, [loadContext, tanggal])

  const loadAbsensi = useCallback(async () => {
    const absenRes = await api.get('/absensi-mapel', { params: { jadwal_id: selectedJadwal, tanggal } })
    setSiswaList(contextSiswa.filter(s => s.rombel_id === selectedRombel))
    const map: Record<string, string> = {}
    absenRes.data.forEach((a: any) => { map[a.siswa_id] = a.status })
    setAbsensi(map)
  }, [contextSiswa, selectedJadwal, selectedRombel, tanggal])

  useEffect(() => {
    if (selectedJadwal && selectedRombel && tanggal) {
      void loadAbsensi()
    }
  }, [loadAbsensi, selectedJadwal, selectedRombel, tanggal])

  const setStatus = (siswaId: string, status: string) => {
    setAbsensi(prev => ({ ...prev, [siswaId]: status }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = Object.entries(absensi)
        .filter(([, status]) => ['hadir', 'sakit', 'izin', 'alpha'].includes(status))
        .map(([siswa_id, status]) => ({ siswa_id, status }))
      if (!data.length) {
        toast.error('Pilih Hadir, Sakit, Izin, atau Alpha minimal untuk satu siswa')
        return
      }
      await api.post('/absensi-mapel/bulk', { tanggal, jadwal_id: selectedJadwal, data })
      toast.success('Absensi yang dipilih berhasil disimpan; siswa lainnya tetap kosong')
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan absensi') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi per Mata Pelajaran</h1>
          <p className="text-gray-500 text-sm mt-1">Input kehadiran siswa untuk jadwal mengajar yang dipilih</p>
        </div>
        <button onClick={handleSave} disabled={saving || !selectedJadwal || siswaList.length === 0} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Absensi'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <select value={selectedJadwal} onChange={e => { const j = jadwal.find(x => x.jadwal_id === e.target.value); setSelectedJadwal(e.target.value); setSelectedRombel(j?.rombel_id || '') }} className="min-w-0 flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Pilih jadwal mengajar hari ini</option>
          {jadwal.map(j => <option key={j.jadwal_id} value={j.jadwal_id}>{j.jam_mulai}–{j.jam_selesai} · {j.mapel_nama} · {j.rombel_nama}</option>)}
        </select>
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />

      </div>

      {!jadwal.length && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">Tidak ada jadwal mengajar Anda pada tanggal ini. Absensi siswa dikosongkan.</div>}
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
                    <button onClick={() => setStatus(s.id, 'hadir')} className={`p-1.5 rounded-full ${absensi[s.id] === 'hadir' ? 'bg-green-100 text-green-700' : 'text-gray-300 hover:text-green-500'}`}><CheckCircle size={20} /></button>
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
