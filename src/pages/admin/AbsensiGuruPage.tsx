import { useState, useEffect } from 'react'
import { MapPin, Camera, Save, CheckCircle, XCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

const statusColors: Record<string, string> = {
  hadir: 'bg-green-100 text-green-700',
  sakit: 'bg-yellow-100 text-yellow-700',
  izin: 'bg-blue-100 text-blue-700',
  alpha: 'bg-red-100 text-red-700',
}

export default function AbsensiGuruPage() {
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0])
  const [gtkList, setGtkList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<any[]>([])
  const [form, setForm] = useState<Record<string, { status: string; waktu_masuk: string; waktu_pulang: string }>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadData() }, [tanggal])

  const loadData = async () => {
    const [gtkRes, absRes] = await Promise.all([
      api.get('/gtk'),
      api.get('/absensi-guru', { params: { tanggal } })
    ])
    setGtkList(gtkRes.data)
    setAbsensi(absRes.data)
    const map: Record<string, any> = {}
    for (const g of gtkRes.data) {
      const existing = absRes.data.find((a: any) => a.gtk_id === g.id)
      map[g.id] = {
        status: existing?.status || '',
        waktu_masuk: existing?.waktu_masuk || '',
        waktu_pulang: existing?.waktu_pulang || '',
      }
    }
    setForm(map)
  }

  const updateForm = (gtkId: string, field: string, value: string) => {
    setForm(prev => ({ ...prev, [gtkId]: { ...prev[gtkId], [field]: value } }))
  }

  const loadJadwalHarian = async () => {
    try {
      const r = await api.get('/absensi-guru/jadwal-harian', { params: { tanggal } })
      const map: Record<string, any> = {}
      for (const g of r.data.rows || []) map[g.id] = { status: 'hadir', waktu_masuk: g.waktu_masuk || '', waktu_pulang: g.waktu_pulang || '' }
      setForm(prev => ({ ...prev, ...map }))
      toast.success(`${(r.data.rows || []).length} GTK dari jadwal dimuat`)
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal muat jadwal') }
  }

  const handleBatchJadwal = async () => {
    const data = Object.entries(form).filter(([, f]: any) => f.status).map(([gtk_id, f]: any) => ({ gtk_id, ...f }))
    try { const r = await api.post('/absensi-guru/batch-jadwal', { tanggal, data }); toast.success(`${r.data.count} absensi GTK tersimpan`); loadData() }
    catch (err: any) { toast.error(err.response?.data?.error || 'Gagal batch') }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      for (const g of gtkList) {
        const f = form[g.id]
        if (f && f.status) {
          await api.post('/absensi-guru', { gtk_id: g.id, tanggal, status: f.status, waktu_masuk: f.waktu_masuk || null, waktu_pulang: f.waktu_pulang || null })
        }
      }
      toast.success('Absensi guru tersimpan')
      loadData()
    } catch (err: any) { toast.error('Gagal simpan') }
    finally { setLoading(false) }
  }

  const summary = {
    hadir: Object.values(form).filter(f => f.status === 'hadir').length,
    sakit: Object.values(form).filter(f => f.status === 'sakit').length,
    izin: Object.values(form).filter(f => f.status === 'izin').length,
    alpha: Object.values(form).filter(f => f.status === 'alpha').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Guru/GTK</h1>
          <p className="text-gray-500 text-sm mt-1">GPS + Selfie untuk kehadiran guru</p>
        </div>
        <div className="flex gap-2 flex-wrap"><button onClick={loadJadwalHarian} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Muat Jadwal Hari Ini</button><button onClick={handleBatchJadwal} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Simpan Batch Jadwal</button><button onClick={handleSave} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
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

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIP</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jam Masuk</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jam Pulang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gtkList.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Belum ada data GTK</td></tr>
              )}
              {gtkList.map((g, i) => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{g.nip || '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{g.nama}</td>
                  <td className="px-4 py-3">
                    <select value={form[g.id]?.status || ''} onChange={e => updateForm(g.id, 'status', e.target.value)} className="px-2 py-1 border rounded text-xs">
                      <option value="">--</option>
                      <option value="hadir">Hadir</option>
                      <option value="sakit">Sakit</option>
                      <option value="izin">Izin</option>
                      <option value="alpha">Alpha</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input type="time" value={form[g.id]?.waktu_masuk || ''} onChange={e => updateForm(g.id, 'waktu_masuk', e.target.value)} className="px-2 py-1 border rounded text-xs" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="time" value={form[g.id]?.waktu_pulang || ''} onChange={e => updateForm(g.id, 'waktu_pulang', e.target.value)} className="px-2 py-1 border rounded text-xs" />
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
