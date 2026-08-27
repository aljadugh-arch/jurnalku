import { useState, useEffect } from 'react'
import { Plus, X, Clock, Check, FileText, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'
import { useSearchParams } from 'react-router-dom'

export default function GuruJurnalPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [mapels, setMapels] = useState<any[]>([])
  const [rombels, setRombels] = useState<any[]>([])
  const [form, setForm] = useState({ mapel_id: '', rombel_id: '', tanggal: todayWib(), jam_ke: 1, materi: '', kegiatan: '', catatan: '' })

  const [jadwalHariIni, setJadwalHariIni] = useState<any[]>([])

  useEffect(() => {
    loadData()
    // Load jadwal hari ini guru + mapel/rombel yang diampu
    Promise.all([
      api.get('/jurnal/jadwal-hari-ini'),
      api.get('/guru/pengajar-saya').catch(() => ({ data: { mapel: [], rombel: [] } })),
    ]).then(([j, p]) => {
      const jadwal = j.data.jadwal || []
      setJadwalHariIni(jadwal)
      // mapel & rombel dari pengajar, fallback ke semua
      const mapelList = p.data.mapel?.length ? p.data.mapel : jadwal.map((x: any) => ({ id: x.mapel_id, nama: x.mapel_nama })).filter((x: any, i: number, a: any[]) => a.findIndex((y: any) => y.id === x.id) === i)
      const rombelList = p.data.rombel?.length ? p.data.rombel : jadwal.map((x: any) => ({ id: x.rombel_id, nama: x.rombel_nama })).filter((x: any, i: number, a: any[]) => a.findIndex((y: any) => y.id === x.id) === i)
      setMapels(mapelList)
      setRombels(rombelList)
      const requestedJadwalId = searchParams.get('jadwal_id')
      const selected = requestedJadwalId ? jadwal.find((x: any) => x.jadwal_id === requestedJadwalId) : null
      if (selected) {
        setForm(f => ({ ...f, mapel_id: selected.mapel_id, rombel_id: selected.rombel_id }))
        setShowForm(true)
        setSearchParams({}, { replace: true })
      }
    })
  }, [])

  const loadData = async () => {
    const res = await api.get('/jurnal/me')
    setData(res.data)
  }

  const handleSubmit = async (status: string) => {
    if (!form.mapel_id || !form.rombel_id) { toast.error('Pilih mapel dan rombel'); return }
    if (!form.materi.trim()) { toast.error('Materi wajib diisi'); return }
    try {
      await api.post('/jurnal', { ...form, status })
      toast.success(status === 'submitted' ? 'Jurnal dikirim' : 'Draft disimpan')
      setShowForm(false)
      setForm({ mapel_id: '', rombel_id: '', tanggal: todayWib(), jam_ke: 1, materi: '', kegiatan: '', catatan: '' })
      loadData()
    } catch { toast.error('Gagal menyimpan') }
  }

  const submitDraft = async (id: string) => {
    await api.put('/jurnal/' + id, { status: 'submitted' })
    toast.success('Jurnal dikirim ke admin')
    loadData()
  }

  const statusBadge = (s: string) => {
    const cls = s === 'approved' ? 'bg-green-100 text-green-700' : s === 'submitted' ? 'bg-blue-100 text-blue-700' : s === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{s}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Jurnal Mengajar</h1>
          <p className="text-gray-500 text-sm mt-1">Catat kegiatan mengajar harian Anda</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
          <Plus size={16} /> Buat Jurnal
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
          <p className="text-xs text-yellow-600">Draft</p>
          <p className="text-xl font-bold text-yellow-800">{data.filter(d => d.status === 'draft').length}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600">Submitted</p>
          <p className="text-xl font-bold text-blue-800">{data.filter(d => d.status === 'submitted').length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-green-600">Approved</p>
          <p className="text-xl font-bold text-green-800">{data.filter(d => d.status === 'approved').length}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-xs text-red-600">Rejected</p>
          <p className="text-xl font-bold text-red-800">{data.filter(d => d.status === 'rejected').length}</p>
        </div>
      </div>

      {/* Jadwal hari ini — shortcut buat jurnal */}
      {jadwalHariIni.length > 0 && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
          <p className="text-xs font-semibold text-blue-700 mb-2">Jadwal Hari Ini — Klik untuk buat jurnal</p>
          <div className="flex flex-wrap gap-2">
            {jadwalHariIni.map((j: any) => (
              <button key={j.jadwal_id} onClick={() => {
                setForm(f => ({ ...f, mapel_id: j.mapel_id, rombel_id: j.rombel_id }))
                setShowForm(true)
              }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-800 rounded-lg text-xs hover:bg-blue-100">
                <Clock size={12}/> {j.jam_mulai} · {j.mapel_nama} · {j.rombel_nama}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {data.length === 0 && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center text-gray-400">
            <FileText size={40} className="mx-auto mb-2 opacity-50" />
            <p>Belum ada jurnal. Klik "Buat Jurnal" untuk mulai.</p>
          </div>
        )}
        {data.map(j => (
          <div key={j.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {statusBadge(j.status)}
                  <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12} /> Jam ke-{j.jam_ke}</span>
                </div>
                <h3 className="font-medium text-gray-800">{j.materi}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{j.mapel_nama} &bull; {j.rombel_nama} &bull; {j.tanggal}</p>
                {j.kegiatan && <p className="text-xs text-gray-400 mt-1">{j.kegiatan}</p>}
              </div>
              {j.status === 'draft' && (
                <button onClick={() => submitDraft(j.id)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                  <Send size={12} /> Kirim
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Buat Jurnal Mengajar</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal</label>
                  <input type="date" value={form.tanggal} onChange={e => setForm({...form, tanggal: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jam Ke</label>
                  <select value={form.jam_ke} onChange={e => setForm({...form, jam_ke: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {[1,2,3,4,5,6,7,8].map(j => <option key={j} value={j}>Jam ke-{j}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mata Pelajaran</label>
                <select value={form.mapel_id} onChange={e => setForm({...form, mapel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih --</option>
                  {mapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kelas (Rombel)</label>
                <select value={form.rombel_id} onChange={e => setForm({...form, rombel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih --</option>
                  {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Materi <span className="text-red-500">*</span></label>
                <input value={form.materi} onChange={e => setForm({...form, materi: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Topik/materi yang diajarkan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kegiatan Pembelajaran</label>
                <textarea value={form.kegiatan} onChange={e => setForm({...form, kegiatan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} placeholder="Deskripsi kegiatan..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catatan</label>
                <textarea value={form.catatan} onChange={e => setForm({...form, catatan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Catatan tambahan (opsional)" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => handleSubmit('draft')} className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Simpan Draft</button>
              <button onClick={() => handleSubmit('submitted')} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark flex items-center justify-center gap-1">
                <Send size={14} /> Kirim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
