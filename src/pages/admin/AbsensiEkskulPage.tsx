import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, Save, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function AbsensiEkskulPage() {
  const [ekskulList, setEkskulList] = useState<any[]>([])
  const [selectedEkskul, setSelectedEkskul] = useState('')
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0])
  const [allSiswa, setAllSiswa] = useState<any[]>([])
  const [anggota, setAnggota] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showMember, setShowMember] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [savingMember, setSavingMember] = useState(false)

  useEffect(() => {
    api.get('/ekskul').then(res => {
      setEkskulList(res.data)
      if (res.data.length > 0) setSelectedEkskul(res.data[0].id)
    })
    api.get('/siswa').then(res => setAllSiswa(res.data))
  }, [])

  const loadAnggota = () => {
    if (!selectedEkskul) return
    api.get(`/ekskul/${selectedEkskul}/anggota`).then(res => setAnggota(res.data))
  }

  useEffect(() => { loadAnggota() }, [selectedEkskul])

  useEffect(() => {
    if (selectedEkskul && tanggal) {
      api.get('/absensi-ekskul', { params: { ekskul_id: selectedEkskul, tanggal } }).then(res => {
        const map: Record<string, string> = {}
        res.data.forEach((a: any) => { map[a.siswa_id] = a.status })
        setAbsensi(map)
      })
    }
  }, [selectedEkskul, tanggal])

  // Peserta: anggota terdaftar; fallback ke seluruh siswa bila belum ada anggota
  const peserta = anggota.length > 0 ? anggota : allSiswa

  const setStatus = (siswaId: string, status: string) => {
    setAbsensi(prev => ({ ...prev, [siswaId]: status }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = peserta.map(s => ({ siswa_id: s.id, status: absensi[s.id] || 'hadir' }))
      await api.post('/absensi-ekskul/bulk', { ekskul_id: selectedEkskul, tanggal, data })
      toast.success('Absensi ekskul berhasil disimpan')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const openMember = () => {
    setPicked(new Set(anggota.map(a => a.id)))
    setShowMember(true)
  }

  const toggle = (id: string) => {
    setPicked(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const saveMember = async () => {
    setSavingMember(true)
    try {
      await api.post(`/ekskul/${selectedEkskul}/anggota`, { siswa_ids: [...picked] })
      toast.success('Anggota ekskul disimpan')
      setShowMember(false); loadAnggota()
    } catch { toast.error('Gagal menyimpan anggota') }
    finally { setSavingMember(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Ekstrakurikuler</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap kehadiran kegiatan ekskul{anggota.length > 0 ? ` (${anggota.length} anggota)` : ' — belum ada anggota, tampil semua siswa'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openMember} disabled={!selectedEkskul} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
            <Users size={16} /> Kelola Anggota
          </button>
          <button onClick={handleSave} disabled={saving || !selectedEkskul} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Absensi'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <select value={selectedEkskul} onChange={e => setSelectedEkskul(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {ekskulList.length === 0 && <option value="">Belum ada ekskul</option>}
          {ekskulList.map(e => <option key={e.id} value={e.id}>{e.nama} - {e.pembina_nama || 'TBA'} ({e.hari || '-'})</option>)}
        </select>
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
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
              {peserta.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Tidak ada peserta</td></tr>
              )}
              {peserta.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nis}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'hadir')} className={`p-1.5 rounded-full ${(absensi[s.id] || 'hadir') === 'hadir' ? 'bg-green-100 text-green-700' : 'text-gray-300 hover:text-green-500'}`}>
                      <CheckCircle size={20} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'izin')} className={`p-1.5 rounded-full ${absensi[s.id] === 'izin' ? 'bg-blue-100 text-blue-700' : 'text-gray-300 hover:text-blue-500'}`}>
                      <Clock size={20} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setStatus(s.id, 'alpha')} className={`p-1.5 rounded-full ${absensi[s.id] === 'alpha' ? 'bg-red-100 text-red-700' : 'text-gray-300 hover:text-red-500'}`}>
                      <XCircle size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Kelola Anggota Ekskul</h2>
              <button onClick={() => setShowMember(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Centang siswa yang menjadi anggota. Terpilih: {picked.size}</p>
            <div className="flex-1 overflow-y-auto border rounded-lg divide-y">
              {allSiswa.length === 0 && <p className="p-4 text-center text-gray-400 text-sm">Belum ada data siswa</p>}
              {allSiswa.map(s => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="w-4 h-4" />
                  <span className="font-mono text-xs text-gray-500 w-24 shrink-0">{s.nis}</span>
                  <span className="text-sm text-gray-800">{s.nama}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowMember(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={saveMember} disabled={savingMember} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">{savingMember ? 'Menyimpan...' : 'Simpan Anggota'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
