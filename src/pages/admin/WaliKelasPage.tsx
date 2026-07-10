import { useState, useEffect } from 'react'
import { Edit, X, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function WaliKelasPage() {
  const [rombels, setRombels] = useState<any[]>([])
  const [gtkList, setGtkList] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [selectedGtk, setSelectedGtk] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [r, g] = await Promise.all([api.get('/rombel'), api.get('/gtk')])
    setRombels(r.data)
    setGtkList(g.data)
  }

  const openEdit = (rombel: any) => {
    setEditing(rombel)
    setSelectedGtk(rombel.wali_kelas_id || '')
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      await api.put('/rombel/' + editing.id, {
        nama: editing.nama,
        tingkat: editing.tingkat,
        tahun_ajaran: editing.tahun_ajaran,
        wali_kelas_id: selectedGtk || null,
        kapasitas: editing.kapasitas
      })
      toast.success('Wali kelas diperbarui')
      setShowModal(false)
      loadData()
    } catch { toast.error('Gagal menyimpan') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Wali Kelas</h1>
        <p className="text-gray-500 text-sm mt-1">Penugasan wali kelas per rombel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rombels.length === 0 && (
          <p className="col-span-3 text-center text-gray-400 py-8">Belum ada data rombel</p>
        )}
        {rombels.map((rombel) => (
          <div key={rombel.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-bold rounded-lg">{rombel.nama}</span>
              <button onClick={() => openEdit(rombel)} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg"><Edit size={16} /></button>
            </div>
            <h3 className="font-medium text-gray-800">{rombel.wali_kelas_nama || <span className="text-gray-400 italic">Belum ditentukan</span>}</h3>
            <div className="mt-3 pt-3 border-t flex justify-between text-sm">
              <span className="text-gray-500 flex items-center gap-1"><Users size={14} /> Jumlah Siswa</span>
              <span className="font-medium text-gray-700">{rombel.jumlah_siswa || 0}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Edit Wali Kelas */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit Wali Kelas</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-3">Rombel: <strong>{editing?.nama}</strong></p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Wali Kelas</label>
              <select value={selectedGtk} onChange={e => setSelectedGtk(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">-- Belum Ditentukan --</option>
                {gtkList.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
              </select>
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
