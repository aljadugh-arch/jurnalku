import { useState, useEffect, useRef } from 'react'
import api from '../../services/api'
import { verifySavedCount, verifyGradeRows } from '../../lib/gradeVerification'
import { ScrollText, Save, Users, GraduationCap } from 'lucide-react'

type Opt = { id: string; nama: string }
type SiswaRow = { id: string; nama: string; nis: string }
type NilaiEntry = { sts: number | ''; sas: number | '' }

const TAHUN_AJARAN_DEFAULT = (() => {
  const now = new Date()
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}/${y + 1}`
})()

export default function GuruNilaiSumatifPage() {
  const [mapelList, setMapelList] = useState<Opt[]>([])
  const [rombelList, setRombelList] = useState<Opt[]>([])
  const [selectedMapel, setSelectedMapel] = useState('')
  const [selectedRombel, setSelectedRombel] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState(TAHUN_AJARAN_DEFAULT)
  const [semester, setSemester] = useState('ganjil')
  const [siswaList, setSiswaList] = useState<SiswaRow[]>([])
  const [nilai, setNilai] = useState<Record<string, NilaiEntry>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loadedScope, setLoadedScope] = useState('')
  const requestId = useRef(0)
  const scopeKey = JSON.stringify([selectedMapel, selectedRombel, tahunAjaran, semester])
  const ready = loadedScope === scopeKey && !loading && !loadError

  useEffect(() => { loadScope() }, [])
  useEffect(() => {
    if (selectedMapel && selectedRombel) loadSiswaDanNilai()
    else { setSiswaList([]); setNilai({}); setLoadedScope('') }
    // Invalidate the latest request, not a DOM ref captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { requestId.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMapel, selectedRombel, tahunAjaran, semester])

  const loadScope = async () => {
    try {
      const { data } = await api.get('/guru/pengajar-saya')
      setMapelList(data.mapel || [])
      setRombelList(data.rombel || [])
      if (data.mapel?.[0]) setSelectedMapel(data.mapel[0].id)
      if (data.rombel?.[0]) setSelectedRombel(data.rombel[0].id)
    } catch { setLoadError('Gagal memuat daftar mapel/kelas. Muat ulang halaman untuk mencoba kembali.') }
  }

  const loadSiswaDanNilai = async () => {
    const request = ++requestId.current
    setLoading(true); setLoadError(''); setLoadedScope(''); setMsg('')
    setSiswaList([]); setNilai({})
    try {
      const { data: siswa } = await api.get('/siswa', { params: { rombel_id: selectedRombel } })
      if (request !== requestId.current) return
      const [{ data: sts }, { data: sas }] = await Promise.all([
        api.get('/rapor', { params: { tahun_ajaran: tahunAjaran, semester, jenis: 'sts' } }),
        api.get('/rapor', { params: { tahun_ajaran: tahunAjaran, semester, jenis: 'sas' } }),
      ])
      const seed: Record<string, NilaiEntry> = {}
      for (const s of siswa) {
        const match = (r: any) => r.siswa_id === s.id && r.mapel_id === selectedMapel
        // Both canonical assessment rows store the raw exam grade in nilai_sts.
        seed[s.id] = { sts: sts.find(match)?.nilai_sts ?? '', sas: sas.find(match)?.nilai_sts ?? '' }
      }
      if (request !== requestId.current) return
      setSiswaList(siswa)
      setNilai(seed)
      setLoadedScope(scopeKey)
    } catch {
      if (request === requestId.current) setLoadError('Gagal memuat nilai. Penyimpanan dinonaktifkan agar nilai lama tidak tertimpa.')
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }

  const updateNilai = (siswaId: string, field: 'sts' | 'sas', value: string) => {
    setNilai(prev => ({ ...prev, [siswaId]: { ...prev[siswaId], [field]: value === '' ? '' : Number(value) } }))
  }

  const handleSave = async () => {
    if (!ready || saving) return
    if (!selectedMapel || !selectedRombel) { setMsg('✗ Pilih mata pelajaran dan kelas terlebih dahulu'); return }
    setSaving(true); setMsg('')
    try {
      const items = siswaList.map(s => ({
        siswa_id: s.id,
        mapel_id: selectedMapel,
        nilai_sts: nilai[s.id]?.sts === '' ? undefined : nilai[s.id]?.sts,
        nilai_sas: nilai[s.id]?.sas === '' ? undefined : nilai[s.id]?.sas,
      })).filter(item => item.nilai_sts != null || item.nilai_sas != null)
      if (!items.length) { setMsg('✗ Masukkan nilai untuk minimal 1 siswa'); return }
      const { data } = await api.post('/rapor/nilai-sumatif', { tahun_ajaran: tahunAjaran, semester, items })
      verifySavedCount(data.count, items.length)
      const [{ data: sts }, { data: sas }] = await Promise.all([
        api.get('/rapor', { params: { tahun_ajaran: tahunAjaran, semester, jenis: 'sts' } }),
        api.get('/rapor', { params: { tahun_ajaran: tahunAjaran, semester, jenis: 'sas' } }),
      ])
      verifyGradeRows(items.filter(item => item.nilai_sts != null), sts, ['siswa_id', 'mapel_id'], ['nilai_sts'])
      verifyGradeRows(items.filter(item => item.nilai_sas != null).map(item => ({ ...item, nilai_sts: item.nilai_sas })), sas, ['siswa_id', 'mapel_id'], ['nilai_sts'])
      setMsg(`✓ ${items.length} nilai berhasil disimpan dan terverifikasi`)
    } catch (e: any) {
      setLoadedScope('')
      setLoadError('Penyimpanan belum terverifikasi. Muat ulang nilai sebelum mencoba lagi.')
      setMsg(`✗ ${e.response?.data?.error || e.message || 'Gagal menyimpan nilai sumatif'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white">Nilai STS &amp; SAS</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Input nilai Sumatif Tengah Semester (STS) dan Sumatif Akhir Semester (SAS) untuk kelas/mapel yang Anda ampu</p>
      </div>

      {loadError && <div role="alert" className="rounded-lg p-4 bg-red-50 text-red-700">{loadError} {selectedMapel && selectedRombel && <button onClick={loadSiswaDanNilai}>Coba lagi</button>}</div>}

      {msg && (
        <div className={`rounded-lg p-4 text-sm ${msg.startsWith('✓') ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'}`}>
          {msg}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mata Pelajaran</label>
            <select disabled={saving} value={selectedMapel} onChange={e => setSelectedMapel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="">Pilih Mapel</option>
              {mapelList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kelas</label>
            <select disabled={saving} value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="">Pilih Kelas</option>
              {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tahun Ajaran</label>
            <input disabled={saving} value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} placeholder="2026/2027"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Semester</label>
            <select disabled={saving} value={semester} onChange={e => setSemester(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleSave} disabled={!ready || saving || !selectedMapel || !selectedRombel || siswaList.length === 0}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan Nilai'}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400">Memuat...</div>
      )}

      {ready && selectedMapel && selectedRombel && siswaList.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">NIS</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nama Siswa</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">STS<br/>(0-100)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">SAS<br/>(0-100)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {siswaList.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 font-mono">{s.nis}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{s.nama}</td>
                    <td className="px-4 py-3">
                      <input disabled={saving || !ready} type="number" min="0" max="100" value={nilai[s.id]?.sts ?? ''}
                        onChange={e => updateNilai(s.id, 'sts', e.target.value)}
                        className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </td>
                    <td className="px-4 py-3">
                      <input disabled={saving || !ready} type="number" min="0" max="100" value={nilai[s.id]?.sas ?? ''}
                        onChange={e => updateNilai(s.id, 'sas', e.target.value)}
                        className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ready && selectedMapel && selectedRombel && siswaList.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-12 text-center text-gray-400">
          <Users size={48} className="mx-auto mb-4 opacity-50" />
          <p>Tidak ada siswa di kelas ini</p>
        </div>
      )}

      {!loading && (!selectedMapel || !selectedRombel) && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-12 text-center text-gray-400">
          <GraduationCap size={48} className="mx-auto mb-4 opacity-50" />
          <p>Pilih mata pelajaran dan kelas untuk mulai input nilai STS/SAS</p>
        </div>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
        <ScrollText size={14} /> Nilai ini akan otomatis dipakai saat admin/kepala men-generate rapor akhir semester.
      </div>
    </div>
  )
}
