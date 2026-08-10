import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, X, Users, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Ekskul {
  id: string; nama: string; pembina_id?: string; pembina_nama?: string
  hari?: string; jam_mulai?: string; jam_selesai?: string; deskripsi?: string
}

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const emptyForm = { nama: '', pembina_id: '', hari: '', jam_mulai: '', jam_selesai: '', deskripsi: '' }

export default function EkskulPage() {
  const [data, setData] = useState<Ekskul[]>([])
  const [gtk, setGtk] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchData = async () => {
    try {
      const res = await api.get('/ekskul')
      setData(res.data)
    } catch { toast.error('Gagal memuat data ekskul') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchData()
    api.get('/gtk').then(res => setGtk(res.data)).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!form.nama.trim()) { toast.error('Nama ekskul wajib diisi'); return }
    setSaving(true)
    try {
      if (editId) {
        await api.put('/ekskul/' + editId, form)
        toast.success('Ekskul berhasil diupdate')
      } else {
        await api.post('/ekskul', form)
        toast.success('Ekskul berhasil ditambahkan')
      }
      setShowModal(false); setEditId(null); setForm(emptyForm); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const handleEdit = (e: Ekskul) => {
    setForm({
      nama: e.nama, pembina_id: e.pembina_id || '', hari: e.hari || '',
      jam_mulai: e.jam_mulai || '', jam_selesai: e.jam_selesai || '', deskripsi: e.deskripsi || ''
    })
    setEditId(e.id); setShowModal(true)
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus ekskul ' + nama + '?')) return
    try { await api.delete('/ekskul/' + id); toast.success('Berhasil dihapus'); fetchData() }
    catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Ekstrakurikuler</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola kegiatan ekskul ({data.length} kegiatan)</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark self-start">
          <Plus size={16} /> Tambah Ekskul
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-8">Memuat...</p>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-gray-100">
          Belum ada ekskul. Klik "Tambah Ekskul" untuk membuat kegiatan pertama.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map(e => (
            <div key={e.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users size={20} className="text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate">{e.nama}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Pembina: {e.pembina_nama || 'TBA'}</p>
                    {e.hari && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                        <Calendar size={12} />
                        <span>{e.hari}{e.jam_mulai && e.jam_selesai ? ` • ${e.jam_mulai}-${e.jam_selesai}` : ''}</span>
                      </div>
                    )}
                    {e.deskripsi && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{e.deskripsi}</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => handleEdit(e)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(e.id, e.nama)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editId ? 'Edit' : 'Tambah'} Ekskul</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nama Ekskul *</label>
                <input type="text" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Pramuka, Futsal, dll" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Pembina</label>
                <select value={form.pembina_id} onChange={e => setForm({ ...form, pembina_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">- Pilih Pembina -</option>
                  {gtk.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Hari</label>
                <select value={form.hari} onChange={e => setForm({ ...form, hari: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">- Pilih Hari -</option>
                  {HARI.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Jam Mulai</label>
                  <input type="time" value={form.jam_mulai} onChange={e => setForm({ ...form, jam_mulai: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Jam Selesai</label>
                  <input type="time" value={form.jam_selesai} onChange={e => setForm({ ...form, jam_selesai: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Deskripsi</label>
                <textarea value={form.deskripsi} onChange={e => setForm({ ...form, deskripsi: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
