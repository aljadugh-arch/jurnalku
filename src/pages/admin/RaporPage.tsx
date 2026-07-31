import { useState, useEffect } from 'react'
import api from '../../services/api'
import { FileText, Zap, Download, RefreshCw, Send } from 'lucide-react'

export default function RaporPage() {
  const [rombelList, setRombelList] = useState<any[]>([])
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [rapor, setRapor] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [selectedSiswa, setSelectedSiswa] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027')
  const [semester, setSemester] = useState('ganjil')
  const [jenis, setJenis] = useState('tengah')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadRombel() }, [])
  useEffect(() => { if (selectedRombel) loadSiswa() }, [selectedRombel])
  useEffect(() => { if (selectedSiswa) loadRapor() }, [selectedSiswa, tahunAjaran, semester, jenis])

  const loadRombel = async () => {
    try { const { data } = await api.get('/rombel'); setRombelList(data) } catch (e) { console.error(e) }
  }
  const loadSiswa = async () => {
    try { const { data } = await api.get(`/siswa?rombel_id=${selectedRombel}`); setSiswaList(data); setSelectedSiswa('') } catch (e) { console.error(e) }
  }
  const loadRapor = async () => {
    try {
      const { data } = await api.get(`/rapor?siswa_id=${selectedSiswa}&tahun_ajaran=${tahunAjaran}&semester=${semester}&jenis=${jenis}`)
      setRapor(data)
    } catch (e) { console.error(e) }
  }

  const handleGenerate = async () => {
    if (!selectedRombel) return setMsg('Pilih kelas dulu')
    setLoading(true); setMsg('')
    try {
      const { data } = await api.post('/rapor/generate', { rombel_id: selectedRombel, tahun_ajaran: tahunAjaran, semester, jenis })
      setMsg(`✓ ${data.message}`)
      if (selectedSiswa) loadRapor()
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal generate'}`)
    } finally { setLoading(false) }
  }

  const handleSyncRDM = async () => {
    if (!confirm(`Sync rapor akhir semester ke RDM (Rapor Digital Madrasah)? Kelas: ${rombelList.find(r=>r.id===selectedRombel)?.nama}`)) return
    setLoading(true); setMsg('')
    try {
      const namaSheet = `KELAS ${rombelList.find(r=>r.id===selectedRombel)?.nama || '7 A'}`
      const { data } = await api.post('/rapor/sync-rdm', { rombel_id: selectedRombel, tahun_ajaran: tahunAjaran, semester, nama_sheet: namaSheet })
      setMsg(`✓ Sync RDM berhasil: ${data.total} data. Respons: ${data.rdm_response}`)
    } catch (e: any) {
      setMsg(`✗ Sync gagal: ${e.response?.data?.error || 'Error'}`)
    } finally { setLoading(false) }
  }

  const handlePrint = () => window.print()

  const rataAkhir = rapor.length ? Math.round(rapor.reduce((s, r) => s + (r.nilai_akhir || 0), 0) / rapor.length) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold text-gray-800">Rapor Siswa</h1>
          <p className="text-gray-500 mt-1 text-sm">Rapor tengah semester (auto-generate dari penilaian harian) &amp; rapor akhir semester (sync ke RDM)</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button onClick={handleGenerate} disabled={loading || !selectedRombel} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark flex items-center gap-2 disabled:opacity-50">
            <Zap size={16} /> Generate Rapor
          </button>
          {jenis === 'akhir' && (
            <button onClick={handleSyncRDM} disabled={loading || !selectedRombel} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50">
              <Send size={16} /> Sync ke RDM
            </button>
          )}
          <button onClick={handlePrint} disabled={rapor.length === 0} className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
            <Download size={16} /> Cetak
          </button>
        </div>
      </div>

      {msg && <div className={`p-4 rounded-lg border print:hidden ${msg.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg}</div>}

      <div className="bg-white rounded-xl shadow-sm border p-6 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kelas</label>
            <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="">-- Pilih --</option>
              {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Siswa</label>
            <select value={selectedSiswa} onChange={e => setSelectedSiswa(e.target.value)} disabled={!selectedRombel} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100">
              <option value="">-- Pilih --</option>
              {siswaList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tahun Ajaran</label>
            <input type="text" value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} placeholder="2026/2027" className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
            <select value={semester} onChange={e => setSemester(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jenis</label>
            <select value={jenis} onChange={e => setJenis(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="tengah">Tengah Semester (PTS)</option>
              <option value="akhir">Akhir Semester (PAS)</option>
            </select>
          </div>
        </div>
      </div>

      {selectedSiswa && rapor.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden print:shadow-none print:border-black">
          <div className="p-6 border-b bg-gradient-to-r from-primary/5 to-indigo-500/5">
            <div className="text-center">
              <h2 className="text-xl font-bold font-display">RAPOR {jenis === 'tengah' ? 'TENGAH' : 'AKHIR'} SEMESTER</h2>
              <p className="text-gray-600 mt-1">Semester {semester.toUpperCase()} - Tahun Ajaran {tahunAjaran}</p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-left max-w-md mx-auto text-sm">
                <div><span className="text-gray-500">Nama:</span> <strong>{siswaList.find(s => s.id === selectedSiswa)?.nama}</strong></div>
                <div><span className="text-gray-500">NIS:</span> <strong>{siswaList.find(s => s.id === selectedSiswa)?.nis}</strong></div>
                <div><span className="text-gray-500">Kelas:</span> <strong>{rombelList.find(r => r.id === selectedRombel)?.nama}</strong></div>
                <div><span className="text-gray-500">Rata-rata:</span> <strong className="text-primary text-lg">{rataAkhir}</strong></div>
              </div>
            </div>
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto -mx-2 px-2">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mata Pelajaran</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Peng.</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ket.</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sikap</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase bg-primary/10">Akhir</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Predikat</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rapor.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.mapel_nama}</td>
                    <td className="px-4 py-3 text-center text-sm">{r.nilai_pengetahuan}</td>
                    <td className="px-4 py-3 text-center text-sm">{r.nilai_keterampilan}</td>
                    <td className="px-4 py-3 text-center text-sm">{r.nilai_sikap}</td>
                    <td className="px-4 py-3 text-center text-lg font-bold text-primary bg-primary/5">{r.nilai_akhir}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${r.predikat === 'A' ? 'bg-green-100 text-green-700' : r.predikat === 'B' ? 'bg-blue-100 text-blue-700' : r.predikat === 'C' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {r.predikat}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden p-3 space-y-2.5">
            {rapor.map((r, i) => (
              <div key={r.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 text-sm min-w-0 break-words">{i + 1}. {r.mapel_nama}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold ${r.predikat === 'A' ? 'bg-green-100 text-green-700' : r.predikat === 'B' ? 'bg-blue-100 text-blue-700' : r.predikat === 'C' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{r.predikat}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center text-xs">
                  <div><p className="text-gray-500">Peng.</p><p className="font-medium">{r.nilai_pengetahuan}</p></div>
                  <div><p className="text-gray-500">Ket.</p><p className="font-medium">{r.nilai_keterampilan}</p></div>
                  <div><p className="text-gray-500">Sikap</p><p className="font-medium">{r.nilai_sikap}</p></div>
                  <div className="bg-primary/5 rounded"><p className="text-gray-500">Akhir</p><p className="font-bold text-primary">{r.nilai_akhir}</p></div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 border-t bg-gray-50 text-xs text-gray-600">
            <p><strong>Formula:</strong> Nilai Akhir = (Pengetahuan × 50%) + (Keterampilan × 30%) + (Sikap × 20%)</p>
            <p className="mt-1"><strong>Predikat:</strong> A ≥ 90 | B ≥ 80 | C ≥ 70 | D &lt; 70</p>
          </div>
        </div>
      )}

      {selectedSiswa && rapor.length === 0 && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <FileText size={48} className="mx-auto mb-4 opacity-50" />
          <p>Belum ada rapor. Klik <strong>Generate Rapor</strong> untuk auto-generate dari penilaian harian.</p>
        </div>
      )}

      {!selectedSiswa && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <FileText size={48} className="mx-auto mb-4 opacity-50" />
          <p>Pilih kelas dan siswa untuk melihat rapor</p>
        </div>
      )}
    </div>
  )
}
