import { useState, useEffect } from 'react'
import api from '../../services/api'
import { ScrollText, Save, Users, GraduationCap } from 'lucide-react'
import ImportNilaiAsesmenExcel from '../../components/ImportNilaiAsesmenExcel'

type Opt = { id: string; nama: string }
type SiswaRow = { id: string; nama: string; nis: string }

const TAHUN_AJARAN_DEFAULT = (() => {
  const now = new Date()
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}/${y + 1}`
})()

export default function GuruNilaiSTSPage() {
  const [mapelList, setMapelList] = useState<Opt[]>([])
  const [rombelList, setRombelList] = useState<Opt[]>([])
  const [selectedMapel, setSelectedMapel] = useState('')
  const [selectedRombel, setSelectedRombel] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState(TAHUN_AJARAN_DEFAULT)
  const [semester, setSemester] = useState('ganjil')
  const [siswaList, setSiswaList] = useState<SiswaRow[]>([])
  const [nilai, setNilai] = useState<Record<string, number | ''>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadScope() }, [])
  useEffect(() => {
    if (selectedMapel && selectedRombel) loadSiswaDanNilai()
    else { setSiswaList([]); setNilai({}) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMapel, selectedRombel, tahunAjaran, semester])

  const loadScope = async () => {
    try {
      const { data } = await api.get('/guru/pengajar-saya')
      setMapelList(data.mapel || [])
      setRombelList(data.rombel || [])
      if (data.mapel?.[0]) setSelectedMapel(data.mapel[0].id)
      if (data.rombel?.[0]) setSelectedRombel(data.rombel[0].id)
    } catch (e) { console.error(e) }
  }

  const loadSiswaDanNilai = async () => {
    setLoading(true)
    try {
      const { data: siswa } = await api.get('/siswa', { params: { rombel_id: selectedRombel } })
      setSiswaList(siswa)
      // Ambil asesmen STS yang sudah tersimpan
      const { data: rapor } = await api.get('/rapor', { params: { tahun_ajaran: tahunAjaran, semester, jenis: 'sts' } })
      const seed: Record<string, number | ''> = {}
      for (const s of siswa) {
        const existing = rapor.find((r: any) => r.siswa_id === s.id && r.mapel_id === selectedMapel)
        seed[s.id] = existing?.nilai_sts ?? ''
      }
      setNilai(seed)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!selectedMapel || !selectedRombel) { setMsg('✗ Pilih mata pelajaran dan kelas terlebih dahulu'); return }
    setSaving(true); setMsg('')
    try {
      // Filter: hanya kirim siswa yang punya nilai > 0 (tidak kosong)
      const items = siswaList
        .filter(s => {
          const v = nilai[s.id]
          const numVal = typeof v === 'string' ? Number(v) : v
          return v !== '' && v !== undefined && numVal > 0
        })
        .map(s => ({
          siswa_id: s.id,
          mapel_id: selectedMapel,
          nilai: typeof nilai[s.id] === 'string' ? Number(nilai[s.id]) : (nilai[s.id] || 0)
        }))
      
      if (items.length === 0) { setMsg('✗ Masukkan nilai untuk minimal 1 siswa'); return }
      
      const { data } = await api.post('/rapor/asesmen', { jenis: 'sts', tahun_ajaran: tahunAjaran, semester, rombel_id: selectedRombel, items })
      setMsg(`✓ ${data.message}`)
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal menyimpan nilai STS'}`)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white">Nilai Asesmen STS</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Input nilai Sumatif Tengah Semester (STS) — hasil asesmen ujian tengah semester per mapel yang Anda ampu
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg p-4 text-sm ${msg.startsWith('✓') ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'}`}>
          {msg}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mata Pelajaran</label>
            <select value={selectedMapel} onChange={e => setSelectedMapel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="">Pilih Mapel</option>
              {mapelList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kelas</label>
            <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="">Pilih Kelas</option>
              {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tahun Ajaran</label>
            <input value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} placeholder="2026/2027"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Semester</label>
            <select value={semester} onChange={e => setSemester(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleSave} disabled={saving || !selectedMapel || !selectedRombel || siswaList.length === 0}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan Nilai STS'}
            </button>
          </div>
        </div>
      </div>

      {selectedMapel && selectedRombel && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Impor dari Excel/CSV</h3>
          <ImportNilaiAsesmenExcel
            jenis="sts"
            rombel_id={selectedRombel}
            selectedMapel={selectedMapel}
            tahunAjaran={tahunAjaran}
            semester={semester}
            onSuccess={() => loadSiswaDanNilai()}
          />
        </div>
      )}

      {loading && <div className="text-center py-12 text-gray-400">Memuat...</div>}

      {!loading && selectedMapel && selectedRombel && siswaList.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">NIS</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nama Siswa</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-40">
                    Nilai STS<br/><span className="font-normal normal-case">(Asesmen Ujian, 0–100)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {siswaList.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 font-mono">{s.nis}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{s.nama}</td>
                    <td className="px-4 py-3">
                      <input type="number" min="0" max="100" value={nilai[s.id] ?? ''}
                        onChange={e => setNilai(prev => ({ ...prev, [s.id]: e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value))) }))}
                        className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && selectedMapel && selectedRombel && siswaList.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-12 text-center text-gray-400">
          <Users size={48} className="mx-auto mb-4 opacity-50" />
          <p>Tidak ada siswa di kelas ini</p>
        </div>
      )}

      {!loading && (!selectedMapel || !selectedRombel) && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-12 text-center text-gray-400">
          <GraduationCap size={48} className="mx-auto mb-4 opacity-50" />
          <p>Pilih mata pelajaran dan kelas untuk mulai input nilai STS</p>
        </div>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
        <ScrollText size={14} />
        Nilai STS digunakan saat admin men-generate Rapor STS: <strong>Nilai Rapor STS = Nilai Harian × 60% + Nilai Asesmen STS × 40%</strong>
      </div>
    </div>
  )
}
