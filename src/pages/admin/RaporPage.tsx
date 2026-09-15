import { useState, useEffect } from 'react'
import api from '../../services/api'
import { FileText, Zap, Printer } from 'lucide-react'
import FoundationTenantPicker from '../../components/FoundationTenantPicker'

export default function RaporPage() {
  const [rombelList, setRombelList] = useState<any[]>([])
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [rapor, setRapor] = useState<any[]>([])
  const [settings, setSettings] = useState<any>({})
  const [selectedRombel, setSelectedRombel] = useState('')
  const [selectedSiswa, setSelectedSiswa] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027')
  const [semester, setSemester] = useState('ganjil')
  const [jenis, setJenis] = useState<'rapor_sts' | 'rapor_sas'>('rapor_sts')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [foundationTenantId, setFoundationTenantId] = useState<string | null>(null)

  useEffect(() => { loadRombel(); loadSettings() }, [foundationTenantId])
  useEffect(() => { if (selectedRombel) loadSiswa() }, [selectedRombel, foundationTenantId])
  useEffect(() => { if (selectedSiswa) loadRapor() }, [selectedSiswa, tahunAjaran, semester, jenis, foundationTenantId])

  const loadSettings = async () => {
    try { const { data } = await api.get('/settings'); setSettings(data) } catch {}
  }

  const loadRombel = async () => {
    try {
      const params: any = {}
      if (foundationTenantId && foundationTenantId !== 'all') params.tenant_id = foundationTenantId
      const { data } = await api.get(foundationTenantId ? '/foundation/students' : '/rombel', { params })
      setRombelList(data)
    } catch (e) { console.error(e) }
  }

  const loadSiswa = async () => {
    try {
      const params: any = { rombel_id: selectedRombel }
      if (foundationTenantId && foundationTenantId !== 'all') params.tenant_id = foundationTenantId
      const { data } = await api.get(foundationTenantId ? '/foundation/students' : '/siswa', { params })
      setSiswaList(data); setSelectedSiswa('')
    } catch (e) { console.error(e) }
  }

  const loadRapor = async () => {
    try {
      const params: any = { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester, jenis }
      if (foundationTenantId && foundationTenantId !== 'all') params.tenant_id = foundationTenantId
      const { data } = await api.get(foundationTenantId ? '/foundation/nilai' : '/rapor', { params })
      setRapor(data)
    } catch (e) { console.error(e) }
  }

  const handleGenerate = async () => {
    if (!selectedRombel) return setMsg('Pilih kelas dulu')
    if (foundationTenantId) return setMsg('✗ Generate rapor hanya untuk data lembaga sendiri')
    setLoading(true); setMsg('')
    try {
      const { data } = await api.post('/rapor/generate', { rombel_id: selectedRombel, tahun_ajaran: tahunAjaran, semester, jenis })
      setMsg(`✓ ${data.message}`)
      if (selectedSiswa) loadRapor()
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal generate'}`)
    } finally { setLoading(false) }
  }

  const handlePrint = () => window.print()

  const siswa = siswaList.find(s => s.id === selectedSiswa)
  const rombel = rombelList.find(r => r.id === selectedRombel)
  const rataAkhir = rapor.length ? Math.round(rapor.reduce((s, r) => s + (r.nilai_akhir || 0), 0) / rapor.length) : 0
  const jenisLabel = jenis === 'rapor_sas' ? 'AKHIR SEMESTER (SAS)' : 'TENGAH SEMESTER (STS)'
  const formulaLabel = jenis === 'rapor_sas'
    ? 'Nilai Akhir = (Nilai Harian × 40%) + (Asesmen STS × 20%) + (Asesmen SAS × 40%)'
    : 'Nilai Akhir = (Nilai Harian × 60%) + (Asesmen STS × 40%)'

  // Tentukan tanggal cetak
  const now = new Date()
  const tanggalCetak = `${settings.kota_cetak || 'Bondowoso'}, ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="space-y-6">
      {/* Header — disembunyikan saat print */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold text-gray-800">Rapor Siswa</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Generate &amp; cetak rapor STS atau SAS dari penilaian harian + nilai asesmen guru
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button onClick={handleGenerate} disabled={loading || !selectedRombel}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark flex items-center gap-2 disabled:opacity-50">
            <Zap size={16} /> {loading ? 'Memproses...' : `Generate Rapor ${jenis === 'rapor_sas' ? 'SAS' : 'STS'}`}
          </button>
          <button onClick={handlePrint} disabled={rapor.length === 0}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
            <Printer size={16} /> Cetak
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-lg border print:hidden ${msg.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg}
        </div>
      )}

      <FoundationTenantPicker
        selectedTenantId={foundationTenantId}
        onSelectTenant={setFoundationTenantId}
        placeholder="Data lokal (lembaga ini)"
        allOptionLabel="Semua lembaga yayasan (gabungan)"
      />

      {/* Filter panel */}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Rapor</label>
            <select value={jenis} onChange={e => setJenis(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg">
              <option value="rapor_sts">Rapor STS (Tengah Semester)</option>
              <option value="rapor_sas">Rapor SAS (Akhir Semester)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ======= AREA CETAK ======= */}
      {selectedSiswa && rapor.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden print:shadow-none print:border-0 print:rounded-none">

          {/* KOP LEMBAGA */}
          <div className="p-6 border-b print:border-b-2 print:border-black">
            <div className="flex items-center gap-4">
              {settings.logo && (
                <img
                  src={settings.logo}
                  alt="Logo"
                  className="w-20 h-20 object-contain shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div className="flex-1 text-center">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide print:text-black">
                  RAPOR {jenisLabel}
                </div>
                <h2 className="text-xl font-bold mt-1 text-gray-900 print:text-2xl">
                  {settings.nama_lembaga || 'Nama Lembaga'}
                </h2>
                {settings.npsn && (
                  <div className="text-sm text-gray-600">NPSN: {settings.npsn}</div>
                )}
                {settings.alamat && (
                  <div className="text-sm text-gray-600">{settings.alamat}</div>
                )}
                {(settings.telepon || settings.email) && (
                  <div className="text-sm text-gray-500">
                    {settings.telepon && `Telp: ${settings.telepon}`}
                    {settings.telepon && settings.email && ' · '}
                    {settings.email}
                  </div>
                )}
              </div>
              {/* spacer agar logo seimbang */}
              {settings.logo && <div className="w-20 shrink-0" />}
            </div>
          </div>

          {/* Info semester */}
          <div className="px-6 py-3 bg-primary/5 text-center text-sm text-gray-700 border-b print:bg-white print:border-b print:border-gray-300">
            Semester <strong>{semester.toUpperCase()}</strong> — Tahun Ajaran <strong>{tahunAjaran}</strong>
          </div>

          {/* Identitas siswa */}
          <div className="p-6 border-b">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm max-w-2xl mx-auto">
              <div><span className="text-gray-500">Nama</span><br /><strong>{siswa?.nama}</strong></div>
              <div><span className="text-gray-500">NIS</span><br /><strong>{siswa?.nis}</strong></div>
              <div><span className="text-gray-500">Kelas</span><br /><strong>{rombel?.nama}</strong></div>
              <div><span className="text-gray-500">Rata-rata</span><br /><strong className="text-primary text-lg">{rataAkhir}</strong></div>
            </div>
          </div>

          {/* Tabel nilai */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 print:bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mata Pelajaran</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Nilai Harian</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Asesmen STS</th>
                  {jenis === 'rapor_sas' && (
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Asesmen SAS</th>
                  )}
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase bg-primary/10 print:bg-blue-100">Nilai Akhir</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Predikat</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rapor.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.mapel_nama}</td>
                    <td className="px-4 py-3 text-center text-sm">{r.nilai_harian ?? '-'}</td>
                    <td className="px-4 py-3 text-center text-sm">{r.nilai_sts ?? '-'}</td>
                    {jenis === 'rapor_sas' && (
                      <td className="px-4 py-3 text-center text-sm">{r.nilai_sas ?? '-'}</td>
                    )}
                    <td className="px-4 py-3 text-center text-lg font-bold text-primary bg-primary/5 print:bg-blue-50">{r.nilai_akhir}</td>
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

          {/* Footer: formula + tanda tangan */}
          <div className="p-6 border-t bg-gray-50 print:bg-white">
            <p className="text-xs text-gray-500 mb-6">
              <strong>Formula:</strong> {formulaLabel} &nbsp;·&nbsp;
              <strong>Predikat:</strong> A ≥ 90 | B ≥ 80 | C ≥ 70 | D &lt; 70
            </p>

            {/* Tanda tangan */}
            <div className="flex justify-between mt-4 text-sm">
              <div className="text-center min-w-[180px]">
                <p className="text-gray-600">Mengetahui,</p>
                <p className="text-gray-600">Orang Tua / Wali</p>
                <div className="mt-16 border-b border-gray-400 w-40 mx-auto" />
                <p className="mt-1 text-gray-700">( ________________________ )</p>
              </div>
              <div className="text-center min-w-[180px]">
                <p className="text-gray-600">{tanggalCetak}</p>
                <p className="text-gray-600">
                  {settings.kepala_sekolah ? 'Kepala' : 'Wali Kelas'}
                </p>
                <div className="mt-16 border-b border-gray-400 w-40 mx-auto" />
                <p className="mt-1 font-semibold text-gray-900">
                  {settings.kepala_sekolah || '_____________________'}
                </p>
                {settings.kepala_sekolah && (
                  <p className="text-xs text-gray-500">Kepala {settings.nama_lembaga || 'Lembaga'}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSiswa && rapor.length === 0 && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <FileText size={48} className="mx-auto mb-4 opacity-50" />
          <p>Belum ada rapor. Klik <strong>Generate Rapor {jenis === 'rapor_sas' ? 'SAS' : 'STS'}</strong> untuk auto-generate dari penilaian harian + asesmen guru.</p>
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
