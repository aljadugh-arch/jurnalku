import { useState, useEffect } from 'react'
import api from '../../services/api'
import { Download, Filter, FileText } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

type Konteks = {
  mapel_id: string
  mapel_nama: string
  rombel_id: string
  rombel_nama: string
  tahun_ajaran: string
}

type Guru = { id: string; nama: string; kode_guru?: string }

type NilaiRow = {
  siswa_id: string
  siswa_nama: string
  siswa_nis: string
  nilai_harian: number | null
  nilai_sts: number | null
  nilai_sas: number | null
}

export default function GuruRekapNilaiPage() {
  const role = useAuthStore(s => s.user?.role)
  const isAdmin = role === 'admin' || role === 'super_admin'

  const [daftarGuru, setDaftarGuru] = useState<Guru[]>([])
  const [selectedGuru, setSelectedGuru] = useState('')
  const [konteksList, setKonteksList] = useState<Konteks[]>([])
  const [selectedKonteks, setSelectedKonteks] = useState('') // `${mapel_id}::${rombel_id}`
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027')
  const [semester, setSemester] = useState('ganjil')
  const [jenis, setJenis] = useState<'harian' | 'sts' | 'sas' | 'semua'>('semua')
  const [rows, setRows] = useState<NilaiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadContext() }, [selectedGuru])
  useEffect(() => { if (selectedKonteks) loadRekap() }, [selectedKonteks, tahunAjaran, semester, jenis])

  const loadContext = async () => {
    try {
      const { data } = await api.get('/rapor/rekap-guru/context', {
        params: isAdmin && selectedGuru ? { gtk_id: selectedGuru } : {},
      })
      if (isAdmin) {
        setDaftarGuru(data.daftar_guru || [])
        if (!selectedGuru && data.guru?.id) setSelectedGuru(data.guru.id)
      }
      const konteks: Konteks[] = data.konteks || []
      setKonteksList(konteks)
      if (konteks[0]) {
        setSelectedKonteks(`${konteks[0].mapel_id}::${konteks[0].rombel_id}`)
        if (konteks[0].tahun_ajaran) setTahunAjaran(konteks[0].tahun_ajaran)
      } else {
        setSelectedKonteks('')
        setRows([])
      }
    } catch {
      setMsg('✗ Gagal memuat daftar mapel/kelas yang diampu')
    }
  }

  const currentPair = () => {
    const [mapel_id, rombel_id] = selectedKonteks.split('::')
    return { mapel_id, rombel_id }
  }

  const loadRekap = async () => {
    const { mapel_id, rombel_id } = currentPair()
    if (!mapel_id || !rombel_id) return
    setLoading(true); setMsg('')
    try {
      const { data } = await api.get('/rapor/rekap-guru', {
        params: {
          mapel_id, rombel_id, tahun_ajaran: tahunAjaran, semester, jenis,
          ...(isAdmin && selectedGuru ? { gtk_id: selectedGuru } : {}),
        },
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal memuat rekap nilai'}`)
    } finally { setLoading(false) }
  }

  const downloadFile = async (format: 'xlsx' | 'pdf') => {
    const { mapel_id, rombel_id } = currentPair()
    if (!mapel_id || !rombel_id) { setMsg('✗ Pilih mapel & kelas terlebih dahulu'); return }
    if (rows.length === 0) { setMsg('✗ Tidak ada data untuk diekspor'); return }
    try {
      const response = await api.get('/rapor/rekap-guru/export', {
        params: {
          mapel_id, rombel_id, tahun_ajaran: tahunAjaran, semester, jenis, format,
          ...(isAdmin && selectedGuru ? { gtk_id: selectedGuru } : {}),
        },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Rekap-Nilai-${rombel_id}-${mapel_id}-${tahunAjaran.replace('/', '-')}-${semester}.${format}`)
      document.body.appendChild(link)
      link.click()
      link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || `Gagal download ${format.toUpperCase()}`}`)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white">Rekap Nilai per Mapel</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Rekap nilai siswa untuk satu mapel yang diampu — unduh dalam bentuk Excel atau PDF
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg p-4 text-sm ${msg.startsWith('✓') ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'}`}>
          {msg}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-4`}>
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Guru</label>
              <select value={selectedGuru} onChange={e => setSelectedGuru(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
                <option value="">Pilih Guru</option>
                {daftarGuru.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mapel &amp; Kelas</label>
            <select value={selectedKonteks} onChange={e => setSelectedKonteks(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="">Pilih Mapel &amp; Kelas</option>
              {konteksList.map(k => (
                <option key={`${k.mapel_id}::${k.rombel_id}`} value={`${k.mapel_id}::${k.rombel_id}`}>
                  {k.mapel_nama} — {k.rombel_nama}
                </option>
              ))}
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jenis Nilai</label>
            <select value={jenis} onChange={e => setJenis(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="semua">Semua</option>
              <option value="harian">Harian</option>
              <option value="sts">STS (Tengah Semester)</option>
              <option value="sas">SAS (Akhir Semester)</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => downloadFile('xlsx')} disabled={loading || !selectedKonteks || rows.length === 0}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
              <Download size={16} /> Excel
            </button>
            <button onClick={() => downloadFile('pdf')} disabled={loading || !selectedKonteks || rows.length === 0}
              className="flex-1 px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
              <FileText size={16} /> PDF
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Memuat data...</div>}

      {!loading && selectedKonteks && rows.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">No</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">NIS</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Nama Siswa</th>
                  {(jenis === 'harian' || jenis === 'semua') && <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Nilai Harian</th>}
                  {(jenis === 'sts' || jenis === 'semua') && <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Nilai STS</th>}
                  {(jenis === 'sas' || jenis === 'semua') && <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Nilai SAS</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((row, idx) => (
                  <tr key={row.siswa_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{row.siswa_nis}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.siswa_nama}</td>
                    {(jenis === 'harian' || jenis === 'semua') && <td className="px-4 py-3 text-center text-gray-900 dark:text-white">{row.nilai_harian == null ? '—' : Math.round(row.nilai_harian)}</td>}
                    {(jenis === 'sts' || jenis === 'semua') && <td className="px-4 py-3 text-center text-gray-900 dark:text-white">{row.nilai_sts == null ? '—' : Math.round(row.nilai_sts)}</td>}
                    {(jenis === 'sas' || jenis === 'semua') && <td className="px-4 py-3 text-center text-gray-900 dark:text-white">{row.nilai_sas == null ? '—' : Math.round(row.nilai_sas)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && selectedKonteks && rows.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-12 text-center text-gray-400">
          <Filter size={48} className="mx-auto mb-4 opacity-50" />
          <p>Tidak ada siswa/nilai untuk periode ini</p>
        </div>
      )}

      {!loading && !selectedKonteks && konteksList.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-12 text-center text-gray-400">
          <Filter size={48} className="mx-auto mb-4 opacity-50" />
          <p>{isAdmin ? 'Pilih guru untuk melihat penugasan mengajarnya' : 'Anda belum memiliki penugasan mengajar mapel/kelas'}</p>
        </div>
      )}
    </div>
  )
}
