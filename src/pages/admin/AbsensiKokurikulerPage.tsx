import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, Save, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function AbsensiKokurikulerPage() {
  const [kegiatanList, setKegiatanList] = useState<any[]>([])
  const [selectedKegiatan, setSelectedKegiatan] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newNama, setNewNama] = useState('')
  const [newTanggal, setNewTanggal] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { loadKegiatan() }, [])
  useEffect(() => {
    if (selectedKegiatan) loadAbsensi()
  }, [selectedKegiatan])

  const loadKegiatan = async () => {
    const res = await api.get('/kegiatan-khusus', { params: { jenis: 'kokurikuler' } })
    setKegiatanList(res.data)
    if (res.data.length > 0 && !selectedKegiatan) setSelectedKegiatan(res.data[0].id)
  }

  const loadAbsensi = async () => {
    const [abRes, siswaRes] = await Promise.all([
      api.get('/absensi-kegiatan', { params: { kegiatan_id: selectedKegiatan } }),
      api.get('/siswa')
    ])
    setSiswaList(siswaRes.data)
    const map: Record<string, string> = {}
    abRes.data.forEach((a: any) => { map[a.siswa_id] = a.status })
    setAbsensi(map)
  }

  const setStatus = (siswaId: string, status: string) => {
    setAbsensi(prev => ({ ...prev, [siswaId]: status }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const kegiatan = kegiatanList.find(k => k.id === selectedKegiatan)
      const data = siswaList.map(s => ({ siswa_id: s.id, status: absensi[s.id] || 'hadir' }))
      await api.post('/absensi-kegiatan/bulk', { kegiatan_id: selectedKegiatan, tanggal: kegiatan?.tanggal || '', data })
      toast.success('Absensi kokurikuler berhasil disimpan')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const handleAddKegiatan = async () => {
    if (!newNama.trim()) return
    try {
      await api.post('/kegiatan-khusus', { nama: newNama, jenis: 'kokurikuler', tanggal: newTanggal })
      toast.success('Kegiatan ditambahkan')
      setShowAdd(false)
      setNewNama('')
      loadKegiatan()
    } catch { toast.error('Gagal menambah kegiatan') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus kegiatan ini?')) return
    await api.delete('/kegiatan-khusus/' + id)
    toast.success('Kegiatan dihapus')
    loadKegiatan()
    if (selectedKegiatan === id) setSelectedKegiatan('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Kokurikuler</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap kehadiran kegiatan kokurikuler (P5, dll)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
            <Plus size={16} /> Tambah Kegiatan
          </button>
          <button onClick={handleSave} disabled={saving || !selectedKegiatan} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> Simpan
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 items-start">
        <select value={selectedKegiatan} onChange={e => setSelectedKegiatan(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm flex-1">
          {kegiatanList.length === 0 && <option value="">Belum ada kegiatan</option>}
          {kegiatanList.map(k => <option key={k.id} value={k.id}>{k.nama} ({k.tanggal || '-'})</option>)}
        </select>
        {selectedKegiatan && (
          <button onClick={() => handleDelete(selectedKegiatan)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIS</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Hadir</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Sakit</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Alpha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {siswaList.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Tidak ada data siswa</td></tr>}
              {siswaList.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nis}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'hadir')} className={`p-1.5 rounded-full ${(absensi[s.id] || 'hadir') === 'hadir' ? 'bg-green-100 text-green-700' : 'text-gray-300 hover:text-green-500'}`}><CheckCircle size={20} /></button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'sakit')} className={`p-1.5 rounded-full ${absensi[s.id] === 'sakit' ? 'bg-yellow-100 text-yellow-700' : 'text-gray-300 hover:text-yellow-500'}`}><Clock size={20} /></button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'alpha')} className={`p-1.5 rounded-full ${absensi[s.id] === 'alpha' ? 'bg-red-100 text-red-700' : 'text-gray-300 hover:text-red-500'}`}><XCircle size={20} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Tambah Kegiatan Kokurikuler</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Kegiatan</label>
                <input value={newNama} onChange={e => setNewNama(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Projek P5 - Kearifan Lokal" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal</label>
                <input type="date" value={newTanggal} onChange={e => setNewTanggal(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg text-sm">Batal</button>
              <button onClick={handleAddKegiatan} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
