import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { todayWib } from '../../lib/dateFormat'

export default function GuruPenilaianEkskulPage() {
  const [ekskulList, setEkskulList] = useState<any[]>([])
  const [selectedEkskul, setSelectedEkskul] = useState('')
  const [tanggal, setTanggal] = useState(todayWib())
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [nilai, setNilai] = useState<Record<string, { nilai: number; catatan: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/guru/ekskul').then(({ data }) => {
      setEkskulList(data); setSelectedEkskul(data[0]?.id || '')
    }).catch(() => toast.error('Gagal memuat ekskul yang diampu')).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedEkskul || !tanggal) { setSiswaList([]); setNilai({}); return }
    setLoading(true)
    Promise.all([
      api.get('/ekskul/' + selectedEkskul + '/anggota'),
      api.get('/penilaian-ekskul', { params: { ekskul_id: selectedEkskul, tanggal_from: tanggal, tanggal_to: tanggal } }),
    ]).then(([anggota, existing]) => {
      setSiswaList(anggota.data)
      const map: Record<string, { nilai: number; catatan: string }> = {}
      existing.data.forEach((item: any) => { map[item.siswa_id] = { nilai: item.nilai || 0, catatan: item.catatan || '' } })
      setNilai(map)
    }).catch((err: any) => toast.error(err.response?.data?.error || 'Gagal memuat peserta ekskul'))
      .finally(() => setLoading(false))
  }, [selectedEkskul, tanggal])

  const setValue = (siswaId: string, field: 'nilai' | 'catatan', value: string) =>
    setNilai(prev => ({
      ...prev,
      [siswaId]: {
        nilai: field === 'nilai' ? Math.max(0, Math.min(100, Number(value) || 0)) : (prev[siswaId]?.nilai || 0),
        catatan: field === 'catatan' ? value : (prev[siswaId]?.catatan || ''),
      },
    }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = siswaList.map(s => ({ siswa_id: s.id, nilai: nilai[s.id]?.nilai || 0, catatan: nilai[s.id]?.catatan || '' }))
      await api.post('/penilaian-ekskul/bulk', { ekskul_id: selectedEkskul, tanggal, data })
      toast.success('Penilaian ekskul berhasil disimpan')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan penilaian')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800">Penilaian Ekstrakurikuler</h1>
          <p className="text-gray-500 mt-1">Input nilai peserta kegiatan ekskul yang Anda ampu</p>
        </div>
        <button onClick={handleSave} disabled={saving || loading || siswaList.length === 0} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Penilaian'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <select value={selectedEkskul} onChange={e => setSelectedEkskul(e.target.value)} className="min-w-0 flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {!ekskulList.length && <option value="">Belum ada ekskul yang diampu</option>}
          {ekskulList.map(e => <option key={e.id} value={e.id}>{e.nama} · {e.jumlah_anggota || 0} peserta · {e.hari || '-'}</option>)}
        </select>
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3">No</th><th className="text-left px-4 py-3">NIS</th><th className="text-left px-4 py-3">Nama</th><th className="text-left px-4 py-3">Rombel</th><th className="text-center px-4 py-3 w-24">Nilai</th><th className="text-left px-4 py-3">Catatan</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Memuat...</td></tr>}
              {!loading && selectedEkskul && siswaList.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Belum ada peserta yang ditetapkan admin untuk ekskul ini.</td></tr>}
              {!loading && !selectedEkskul && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Anda belum ditetapkan sebagai pembina ekskul.</td></tr>}
              {!loading && siswaList.map((s, i) => <tr key={s.id}>
                <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                <td className="px-4 py-3 font-mono">{s.nis}</td>
                <td className="px-4 py-3 font-medium">{s.nama}</td>
                <td className="px-4 py-3 text-gray-500">{s.rombel_nama || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <input type="number" min={0} max={100} value={nilai[s.id]?.nilai ?? 0} onChange={e => setValue(s.id, 'nilai', e.target.value)} className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-center" />
                </td>
                <td className="px-4 py-3">
                  <input type="text" value={nilai[s.id]?.catatan ?? ''} onChange={e => setValue(s.id, 'catatan', e.target.value)} placeholder="Catatan (opsional)" className="w-full px-2 py-1 border border-gray-300 rounded-lg" />
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
