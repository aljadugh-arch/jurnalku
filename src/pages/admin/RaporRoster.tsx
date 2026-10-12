import { useEffect, useState } from 'react'
import api from '../../services/api'
import { Printer, Download, FileText, Search } from 'lucide-react'

interface RaporRosterProps {
  tahunAjaran: string
  semester: string
  jenis: 'rapor_sts' | 'rapor_sas'
  raporFormat: 'rdm' | 'mtsplus'
  rombelList: any[]
}

// Daftar SEMUA siswa + filter (rombel, laki-laki/perempuan, cari) dengan aksi
// cetak/ekspor PDF per siswa dan batch per rombel / semua rombel — mengikuti
// pola rapor.mtsplussd7.cc.cd. Memakai endpoint rapor yang sudah ada
// (/api/rapor/export/pdf per siswa, /api/rapor/export/pdf-bulk batch).
export default function RaporRoster({ tahunAjaran, semester, jenis, raporFormat, rombelList }: RaporRosterProps) {
  const [siswa, setSiswa] = useState<any[]>([])
  const [filterRombel, setFilterRombel] = useState('')
  const [filterJk, setFilterJk] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (filterRombel) params.rombel_id = filterRombel
      if (filterJk) params.jenis_kelamin = filterJk
      if (search.trim()) params.search = search.trim()
      const { data } = await api.get('/siswa', { params })
      setSiswa(data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [filterRombel, filterJk])

  const parseErr = async (e: any, fallback: string) => {
    const d = e.response?.data
    if (d instanceof Blob) { try { return JSON.parse(await d.text()).error || fallback } catch { return fallback } }
    return d?.error || fallback
  }
  const saveBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    window.URL.revokeObjectURL(url)
  }
  const printBlob = (blob: Blob, filename: string) => {
    // Buka di tab baru (penampil PDF browser) supaya bisa langsung Ctrl+P.
    const url = window.URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) saveBlob(blob, filename)
    else window.setTimeout(() => window.URL.revokeObjectURL(url), 60000)
  }

  const exportSiswa = async (s: any, mode: 'cetak' | 'pdf') => {
    if (busy) return
    setBusy(true); setMsg('')
    try {
      const resp = await api.get('/rapor/export/pdf', {
        params: { siswa_id: s.id, tahun_ajaran: tahunAjaran, semester, jenis, bagian: 'lengkap', format: raporFormat },
        responseType: 'blob',
      })
      const blob = new Blob([resp.data], { type: 'application/pdf' })
      const fname = `rapor-${s.nama}-${semester}.pdf`
      if (mode === 'cetak') printBlob(blob, fname); else saveBlob(blob, fname)
      setMsg(`✓ ${s.nama} — ${mode === 'cetak' ? 'dibuka untuk cetak' : 'PDF diunduh'}`)
    } catch (e: any) { setMsg(`✗ ${await parseErr(e, 'Gagal unduh PDF')}`) } finally { setBusy(false) }
  }

  const exportBulk = async (rombelId: string | null, label: string, mode: 'cetak' | 'pdf') => {
    if (busy) return
    if (raporFormat !== 'mtsplus') { setMsg('✗ Cetak massal memakai layout "MTs Plus" — pilih Layout MTs Plus dulu.'); return }
    setBusy(true); setMsg(`⏳ Membuat PDF ${label}…`)
    try {
      const params: any = { tahun_ajaran: tahunAjaran, semester, jenis, bagian: 'lengkap' }
      if (rombelId) params.rombel_id = rombelId
      const resp = await api.get('/rapor/export/pdf-bulk', { params, responseType: 'blob', timeout: 300000 })
      const blob = new Blob([resp.data], { type: 'application/pdf' })
      const fname = `rapor-${label.replace(/\s+/g, '-')}-${semester}.pdf`
      if (mode === 'cetak') printBlob(blob, fname); else saveBlob(blob, fname)
      setMsg(`✓ ${label} — ${mode === 'cetak' ? 'dibuka untuk cetak' : 'PDF diunduh'} (satu file)`)
    } catch (e: any) { setMsg(`✗ ${await parseErr(e, 'Gagal membuat PDF massal')}`) } finally { setBusy(false) }
  }

  const rombelNama = filterRombel ? (rombelList.find(r => r.id === filterRombel)?.nama || 'Rombel') : 'Semua Rombel'
  const batchLabel = filterRombel ? `Rombel ${rombelNama}` : 'Semua Rombel'

  return (
    <div className="card p-5 print:hidden space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FileText className="w-5 h-5" />Daftar Siswa &amp; Cetak Rapor</h2>
          <p className="text-xs text-gray-500 mt-0.5">Semua siswa ditampilkan; filter rombel / jenis kelamin / cari. Cetak &amp; ekspor PDF per siswa atau batch.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void exportBulk(filterRombel || null, batchLabel, 'pdf')} disabled={busy} className="btn-secondary flex items-center gap-2 whitespace-nowrap"><Download className="w-4 h-4" />Ekspor PDF {filterRombel ? '(Rombel)' : '(Semua)'}</button>
          <button onClick={() => void exportBulk(filterRombel || null, batchLabel, 'cetak')} disabled={busy} className="btn-primary flex items-center gap-2 whitespace-nowrap"><Printer className="w-4 h-4" />Cetak {filterRombel ? '(Rombel)' : '(Semua)'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void load() }}
            placeholder="Cari nama / NIS / NISN…"
            className="input pl-9"
          />
        </div>
        <select value={filterRombel} onChange={e => setFilterRombel(e.target.value)} className="input">
          <option value="">Semua Rombel</option>
          {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        <select value={filterJk} onChange={e => setFilterJk(e.target.value)} className="input">
          <option value="">Semua (Laki-laki &amp; Perempuan)</option>
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </select>
      </div>

      {msg && <p className={`text-sm ${msg.startsWith('✓') ? 'text-green-600' : msg.startsWith('⏳') ? 'text-blue-600' : 'text-red-600'}`}>{msg}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-left text-xs uppercase text-gray-600">
              <th className="px-3 py-2 w-10">No</th>
              <th className="px-3 py-2">NIS / NISN</th>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">L/P</th>
              <th className="px-3 py-2">Rombel</th>
              <th className="px-3 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Memuat daftar siswa…</td></tr>
            ) : siswa.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Tidak ada siswa pada filter ini.</td></tr>
            ) : siswa.map((s, i) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 text-gray-500">{[s.nis, s.nisn].filter(Boolean).join(' / ') || '-'}</td>
                <td className="px-3 py-2 font-medium text-gray-800">{s.nama}</td>
                <td className="px-3 py-2">{s.jenis_kelamin === 'P' ? 'P' : 'L'}</td>
                <td className="px-3 py-2 text-gray-500">{s.rombel_nama || '-'}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => void exportSiswa(s, 'pdf')} disabled={busy} title="Ekspor PDF" className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"><Download className="w-3.5 h-3.5" />PDF</button>
                    <button onClick={() => void exportSiswa(s, 'cetak')} disabled={busy} title="Cetak (buka di browser, tekan Print)" className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"><Printer className="w-3.5 h-3.5" />Cetak</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && siswa.length > 0 && <p className="text-xs text-gray-400">{siswa.length} siswa{filterJk ? (filterJk === 'L' ? ' (laki-laki)' : ' (perempuan)') : ''}{filterRombel ? ` di ${rombelNama}` : ''}. Batch PDF = satu file gabungan (layout MTs Plus).</p>}
    </div>
  )
}
