import { useState, useEffect } from 'react'
import api from '../../services/api'
import { Download, Filter } from 'lucide-react'

type NilaiRow = {
  siswa_id: string
  siswa_nama: string
  siswa_nis: string
  mapel_id: string
  mapel_nama: string
  nilai_harian: number
  nilai_sts: number
  nilai_sas: number
  nilai_akhir: number
}

export default function GuruNilaiLedgerPage() {
  const [rombelList, setRombelList] = useState<any[]>([])
  const [ledger, setLedger] = useState<NilaiRow[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027')
  const [semester, setSemester] = useState('ganjil')
  const [jenis, setJenis] = useState<'rapor_sts' | 'rapor_sas' | 'semua'>('semua')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadRombel() }, [])
  useEffect(() => { if (selectedRombel) loadLedger() }, [selectedRombel, tahunAjaran, semester, jenis])

  const loadRombel = async () => {
    try {
      const { data } = await api.get('/guru/pengajar-saya')
      setRombelList(data.rombel || [])
      if (data.rombel?.[0]) setSelectedRombel(data.rombel[0].id)
    } catch (e) { console.error(e); setMsg('✗ Gagal memuat daftar kelas') }
  }

  const loadLedger = async () => {
    setLoading(true); setMsg('')
    try {
      const { data } = await api.get('/rapor/ledger', {
        params: { rombel_id: selectedRombel, tahun_ajaran: tahunAjaran, semester, jenis }
      })
      setLedger(Array.isArray(data) ? data : data.data || [])
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal memuat ledger nilai'}`)
    } finally { setLoading(false) }
  }

  const exportExcel = async () => {
    if (ledger.length === 0) { setMsg('✗ Tidak ada data untuk diekspor'); return }
    
    try {
      // Download Excel dari backend
      const response = await api.get('/rapor/ledger/export', {
        params: { rombel_id: selectedRombel, tahun_ajaran: tahunAjaran, semester, jenis },
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Ledger-${selectedRombel}-${tahunAjaran}-${semester}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal download Excel'}`)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white">Ledger Nilai</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Daftar lengkap nilai siswa per mapel — ekspor ke Excel untuk arsip dan laporan
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kelas</label>
            <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="">Pilih Kelas</option>
              {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tahun Ajaran</label>
            <input value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jenis Rapor</label>
            <select value={jenis} onChange={e => setJenis(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="semua">Semua</option>
              <option value="rapor_sts">STS (Tengah Semester)</option>
              <option value="rapor_sas">SAS (Akhir Semester)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={exportExcel} disabled={loading || !selectedRombel || ledger.length === 0}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <Download size={18} /> {loading ? 'Memuat...' : 'Download Excel'}
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Memuat data...</div>}

      {!loading && selectedRombel && ledger.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">No</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">NIS</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Nama Siswa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Mapel</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Nilai Harian</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Nilai STS</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Nilai SAS</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Nilai Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {ledger.map((row, idx) => (
                  <tr key={`${row.siswa_id}-${row.mapel_id}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{row.siswa_nis}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.siswa_nama}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.mapel_nama}</td>
                    <td className="px-4 py-3 text-center text-gray-900 dark:text-white">{Math.round(row.nilai_harian || 0)}</td>
                    <td className="px-4 py-3 text-center text-gray-900 dark:text-white">{Math.round(row.nilai_sts || 0)}</td>
                    <td className="px-4 py-3 text-center text-gray-900 dark:text-white">{Math.round(row.nilai_sas || 0)}</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-700 dark:text-blue-400">{Math.round(row.nilai_akhir || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && selectedRombel && ledger.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-12 text-center text-gray-400">
          <Filter size={48} className="mx-auto mb-4 opacity-50" />
          <p>Tidak ada nilai untuk periode ini</p>
        </div>
      )}
    </div>
  )
}
