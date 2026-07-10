import { useState, useEffect } from 'react'
import { Plus, Check, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface TahunAjaran {
  id: string; nama: string; semester: string; tanggal_mulai: string; tanggal_selesai: string; aktif: number
}

export default function TahunAjaranPage() {
  const [data, setData] = useState<TahunAjaran[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nama: '', semester: 'Ganjil', tanggal_mulai: '', tanggal_selesai: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    const res = await api.get('/tahun-ajaran')
    setData(res.data)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nama || !form.tanggal_mulai || !form.tanggal_selesai) { toast.error('Lengkapi semua field'); return }
    try {
      await api.post('/tahun-ajaran', form)
      toast.success('Tahun ajaran ditambahkan')
      setShowForm(false)
      setForm({ nama: '', semester: 'Ganjil', tanggal_mulai: '', tanggal_selesai: '' })
      load()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal') }
  }

  const handleActivate = async (id: string) => {
    await api.put('/tahun-ajaran/' + id + '/activate')
    toast.success('Tahun ajaran diaktifkan')
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Tahun Ajaran</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola tahun ajaran dan semester</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
          <Plus size={16} /> Tambah Tahun Ajaran
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tahun Ajaran</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Semester</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mulai</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Selesai</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Belum ada data tahun ajaran</td></tr>
              )}
              {data.map((ta, i) => (
                <tr key={ta.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{ta.nama}</td>
                  <td className="px-4 py-3 text-gray-600">{ta.semester}</td>
                  <td className="px-4 py-3 text-gray-600">{ta.tanggal_mulai}</td>
                  <td className="px-4 py-3 text-gray-600">{ta.tanggal_selesai}</td>
                  <td className="px-4 py-3">
                    {ta.aktif ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium"><Check size={12} /> Aktif</span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">Nonaktif</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {!ta.aktif && (
                        <button onClick={() => handleActivate(ta.id)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Aktifkan</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Tambah Tahun Ajaran</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tahun Ajaran</label>
                <input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} placeholder="2024/2025" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Semester</label>
                <select value={form.semester} onChange={e => setForm({...form, semester: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Mulai</label>
                  <input type="date" value={form.tanggal_mulai} onChange={e => setForm({...form, tanggal_mulai: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Selesai</label>
                  <input type="date" value={form.tanggal_selesai} onChange={e => setForm({...form, tanggal_selesai: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
