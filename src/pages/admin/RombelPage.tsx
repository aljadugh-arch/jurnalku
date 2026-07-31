import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Rombel { id: string; nama: string; tingkat: string; tahun_ajaran: string; wali_kelas_id: string; wali_kelas_nama: string; kapasitas: number; jumlah_siswa: number }

export default function RombelPage() {
  const [data, setData] = useState<Rombel[]>([])
  const [gtk, setGtk] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nama: '', tingkat: 'X', tahun_ajaran: '2024/2025', wali_kelas_id: '', kapasitas: 36 })

  const fetchData = async () => {
    try {
      const [res, gtkRes] = await Promise.all([api.get('/rombel'), api.get('/gtk')])
      setData(res.data); setGtk(gtkRes.data)
    } catch { toast.error('Gagal memuat data') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleSave = async () => {
    if (!form.nama || !form.tingkat) { toast.error('Nama dan tingkat wajib'); return }
    try {
      await api.post('/rombel', form)
      toast.success('Rombel berhasil ditambahkan')
      setShowModal(false); setForm({ nama: '', tingkat: 'X', tahun_ajaran: '2024/2025', wali_kelas_id: '', kapasitas: 36 }); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal') }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus rombel ' + nama + '?')) return
    try { await api.delete('/rombel/' + id); toast.success('Berhasil dihapus'); fetchData() }
    catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Rombongan Belajar</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola kelas dan rombel ({data.length} rombel)</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
          <Plus size={16} /> Tambah Rombel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <p className="text-gray-400 col-span-3 text-center py-8">Memuat...</p> :
        data.length === 0 ? <p className="text-gray-400 col-span-3 text-center py-8">Belum ada rombel</p> :
        data.map(r => (
          <div key={r.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{r.nama}</h3>
                  <p className="text-xs text-gray-500">Tingkat {r.tingkat} • {r.tahun_ajaran}</p>
                </div>
              </div>
              <button onClick={() => handleDelete(r.id, r.nama)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-600"><span>Wali Kelas</span><span className="font-medium text-gray-800">{r.wali_kelas_nama || '-'}</span></div>
              <div className="flex justify-between text-gray-600"><span>Siswa</span><span className="font-medium text-gray-800">{r.jumlah_siswa}/{r.kapasitas}</span></div>
            </div>
            <div className="mt-3 bg-gray-100 rounded-full h-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: Math.min(100, (r.jumlah_siswa / r.kapasitas) * 100) + '%' }} />
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Tambah Rombel</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Nama Rombel *</label><input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} placeholder="X-A" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Tingkat</label><select value={form.tingkat} onChange={e => setForm({...form, tingkat: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="X">X</option><option value="XI">XI</option><option value="XII">XII</option></select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Kapasitas</label><input type="number" value={form.kapasitas} onChange={e => setForm({...form, kapasitas: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Tahun Ajaran</label><input value={form.tahun_ajaran} onChange={e => setForm({...form, tahun_ajaran: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Wali Kelas</label><select value={form.wali_kelas_id} onChange={e => setForm({...form, wali_kelas_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">-- Pilih --</option>{gtk.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}</select></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
