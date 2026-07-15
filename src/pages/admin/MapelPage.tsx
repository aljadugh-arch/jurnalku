import { useState, useEffect } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import BulkDeleteButton from '../../components/BulkDeleteButton'
import Modal from '../../components/ui/Modal'
import ResponsiveTable from '../../components/ui/ResponsiveTable'

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
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Mapel
          </button>
          <BulkDeleteButton kategori="mapel" label="Mapel" onDone={fetchData} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">Memuat...</p>
        ) : (
          <ResponsiveTable<Mapel>
            columns={[
              { key: 'nama', header: 'Nama Mapel', className: 'font-medium text-gray-800' },
              { key: 'kode', header: 'Kode', className: 'font-mono font-medium text-primary', hideOnMobile: true },
              { key: 'kelompok', header: 'Kelompok', render: (m) => (
                <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (m.kelompok === 'wajib' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                  {m.kelompok}
                </span>
              ) },
              { key: 'jam', header: 'Jam/Minggu', render: (m) => m.jam_per_minggu },
            ]}
            rows={data}
            rowKey={(m) => m.id}
            empty="Belum ada data"
            actions={(m) => (
              <button onClick={() => handleDelete(m.id, m.nama)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
            )}
          />
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Tambah Mata Pelajaran"
        maxWidth="md:max-w-md"
        footer={
          <div className="flex gap-3">
            <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
            <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Kode *</label><input value={form.kode} onChange={e => setForm({...form, kode: e.target.value})} placeholder="MTK" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Nama *</label><input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} placeholder="Matematika" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Kelompok</label><select value={form.kelompok} onChange={e => setForm({...form, kelompok: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="wajib">Wajib</option><option value="peminatan">Peminatan</option><option value="muatan_lokal">Muatan Lokal</option></select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Jam/Minggu</label><input type="number" value={form.jam_per_minggu} onChange={e => setForm({...form, jam_per_minggu: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          </div>
        </div>
      </Modal>

      {showImport && (
        <ImportExcel
          title="Import Mata Pelajaran"
          templateUrl="/templates/template-mapel.xls"
          templateName="template-mapel.xls"
          headerRow={2}
          columnMap={{ 'Kode MAPEL': 'kode', 'Nama Mata Pelajaran': 'nama', 'Kelompok': 'kelompok', 'Jam Per Minggu': 'jam_per_minggu' }}
          onImport={async (rows) => {
            for (const row of rows) {
              if (!row.nama) continue
              await api.post('/mapel', {
                kode: String(row.kode || ''), nama: row.nama,
                kelompok: row.kelompok || 'wajib',
                jam_per_minggu: Number(row.jam_per_minggu) || 2,
              })
            }
            fetchData()
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
