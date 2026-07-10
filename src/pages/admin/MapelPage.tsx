import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Upload, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'

interface Mapel { id: string; kode: string; nama: string; kelompok: string; tingkat: string; jam_per_minggu: number }

export default function MapelPage() {
  const [data, setData] = useState<Mapel[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [form, setForm] = useState({ kode: '', nama: '', kelompok: 'wajib', jam_per_minggu: 2 })


  const fetchData = async () => {
    try { const res = await api.get('/mapel'); setData(res.data) }
    catch { toast.error('Gagal memuat mapel') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleSave = async () => {
    if (!form.kode || !form.nama) { toast.error('Kode dan Nama wajib diisi'); return }
    try {
      await api.post('/mapel', form)
      toast.success('Mapel berhasil ditambahkan')
      setShowModal(false); setForm({ kode: '', nama: '', kelompok: 'wajib', jam_per_minggu: 2 }); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus mapel ' + nama + '?')) return
    try { await api.delete('/mapel/' + id); toast.success('Berhasil dihapus'); fetchData() }
    catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Mata Pelajaran</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola data mata pelajaran ({data.length} mapel)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/templates/template-mapel.xls" download className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
            <Download size={16} /> Unduh Template
          </a>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Mapel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kode</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama Mapel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kelompok</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jam/Minggu</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Memuat...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Belum ada data</td></tr>
              ) : data.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono font-medium text-primary">{m.kode}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{m.nama}</td>
                  <td className="px-4 py-3">
                    <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (m.kelompok === 'wajib' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                      {m.kelompok}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-center">{m.jam_per_minggu}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(m.id, m.nama)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Tambah Mata Pelajaran</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Kode *</label><input value={form.kode} onChange={e => setForm({...form, kode: e.target.value})} placeholder="MTK" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Nama *</label><input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} placeholder="Matematika" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Kelompok</label><select value={form.kelompok} onChange={e => setForm({...form, kelompok: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="wajib">Wajib</option><option value="peminatan">Peminatan</option><option value="muatan_lokal">Muatan Lokal</option></select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Jam/Minggu</label><input type="number" value={form.jam_per_minggu} onChange={e => setForm({...form, jam_per_minggu: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportExcel
          title="Import Mata Pelajaran"
          templateName="master-mapel-v2.xls"
          headerRow={2}
          columnMap={{ 'Kode MAPEL': 'kode', 'Nama Mata Pelajaran': 'nama' }}
          onImport={async (rows) => {
            for (const row of rows) {
              await api.post('/mapel', { ...row, kelompok: 'wajib', jam_per_minggu: 2 })
            }
            fetchData()
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
