import { useEffect, useState } from 'react'
import { CheckCircle, Clock, Save, XCircle } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { todayWib } from '../../lib/dateFormat'

export default function GuruAbsensiEkskulPage() {
  const [ekskulList, setEkskulList] = useState<any[]>([])
  const [selectedEkskul, setSelectedEkskul] = useState('')
  const [peminatanList, setPeminatanList] = useState<any[]>([])
  const [selectedPeminatan, setSelectedPeminatan] = useState('')
  const [tanggal, setTanggal] = useState(todayWib())
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'ekskul' | 'peminatan'>('ekskul')

  useEffect(() => {
    Promise.all([api.get('/guru/ekskul'), api.get('/guru/peminatan')]).then(([e, p]) => {
      setEkskulList(e.data); setSelectedEkskul(e.data[0]?.id || '')
      setPeminatanList(p.data); setSelectedPeminatan(p.data[0]?.id || '')
    }).catch(() => toast.error('Gagal memuat kegiatan yang diampu')).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (mode !== 'ekskul') return
    if (!selectedEkskul || !tanggal) { setSiswaList([]); setAbsensi({}); return }
    setLoading(true)
    Promise.all([
      api.get('/ekskul/' + selectedEkskul + '/anggota'),
      api.get('/absensi-ekskul', { params: { ekskul_id: selectedEkskul, tanggal } }),
    ]).then(([anggota, existing]) => {
      setSiswaList(anggota.data)
      const map: Record<string, string> = {}
      existing.data.forEach((item: any) => { map[item.siswa_id] = item.status })
      setAbsensi(map)
    }).catch((err: any) => toast.error(err.response?.data?.error || 'Gagal memuat peserta ekskul'))
      .finally(() => setLoading(false))
  }, [mode, selectedEkskul, tanggal])

  useEffect(() => {
    if (mode !== 'peminatan' || !selectedPeminatan) return
    setLoading(true)
    api.get('/tahfidz/kelompok/' + selectedPeminatan + '/peserta').then(({ data }) => {
      setSiswaList(data); setAbsensi({})
    }).catch((err: any) => toast.error(err.response?.data?.error || 'Gagal memuat peserta peminatan'))
      .finally(() => setLoading(false))
  }, [mode, selectedPeminatan, tanggal])

  const setStatus = (siswaId: string, status: string) => setAbsensi(prev => ({ ...prev, [siswaId]: status }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = siswaList.map(s => ({ siswa_id: s.id, status: absensi[s.id] || 'hadir' }))
      if (mode === 'ekskul') await api.post('/absensi-ekskul/bulk', { ekskul_id: selectedEkskul, tanggal, data })
      else await api.post('/tahfidz/pertemuan', { kelompok_id: selectedPeminatan, tanggal, materi: 'Absensi peminatan', absensi: data })
      toast.success('Absensi ekskul/peminatan berhasil disimpan')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan absensi')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800">Absensi Ekskul/Peminatan</h1>
          <p className="text-gray-500 mt-1">Input kehadiran peserta kegiatan yang Anda ampu</p>
        </div>
        <button onClick={handleSave} disabled={saving || loading || siswaList.length === 0} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Absensi'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <select value={mode} onChange={e => { setMode(e.target.value as 'ekskul' | 'peminatan'); setSiswaList([]); setAbsensi({}) }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm"><option value="ekskul">Ekskul</option><option value="peminatan">Peminatan</option></select>
        {mode === 'ekskul' ? <select value={selectedEkskul} onChange={e => setSelectedEkskul(e.target.value)} className="min-w-0 flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {!ekskulList.length && <option value="">Belum ada ekskul yang diampu</option>}
          {ekskulList.map(e => <option key={e.id} value={e.id}>{e.nama} · {e.jumlah_anggota || 0} peserta · {e.hari || '-'}</option>)}
        </select> : <select value={selectedPeminatan} onChange={e => setSelectedPeminatan(e.target.value)} className="min-w-0 flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {!peminatanList.length && <option value="">Belum ada peminatan yang diampu</option>}
          {peminatanList.map(e => <option key={e.id} value={e.id}>{e.jenis_nama ? e.jenis_nama + ' · ' : ''}{e.nama} · {e.jumlah_anggota || 0} peserta</option>)}
        </select>}
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3">No</th><th className="text-left px-4 py-3">NIS</th><th className="text-left px-4 py-3">Nama</th><th className="text-left px-4 py-3">Rombel</th><th className="text-center px-4 py-3">Hadir</th><th className="text-center px-4 py-3">Izin</th><th className="text-center px-4 py-3">Sakit</th><th className="text-center px-4 py-3">Alpa</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Memuat...</td></tr>}
              {!loading && (mode === 'ekskul' ? selectedEkskul : selectedPeminatan) && siswaList.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Belum ada peserta yang ditetapkan admin untuk kegiatan ini.</td></tr>}
              {!loading && !(mode === 'ekskul' ? selectedEkskul : selectedPeminatan) && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Anda belum ditetapkan sebagai pembina ekskul/peminatan.</td></tr>}
              {!loading && siswaList.map((s, i) => <tr key={s.id}>
                <td className="px-4 py-3 text-gray-500">{i + 1}</td><td className="px-4 py-3 font-mono">{s.nis}</td><td className="px-4 py-3 font-medium">{s.nama}</td><td className="px-4 py-3 text-gray-500">{s.rombel_nama || '-'}</td>
                {['hadir', 'izin', 'sakit', 'alpa'].map(status => <td key={status} className="px-4 py-3 text-center"><button onClick={() => setStatus(s.id, status)} aria-label={`${status} ${s.nama}`} className={`p-1.5 rounded-full ${(absensi[s.id] || 'hadir') === status ? (status === 'hadir' ? 'bg-green-100 text-green-700' : status === 'alpa' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700') : 'text-gray-300 hover:text-primary'}`}>{status === 'hadir' ? <CheckCircle size={20} /> : status === 'alpa' ? <XCircle size={20} /> : <Clock size={20} />}</button></td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
