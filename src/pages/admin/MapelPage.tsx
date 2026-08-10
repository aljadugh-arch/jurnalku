import { useState, useEffect } from 'react'
import { Plus, Trash2, Upload, X, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import BulkDeleteButton from '../../components/BulkDeleteButton'
import Modal from '../../components/ui/Modal'

interface Mapel { id: string; kode: string; nama: string; kelompok: string; tingkat: string; jam_per_minggu: number }

const KELOMPOK_LABEL: Record<string, string> = {
  wajib: 'Wajib',
  peminatan: 'Peminatan',
  muatan_lokal: 'Muatan Lokal',
}

const kelompokBadge = (kelompok: string) => {
  if (kelompok === 'wajib') return 'bg-blue-100 text-blue-700'
  if (kelompok === 'peminatan') return 'bg-purple-100 text-purple-700'
  if (kelompok === 'muatan_lokal') return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

export default function MapelPage() {
  const [data, setData] = useState<Mapel[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [form, setForm] = useState({ kode: '', nama: '', kelompok: 'wajib', jam_per_minggu: 2 })
  const [selected, setSelected] = useState<Mapel | null>(null)

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
    try {
      await api.delete('/mapel/' + id)
      toast.success('Berhasil dihapus')
      if (selected?.id === id) setSelected(null)
      fetchData()
    }
    catch { toast.error('Gagal menghapus') }
  }

  const openDetail = (m: Mapel) => {
    setSelected(prev => prev?.id === m.id ? null : m)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Mata Pelajaran</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola data mata pelajaran ({data.length} mapel)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Mapel
          </button>
          <BulkDeleteButton kategori="mapel" label="Mapel" onDone={fetchData} />
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="text-gray-400 col-span-3 text-center py-8">Memuat...</p>
        ) : data.length === 0 ? (
          <p className="text-gray-400 col-span-3 text-center py-8">Belum ada data mapel</p>
        ) : data.map(m => (
          <div
            key={m.id}
            onClick={() => openDetail(m)}
            className={`bg-white rounded-xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${selected?.id === m.id ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100'}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                {/* Kode badge */}
                <span className="inline-block px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono font-bold rounded mb-1">
                  {m.kode}
                </span>
                {/* Nama mapel */}
                <h3 className="font-bold text-gray-800 text-sm leading-tight truncate">{m.nama}</h3>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {/* Kelompok badge */}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${kelompokBadge(m.kelompok)}`}>
                    {KELOMPOK_LABEL[m.kelompok] ?? m.kelompok}
                  </span>
                  {/* Jam per minggu */}
                  <span className="text-xs text-gray-400">{m.jam_per_minggu} jam/minggu</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono font-bold rounded">
                  {selected.kode}
                </span>
                <h2 className="font-bold text-gray-800">{selected.nama}</h2>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${kelompokBadge(selected.kelompok)}`}>
                  {KELOMPOK_LABEL[selected.kelompok] ?? selected.kelompok}
                </span>
                <span className="text-xs text-gray-400">{selected.jam_per_minggu} jam/minggu</span>
                {selected.tingkat && (
                  <span className="text-xs text-gray-400">Tingkat {selected.tingkat}</span>
                )}
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
              <X size={18} />
            </button>
          </div>

          {/* Panel body */}
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">Kode</p>
                <p className="text-sm font-mono font-bold text-primary">{selected.kode}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">Kelompok</p>
                <p className="text-sm font-semibold text-gray-700">{KELOMPOK_LABEL[selected.kelompok] ?? selected.kelompok}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">Jam/Minggu</p>
                <p className="text-sm font-semibold text-gray-700">{selected.jam_per_minggu}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">Tingkat</p>
                <p className="text-sm font-semibold text-gray-700">{selected.tingkat || '-'}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(selected.id, selected.nama)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 border border-red-200"
              >
                <Trash2 size={15} /> Hapus Mapel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tambah */}
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
