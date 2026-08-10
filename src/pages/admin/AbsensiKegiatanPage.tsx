import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, Save, Plus, Trash2, BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function AbsensiKegiatanPage() {
  const [kegiatanList, setKegiatanList] = useState<any[]>([])
  const [selectedKegiatan, setSelectedKegiatan] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newNama, setNewNama] = useState('')
  const [newTanggal, setNewTanggal] = useState(new Date().toISOString().split('T')[0])
  const [sesiTanggal, setSesiTanggal] = useState(new Date().toISOString().split('T')[0])
  const [showRekap, setShowRekap] = useState(false)
  const [rekapRange, setRekapRange] = useState({ mulai: '', selesai: new Date().toISOString().split('T')[0] })
  const [rekapData, setRekapData] = useState<any>(null)
  const [rekapLoading, setRekapLoading] = useState(false)

  useEffect(() => { loadKegiatan() }, [])
  useEffect(() => {
    if (selectedKegiatan) loadAbsensi()
  }, [selectedKegiatan, sesiTanggal])

  const loadKegiatan = async () => {
    const res = await api.get('/kegiatan-khusus', { params: { jenis: 'insidental' } })
    setKegiatanList(res.data)
    if (res.data.length > 0 && !selectedKegiatan) setSelectedKegiatan(res.data[0].id)
  }

  const loadAbsensi = async () => {
    const [abRes, siswaRes] = await Promise.all([
      api.get('/absensi-kegiatan', { params: { kegiatan_id: selectedKegiatan, tanggal: sesiTanggal } }),
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
      const data = siswaList.map(s => ({ siswa_id: s.id, status: absensi[s.id] || 'hadir' }))
      await api.post('/absensi-kegiatan/bulk', { kegiatan_id: selectedKegiatan, tanggal: sesiTanggal, data })
      toast.success('Absensi kegiatan (sesi ' + sesiTanggal + ') berhasil disimpan')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const handleAddKegiatan = async () => {
    if (!newNama.trim()) return
    try {
      await api.post('/kegiatan-khusus', { nama: newNama, jenis: 'insidental', tanggal: newTanggal })
      toast.success('Kegiatan ditambahkan')
      setShowAdd(false)
      setNewNama('')
      loadKegiatan()
    } catch { toast.error('Gagal menambah kegiatan') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus kegiatan ini? Semua rekap absensinya ikut terhapus.')) return
    await api.delete('/kegiatan-khusus/' + id)
    toast.success('Kegiatan dihapus')
    loadKegiatan()
    if (selectedKegiatan === id) setSelectedKegiatan('')
  }

  const openRekap = () => {
    const d = new Date(sesiTanggal || new Date())
    const mulai = new Date(d); mulai.setDate(d.getDate() - 6)
    setRekapRange({ mulai: mulai.toISOString().split('T')[0], selesai: sesiTanggal })
    setShowRekap(true)
  }

  const loadRekap = async () => {
    if (!selectedKegiatan || !rekapRange.mulai || !rekapRange.selesai) return
    setRekapLoading(true)
    try {
      const res = await api.get('/absensi-kegiatan/rekap', { params: { kegiatan_id: selectedKegiatan, mulai: rekapRange.mulai, selesai: rekapRange.selesai } })
      setRekapData(res.data)
    } catch { toast.error('Gagal memuat rekap') }
    finally { setRekapLoading(false) }
  }

  useEffect(() => { if (showRekap) loadRekap() }, [showRekap, rekapRange.mulai, rekapRange.selesai])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Kegiatan Tertentu</h1>
          <p className="text-gray-500 text-sm mt-1">Absensi manual untuk kegiatan khusus/insidental (mis. shalat jamaah), input per sesi/tanggal lalu rekap mingguan</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
            <Plus size={16} /> Buat Kegiatan
          </button>
          <button onClick={openRekap} disabled={!selectedKegiatan} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50">
            <BarChart3 size={16} /> Rekap Mingguan
          </button>
          <button onClick={handleSave} disabled={saving || !selectedKegiatan} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> Simpan
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <select value={selectedKegiatan} onChange={e => setSelectedKegiatan(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm flex-1">
          {kegiatanList.length === 0 && <option value="">Belum ada kegiatan</option>}
          {kegiatanList.map(k => <option key={k.id} value={k.id}>{k.nama} ({k.tanggal || '-'})</option>)}
        </select>
        <div>
          <label className="text-xs text-gray-500 mr-2">Tanggal Sesi</label>
          <input type="date" value={sesiTanggal} onChange={e => setSesiTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
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
                <th className="text-center px-4 py-3 font-medium text-gray-600">Izin</th>
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
                    <button onClick={() => setStatus(s.id, 'izin')} className={`p-1.5 rounded-full ${absensi[s.id] === 'izin' ? 'bg-blue-100 text-blue-700' : 'text-gray-300 hover:text-blue-500'}`}><Clock size={20} /></button>
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
            <h2 className="text-lg font-bold text-gray-800 mb-4">Tambah Kegiatan</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Kegiatan</label>
                <input value={newNama} onChange={e => setNewNama(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Shalat Jamaah / Upacara Hari Kemerdekaan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Mulai</label>
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

      {showRekap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRekap(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Rekap Kehadiran</h2>
            <p className="text-xs text-gray-500 mb-4">Minimal 10x sesi tercatat untuk dinilai. Hadir 100% dari sesi yang tercatat = "Lulus/Baik".</p>
            <div className="flex gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dari</label>
                <input type="date" value={rekapRange.mulai} onChange={e => setRekapRange(r => ({ ...r, mulai: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sampai</label>
                <input type="date" value={rekapRange.selesai} onChange={e => setRekapRange(r => ({ ...r, selesai: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            {rekapLoading && <p className="text-sm text-gray-400 text-center py-6">Memuat...</p>}
            {!rekapLoading && rekapData && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">NIS</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Nama</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Sesi</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Hadir</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">%</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rekapData.data.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Belum ada data absensi pada rentang ini</td></tr>}
                    {rekapData.data.map((r: any) => (
                      <tr key={r.siswa_id}>
                        <td className="px-3 py-2 font-mono">{r.nis}</td>
                        <td className="px-3 py-2 font-medium">{r.nama}</td>
                        <td className="px-3 py-2 text-center">{r.total_sesi}</td>
                        <td className="px-3 py-2 text-center">{r.hadir}</td>
                        <td className="px-3 py-2 text-center">{r.persen}%</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.keterangan === 'Lulus/Baik' ? 'bg-green-100 text-green-700' : r.syarat_terpenuhi ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{r.keterangan}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end mt-5">
              <button onClick={() => setShowRekap(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg text-sm">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
