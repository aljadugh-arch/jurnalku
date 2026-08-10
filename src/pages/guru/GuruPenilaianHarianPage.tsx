import { useState, useEffect } from 'react'
import api from '../../services/api'
import { BookOpen, Save, Users } from 'lucide-react'

export default function GuruPenilaianHarianPage() {
  const [mapelList, setMapelList] = useState<any[]>([])
  const [rombelList, setRombelList] = useState<any[]>([])
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [selectedMapel, setSelectedMapel] = useState('')
  const [selectedRombel, setSelectedRombel] = useState('')
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0])
  const [penilaianData, setPenilaianData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    loadPengajarSaya()
  }, [])

  useEffect(() => {
    if (selectedRombel) {
      loadSiswa()
    }
  }, [selectedRombel])

  // Auto-scope: hanya mapel & kelas yg diampu guru ini (dari data Pengajar)
  const loadPengajarSaya = async () => {
    try {
      const { data } = await api.get('/guru/pengajar-saya')
      setMapelList(data.mapel || [])
      setRombelList(data.rombel || [])
    } catch (e) {
      console.error(e)
    }
  }

  const loadSiswa = async () => {
    try {
      const { data } = await api.get(`/siswa?rombel_id=${selectedRombel}`)
      setSiswaList(data)
      // Initialize penilaian data
      const initial = data.map((s: any) => ({
        siswa_id: s.id,
        nama: s.nama,
        nis: s.nis,
        sikap: 0,
        keaktifan: 0,
        pengetahuan: 0,
        catatan: ''
      }))
      setPenilaianData(initial)
      // Load existing penilaian if any
      loadExistingPenilaian(data.map((s: any) => s.id))
    } catch (e) {
      console.error(e)
    }
  }

  const loadExistingPenilaian = async (siswaIds: string[]) => {
    if (!selectedMapel || !tanggal) return
    try {
      const { data } = await api.get(`/penilaian-harian?mapel_id=${selectedMapel}&tanggal_from=${tanggal}&tanggal_to=${tanggal}`)
      // Merge with existing data
      setPenilaianData(prev => prev.map(p => {
        const existing = data.find((e: any) => e.siswa_id === p.siswa_id)
        return existing ? { ...p, ...existing } : p
      }))
    } catch (e) {
      console.error(e)
    }
  }

  const updatePenilaian = (siswa_id: string, field: string, value: any) => {
    setPenilaianData(prev => prev.map(p => 
      p.siswa_id === siswa_id ? { ...p, [field]: value } : p
    ))
  }

  const handleSave = async () => {
    if (!selectedMapel || !selectedRombel || !tanggal) {
      alert('Pilih mapel, kelas, dan tanggal terlebih dahulu')
      return
    }

    setLoading(true)
    setSuccess(false)
    try {
      await api.post('/penilaian-harian/bulk', {
        mapel_id: selectedMapel,
        tanggal,
        data: penilaianData.map(p => ({
          siswa_id: p.siswa_id,
          sikap: parseInt(p.sikap) || 0,
          keaktifan: parseInt(p.keaktifan) || 0,
          pengetahuan: parseInt(p.pengetahuan) || 0,
          catatan: p.catatan || ''
        }))
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Gagal menyimpan penilaian')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800">Penilaian Harian Siswa</h1>
          <p className="text-gray-500 mt-1">Input nilai sikap, keaktifan, dan pengetahuan siswa</p>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          ✓ Penilaian berhasil disimpan
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={e => setTanggal(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mata Pelajaran</label>
            <select
              value={selectedMapel}
              onChange={e => setSelectedMapel(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Pilih Mapel</option>
              {mapelList.map(m => (
                <option key={m.id} value={m.id}>{m.nama}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kelas</label>
            <select
              value={selectedRombel}
              onChange={e => setSelectedRombel(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Pilih Kelas</option>
              {rombelList.map(r => (
                <option key={r.id} value={r.id}>{r.nama}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSave}
              disabled={loading || !selectedMapel || !selectedRombel || siswaList.length === 0}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {loading ? 'Menyimpan...' : 'Simpan Penilaian'}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      {selectedMapel && selectedRombel && siswaList.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <Users size={16} className="inline mr-1" />
          <strong>{siswaList.length} siswa</strong> di kelas ini. 
          Skala nilai: <strong>0-100</strong>. Sikap & Keaktifan bisa observasi, Pengetahuan bisa dari quiz/tugas harian.
        </div>
      )}

      {/* Penilaian Table */}
      {selectedMapel && selectedRombel && siswaList.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">NIS</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Siswa</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">Sikap<br/>(0-100)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">Keaktifan<br/>(0-100)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">Pengetahuan<br/>(0-100)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {penilaianData.map((p, idx) => (
                  <tr key={p.siswa_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{p.nis}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.nama}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={p.sikap}
                        onChange={e => updatePenilaian(p.siswa_id, 'sikap', e.target.value)}
                        className="w-full px-2 py-1 text-center border rounded focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={p.keaktifan}
                        onChange={e => updatePenilaian(p.siswa_id, 'keaktifan', e.target.value)}
                        className="w-full px-2 py-1 text-center border rounded focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={p.pengetahuan}
                        onChange={e => updatePenilaian(p.siswa_id, 'pengetahuan', e.target.value)}
                        className="w-full px-2 py-1 text-center border rounded focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={p.catatan}
                        onChange={e => updatePenilaian(p.siswa_id, 'catatan', e.target.value)}
                        placeholder="Catatan (opsional)"
                        className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedMapel && selectedRombel && siswaList.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-400">
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p>Tidak ada siswa di kelas ini</p>
        </div>
      )}

      {(!selectedMapel || !selectedRombel) && (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-400">
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p>Pilih mata pelajaran dan kelas untuk mulai input penilaian</p>
        </div>
      )}
    </div>
  )
}
