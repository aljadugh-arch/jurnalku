import { useState, useEffect, useRef } from 'react'
import api from '../../services/api'
import { verifySavedCount, verifyGradeRows } from '../../lib/gradeVerification'
import { todayWib } from '../../lib/dateFormat'
import { BookOpen, Save, Users } from 'lucide-react'

export default function GuruPenilaianHarianPage() {
  const [rombelList, setRombelList] = useState<any[]>([])
  const [jadwalList, setJadwalList] = useState<any[]>([])
  const [contextSiswa, setContextSiswa] = useState<any[]>([])
  const [selectedJadwal, setSelectedJadwal] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [selectedMapel, setSelectedMapel] = useState('')
  const [selectedRombel, setSelectedRombel] = useState('')
  const [tanggal, setTanggal] = useState(todayWib())
  const [penilaianData, setPenilaianData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<number | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [dataLoading, setDataLoading] = useState(false)
  const [contextDate, setContextDate] = useState('')
  const [loadedScope, setLoadedScope] = useState('')
  const contextRequest = useRef(0)
  const gradeRequest = useRef(0)
  const scopeKey = JSON.stringify([selectedMapel, selectedRombel, tanggal])
  const ready = contextDate === tanggal && loadedScope === scopeKey && !dataLoading && !loadError

  useEffect(() => {
    loadJadwalContext(tanggal)
    // Invalidate the latest request, not a DOM ref captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { contextRequest.current++; gradeRequest.current++ }
  }, [tanggal])

  useEffect(() => {
    if (selectedMapel && selectedRombel && contextDate === tanggal) loadSiswa()
    // Invalidate the latest request, not a DOM ref captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { gradeRequest.current++ }
  // All grade scope inputs are listed; the loader is recreated each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMapel, selectedRombel, tanggal, contextSiswa, contextDate])

  // Auto-scope: hanya pasangan mapel/kelas pada jadwal tanggal terpilih.
  const loadJadwalContext = async (date: string) => {
    const request = ++contextRequest.current
    gradeRequest.current++
    setDataLoading(true); setLoadError(''); setSuccess(null)
    setContextDate(''); setLoadedScope('')
    setSiswaList([]); setPenilaianData([]); setJadwalList([]); setRombelList([])
    setSelectedJadwal(''); setSelectedMapel(''); setSelectedRombel('')
    try {
      const { data } = await api.get('/guru/jadwal-context', { params: { tanggal: date } })
      if (request !== contextRequest.current) return
      const rows = data.jadwal || []
      setJadwalList(rows)
      setContextSiswa(data.siswa || [])
      setRombelList([...new Map(rows.map((j: any) => [j.rombel_id, { id: j.rombel_id, nama: j.rombel_nama }])).values()] as any[])
      const first = rows[0]
      setSelectedJadwal(first?.jadwal_id || '')
      setSelectedMapel(first?.mapel_id || '')
      setSelectedRombel(first?.rombel_id || '')
      setContextDate(date)
    } catch {
      if (request === contextRequest.current) setLoadError('Gagal memuat jadwal/kelas. Coba lagi sebelum mengisi nilai.')
    } finally {
      if (request === contextRequest.current) setDataLoading(false)
    }
  }

  const loadSiswa = async () => {
    const request = ++gradeRequest.current
    setDataLoading(true); setLoadError(''); setLoadedScope(''); setSuccess(null)
    setSiswaList([]); setPenilaianData([])
    try {
      const siswa = contextSiswa.filter((s: any) => s.rombel_id === selectedRombel)
      const { data } = await api.get(`/penilaian-harian?mapel_id=${selectedMapel}&tanggal_from=${tanggal}&tanggal_to=${tanggal}`)
      if (request !== gradeRequest.current) return
      setPenilaianData(siswa.map((s: any) => {
        const existing = data.find((e: any) => e.siswa_id === s.id)
        return {
          siswa_id: s.id, nama: s.nama, nis: s.nis,
          sikap: existing?.sikap ?? '', keaktifan: existing?.keaktifan ?? '',
          pengetahuan: existing?.pengetahuan ?? '', catatan: existing?.catatan ?? ''
        }
      }))
      setSiswaList(siswa)
      setLoadedScope(scopeKey)
    } catch {
      if (request === gradeRequest.current) setLoadError('Gagal memuat nilai. Penyimpanan dinonaktifkan agar nilai lama tidak tertimpa.')
    } finally {
      if (request === gradeRequest.current) setDataLoading(false)
    }
  }

  const updatePenilaian = (siswa_id: string, field: string, value: any) => {
    setPenilaianData(prev => prev.map(p => 
      p.siswa_id === siswa_id ? { ...p, [field]: value } : p
    ))
  }

  const handleSave = async () => {
    if (!ready || loading) return
    if (!selectedMapel || !selectedRombel || !tanggal) {
      alert('Pilih mapel, kelas, dan tanggal terlebih dahulu')
      return
    }

    setSaveError('')
    const fields = ['sikap', 'keaktifan', 'pengetahuan']
    const filled = penilaianData.filter(p => fields.some(f => p[f] !== '' && p[f] != null) || p.catatan)
    if (!filled.length) { setSaveError('Masukkan nilai untuk minimal 1 siswa'); return }
    if (filled.some(p => fields.some(f => p[f] === '' || p[f] == null || !Number.isFinite(Number(p[f])) || Number(p[f]) < 0 || Number(p[f]) > 100))) {
      setSaveError('Lengkapi ketiga nilai 0–100 untuk setiap siswa yang diisi. Nilai kosong tidak diubah menjadi nol.')
      return
    }
    setLoading(true)
    setSuccess(null)
    try {
      const { data: result } = await api.post('/penilaian-harian/bulk', {
        mapel_id: selectedMapel,
        tanggal,
        data: filled.map(p => ({
          siswa_id: p.siswa_id,
          sikap: Number(p.sikap),
          keaktifan: Number(p.keaktifan),
          pengetahuan: Number(p.pengetahuan),
          catatan: p.catatan || ''
        }))
      })
      verifySavedCount(result.count, filled.length)
      const { data: persisted } = await api.get(`/penilaian-harian?mapel_id=${selectedMapel}&tanggal_from=${tanggal}&tanggal_to=${tanggal}`)
      verifyGradeRows(filled, persisted, ['siswa_id'], fields)
      if (filled.some(p => persisted.find((r: any) => r.siswa_id === p.siswa_id)?.catatan !== (p.catatan || ''))) {
        throw new Error('Verifikasi catatan gagal. Muat ulang nilai sebelum mencoba lagi.')
      }
      setSuccess(filled.length)
    } catch (err: any) {
      setLoadedScope('')
      setLoadError('Penyimpanan belum terverifikasi. Muat ulang nilai sebelum mencoba lagi.')
      setSaveError(err.response?.data?.error || err.message || 'Gagal menyimpan penilaian')
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

      {saveError && <div role="alert" className="rounded-lg p-4 bg-red-50 text-red-700">{saveError}</div>}
      {loadError && <div role="alert" className="rounded-lg p-4 bg-red-50 text-red-700">{loadError} <button onClick={() => contextDate === tanggal ? loadSiswa() : loadJadwalContext(tanggal)}>Coba lagi</button></div>}
      {dataLoading && <div role="status">Memuat nilai...</div>}

      {success !== null && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          ✓ {success} penilaian berhasil disimpan dan terverifikasi
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
              disabled={loading}
              onChange={e => setTanggal(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jadwal Mengajar</label>
            <select
              disabled={loading || contextDate !== tanggal}
              value={selectedJadwal}
              onChange={e => { const j = jadwalList.find(x => x.jadwal_id === e.target.value); setSelectedJadwal(e.target.value); setSelectedMapel(j?.mapel_id || ''); setSelectedRombel(j?.rombel_id || '') }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Pilih Jadwal</option>
              {jadwalList.map(j => (
                <option key={j.jadwal_id} value={j.jadwal_id}>{j.jam_mulai} · {j.mapel_nama} · {j.rombel_nama}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kelas</label>
            <select
              value={selectedRombel}
              disabled
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
              disabled={!ready || loading || !selectedMapel || !selectedRombel || siswaList.length === 0}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {loading ? 'Menyimpan...' : 'Simpan Penilaian'}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      {ready && selectedMapel && selectedRombel && siswaList.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <Users size={16} className="inline mr-1" />
          <strong>{siswaList.length} siswa</strong> di kelas ini. 
          Skala nilai: <strong>0-100</strong>. Sikap & Keaktifan bisa observasi, Pengetahuan bisa dari quiz/tugas harian.
        </div>
      )}

      {/* Penilaian Table */}
      {ready && selectedMapel && selectedRombel && siswaList.length > 0 && (
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
                        disabled={!ready || loading}
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
                        disabled={!ready || loading}
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
                        disabled={!ready || loading}
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
                        disabled={!ready || loading}
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

      {ready && selectedMapel && selectedRombel && siswaList.length === 0 && (
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
