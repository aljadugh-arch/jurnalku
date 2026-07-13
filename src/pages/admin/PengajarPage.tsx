import { useState, useEffect, useRef } from 'react'
import { Plus, Edit, Trash2, X, Download, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import api from '../../services/api'

export default function PengajarPage() {
  const [data, setData] = useState<any[]>([])
  const [gtkList, setGtkList] = useState<any[]>([])
  const [mapelList, setMapelList] = useState<any[]>([])
  const [rombelList, setRombelList] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ gtk_id: '', mapel_id: '', rombel_id: '', jam_per_minggu: 2 })
  const fileRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['guru', 'mapel', 'rombel', 'jam'],
      ['Budi Santoso', 'Matematika', 'X-A', 4],
      ['Siti Aminah', 'Bahasa Indonesia', 'X-A', 2],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pengajar')
    XLSX.writeFile(wb, 'template_pengajar.xlsx')
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      const rows = raw.map(r => ({ guru: r.guru, mapel: r.mapel, rombel: r.rombel, jam: r.jam }))
      if (!rows.length) { toast.error('File kosong'); return }
      const res = await api.post('/pengajar/import', { rows })
      if (res.data.errors?.length) {
        toast.error(`${res.data.count} berhasil, ${res.data.errors.length} gagal. ${res.data.errors[0]}`, { duration: 6000 })
      } else {
        toast.success(`${res.data.count} pengajar diimport`)
      }
      loadAll()
    } catch { toast.error('Gagal membaca file Excel') }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [p, g, m, r] = await Promise.all([
      api.get('/pengajar'),
      api.get('/gtk'),
      api.get('/mapel'),
      api.get('/rombel')
    ])
    setData(p.data)
    setGtkList(g.data)
    setMapelList(m.data)
    setRombelList(r.data)
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ gtk_id: '', mapel_id: '', rombel_id: '', jam_per_minggu: 2 })
    setShowModal(true)
  }

  const openEdit = (item: any) => {
    setEditing(item)
    setForm({ gtk_id: item.gtk_id, mapel_id: item.mapel_id, rombel_id: item.rombel_id, jam_per_minggu: item.jam_per_minggu })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.gtk_id || !form.mapel_id || !form.rombel_id) { toast.error('Lengkapi semua field'); return }
    try {
      if (editing) {
        await api.put('/pengajar/' + editing.id, form)
        toast.success('Pengajar diperbarui')
      } else {
        await api.post('/pengajar', form)
        toast.success('Pengajar ditambahkan')
      }
      setShowModal(false)
      loadAll()
    } catch { toast.error('Gagal menyimpan') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus penugasan ini?')) return
    try {
      await api.delete('/pengajar/' + id)
      toast.success('Dihapus')
      loadAll()
    } catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Data Pengajar</h1>
          <p className="text-gray-500 text-sm mt-1">Penugasan guru mengajar per kelas dan mapel. Guru yang sama boleh ditambahkan berkali-kali untuk mapel/rombel berbeda.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
            <Download size={16} /> Template
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg text-sm hover:bg-secondary-light">
            <Upload size={16} /> Import Excel
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Pengajar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Guru</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mata Pelajaran</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rombel</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Jam/Minggu</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Belum ada data pengajar</td></tr>
              )}
              {data.map((p, i) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.guru_nama}</td>
                  <td className="px-4 py-3 text-gray-600">{p.mapel_nama}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">{p.rombel_nama}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-center">{p.jam_per_minggu}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg"><Edit size={16} /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editing ? 'Edit Pengajar' : 'Tambah Pengajar'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Guru</label>
                <select value={form.gtk_id} onChange={e => setForm({...form, gtk_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih Guru --</option>
                  {gtkList.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mata Pelajaran</label>
                <select value={form.mapel_id} onChange={e => setForm({...form, mapel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih Mapel --</option>
                  {mapelList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rombel</label>
                <select value={form.rombel_id} onChange={e => setForm({...form, rombel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih Rombel --</option>
                  {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Jam/Minggu</label>
                <input type="number" min={1} value={form.jam_per_minggu} onChange={e => setForm({...form, jam_per_minggu: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg text-sm">Batal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
