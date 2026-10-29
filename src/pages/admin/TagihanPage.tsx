import { useState, useEffect } from 'react'
import { escapeHtml } from '../../utils/escapeHtml'
import { Search, X, Pencil, Trash2, QrCode, FileSpreadsheet, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ResponsiveTable from '../../components/ui/ResponsiveTable'
import FinanceExcelPanel from '../../components/FinanceExcelPanel'
import QrisPayModal, { type QrisTarget } from '../../components/QrisPayModal'
import MonthFilter from '../../components/MonthFilter'
import PeriodeFilter, { rentangPeriode, labelPeriode, tanggalLokal } from '../../components/PeriodeFilter'
import { unduhExcel } from '../../utils/excelExport'
import { openFinanceReport } from '../../utils/financeReport'
import { useSettingsStore } from '../../stores/settingsStore'

interface Tagihan {
  id: string; siswa_id: string; siswa_nama: string; nis: string
  jenis_nama: string; jenis_tagihan_id: string; bulan: string; tahun: string
  nominal: number; status: string; tanggal_bayar: string; metode_bayar: string; keterangan?: string
  rombel_id?: string; rombel_nama?: string
}

interface Siswa { id: string; nama: string; nis: string; rombel_id?: string; rombel_nama?: string }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

// Komponen SearchSiswa — combobox dengan live search
function SearchSiswa({ value, onChange, placeholder = 'Cari nama atau NIS...' }: {
  value: string; onChange: (id: string, siswa?: Siswa) => void; placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Siswa[]>([])
  const [allSiswa, setAllSiswa] = useState<Siswa[]>([])
  const [label, setLabel] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api.get('/siswa').then(r => setAllSiswa(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!value) { setLabel(''); return }
    const s = allSiswa.find(s => s.id === value)
    if (s) setLabel(`${s.nama} (${s.nis || '-'})`)
  }, [value, allSiswa])

  const handleSearch = (q: string) => {
    setQuery(q)
    setOpen(true)
    if (!q) { setResults([]); return }
    const lq = q.toLowerCase()
    setResults(allSiswa.filter(s =>
      s.nama.toLowerCase().includes(lq) || (s.nis || '').includes(q)
    ).slice(0, 10))
  }

  const handleSelect = (s: Siswa) => {
    onChange(s.id, s)
    setLabel(`${s.nama} (${s.nis || '-'})`)
    setQuery('')
    setOpen(false)
    setResults([])
  }

  const handleClear = () => {
    onChange('')
    setLabel('')
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
        <Search size={15} className="ml-3 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={query || label}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => { if (label) setQuery(''); setOpen(true) }}
          placeholder={placeholder}
          className="flex-1 px-2 py-2 text-sm outline-none"
        />
        {(value || query) && (
          <button type="button" onClick={handleClear} className="pr-2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2 hover:bg-primary/5 text-sm flex items-center justify-between"
            >
              <span className="font-medium text-gray-800">{s.nama}</span>
              <span className="text-xs text-gray-400">{s.nis || '-'} {s.rombel_nama ? `• ${s.rombel_nama}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {open && query && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
          Tidak ditemukan
        </div>
      )}
    </div>
  )
}

export default function TagihanPage() {
  const [data, setData] = useState<Tagihan[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  // Data untuk ekspor: diambil ulang sesuai periode yang dipilih (semua baris,
  // bukan hanya halaman yang tampil — ekspor wajib lengkap).
  const [exportRows, setExportRows] = useState<Tagihan[]>([])
  const [showGenerate, setShowGenerate] = useState(false)
  const [rombels, setRombels] = useState<any[]>([])
  const [jenisTagihan, setJenisTagihan] = useState<any[]>([])
  const [genForm, setGenForm] = useState({ jenis_nama: '', rombel_id: '', siswa_id: '', bulan: '', tahun: '2026', nominal: '' })
  const [editTagihan, setEditTagihan] = useState<Tagihan | null>(null)
  const [editTagihanForm, setEditTagihanForm] = useState({ nominal: 0, keterangan: '' })
  const [qris, setQris] = useState<QrisTarget | null>(null)
  // Filter periode tagihan. Dua dasar karena bendahara menanyakan dua hal
  // berbeda: "tagihan bulan apa" (periode tagihan) dan "uang masuk bulan apa"
  // (tanggal bayar). Tanpa pemisahan ini, laporan kas selalu salah satu.
  const [bulan, setBulan] = useState('')
  const [dasarBulan, setDasarBulan] = useState<'tagihan' | 'bayar'>('tagihan')
  // Periode ekspor harian/mingguan (rentang tanggal bayar) — terpisah dari
  // filter bulan supaya filter tabel tidak terganggu.
  const [periode, setPeriode] = useState(() => rentangPeriode('hari', tanggalLokal(new Date())))
  const settings = useSettingsStore(s => s.settings)

  const fetchData = async () => {
    try {
      const params: any = {}
      if (filter) params.status = filter
      if (bulan) {
        if (dasarBulan === 'tagihan') params.bulan = bulan
        else params.bulan_bayar = bulan
      }
      const [res, rombelRes, jenisRes] = await Promise.all([
        api.get('/tagihan', { params }),
        api.get('/rombel'),
        api.get('/jenis-tagihan')
      ])
      setData(res.data); setRombels(rombelRes.data); setJenisTagihan(jenisRes.data)
    } catch { toast.error('Gagal memuat tagihan') }
    finally { setLoading(false) }
  }

  // Data ekspor mengikuti periode harian/mingguan/bulanan: pembayaran yang
  // masuk dalam rentang itu (tanggal_bayar), sesuai prinsip "uang masuk
  // dihitung dari tanggal bayar, bukan bulan tagihan". Mengembalikan baris
  // langsung (dipakai handler ekspor) DAN menyimpannya ke state.
  const fetchExportRows = async (p = periode): Promise<Tagihan[]> => {
    const params: any = {}
    if (p.mode === 'bulan') params.bulan_bayar = p.mulai.slice(0, 7)
    else { params.mulai = p.mulai; params.selesai = p.selesai }
    try { const res = await api.get('/tagihan', { params }); setExportRows(res.data || []); return res.data || [] }
    catch { setExportRows([]); return [] }
  }

  useEffect(() => { fetchData(); fetchExportRows() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [filter, bulan, dasarBulan]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = data.filter(t =>
    t.siswa_nama?.toLowerCase().includes(search.toLowerCase()) ||
    t.nis?.includes(search)
  )

  const totalBelum = data.filter(t => t.status === 'belum_bayar').reduce((s, t) => s + t.nominal, 0)
  const totalLunas = data.filter(t => t.status === 'lunas').reduce((s, t) => s + t.nominal, 0)

  const handleBayar = async (id: string) => {
    if (!confirm('Konfirmasi pembayaran?')) return
    try {
      await api.put('/tagihan/' + id + '/bayar', { metode_bayar: 'tunai' })
      toast.success('Pembayaran berhasil')
      fetchData()
    } catch { toast.error('Gagal') }
  }

  const handleGenerate = async () => {
    if (!genForm.jenis_nama.trim()) { toast.error('Isi nama jenis tagihan'); return }
    if (!genForm.nominal || Number(genForm.nominal) <= 0) { toast.error('Isi nominal tagihan'); return }
    if (!genForm.rombel_id && !genForm.siswa_id) { toast.error('Pilih rombel atau siswa'); return }
    if (!genForm.bulan) { toast.error('Pilih satu bulan tagihan'); return }
    if (!genForm.tahun || !/^\d{4}$/.test(genForm.tahun)) { toast.error('Isi tahun dengan 4 angka'); return }
    try {
      const payload: any = { ...genForm }
      if (genForm.siswa_id) {
        payload.rombel_id = ''
        payload.siswa_ids = [genForm.siswa_id]
      }
      const res = await api.post('/tagihan/generate', payload)
      const skip = res.data.skipped ? `, ${res.data.skipped} dilewati (duplikat)` : ''
      toast.success(`${res.data.count} tagihan ${res.data.periode?.bulan || genForm.bulan} ${res.data.periode?.tahun || genForm.tahun} digenerate${skip}`)
      setShowGenerate(false)
      setGenForm({ jenis_nama: '', rombel_id: '', siswa_id: '', bulan: '', tahun: '2026', nominal: '' })
      fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal generate') }
  }

  const fmt = (n: number) => 'Rp ' + n.toLocaleString('id-ID')

  const labelPer = labelPeriode(periode)

  const handleExportExcel = async () => {
    // Ambil ulang supaya selalu segar, lalu unduh semua baris periode.
    const rows = await fetchExportRows()
    if (!rows.length) { toast.error('Tidak ada pembayaran pada periode ini'); return }
    const lunas = rows.filter(t => t.status === 'lunas')
    const totalLunas = lunas.reduce((s, t) => s + t.nominal, 0)
    unduhExcel(
      [{ name: 'Tagihan & Pembayaran', rows, columns: [
        { header: 'NIS', value: 'nis', width: 12 },
        { header: 'SISWA', value: 'siswa_nama', width: 28 },
        { header: 'ROMBEL', value: 'rombel_nama', width: 14 },
        { header: 'JENIS TAGIHAN', value: 'jenis_nama', width: 20 },
        { header: 'PERIODE', value: (t: Tagihan) => `${t.bulan || '-'} ${t.tahun}`, width: 16 },
        { header: 'NOMINAL', value: (t: Tagihan) => Number(t.nominal || 0), width: 14, numFmt: '#,##0' },
        { header: 'STATUS', value: (t: Tagihan) => t.status === 'lunas' ? 'Lunas' : 'Belum Bayar', width: 12 },
        { header: 'TGL BAYAR', value: 'tanggal_bayar', width: 12 },
        { header: 'METODE', value: 'metode_bayar', width: 12 },
      ] }],
      {
        title: 'Laporan Tagihan & Pembayaran',
        filename: 'Laporan_Tagihan_Pembayaran',
        subtitle: `Periode: ${labelPer} — ${lunas.length} lunas, total ${fmt(totalLunas)}`,
        settings: settings as Record<string, unknown>,
      },
    )
    toast.success('Excel tagihan diunduh')
  }

  const handleExportPdf = async () => {
    const rows = await fetchExportRows()
    if (!rows.length) { toast.error('Tidak ada pembayaran pada periode ini'); return }
    const lunas = rows.filter(t => t.status === 'lunas')
    const belum = rows.filter(t => t.status !== 'lunas')
    const totalLunas = lunas.reduce((s, t) => s + t.nominal, 0)
    const totalBelum = belum.reduce((s, t) => s + t.nominal, 0)
    const ok = openFinanceReport({
      title: 'Laporan Tagihan & Pembayaran',
      periode: labelPer,
      settings: settings as Record<string, unknown>,
      landscape: true,
      columns: ['NO', 'NIS', 'SISWA', 'ROMBEL', 'JENIS TAGIHAN', 'PERIODE', 'NOMINAL', 'STATUS', 'TGL BAYAR', 'METODE'],
      rows: rows.map((t, i) => [
        String(i + 1),
        t.nis || '-',
        { text: t.siswa_nama || '-', align: 'left' },
        t.rombel_nama || '-',
        t.jenis_nama || '-',
        `${t.bulan || '-'} ${t.tahun}`,
        fmt(t.nominal),
        t.status === 'lunas' ? 'LUNAS' : 'BELUM',
        t.tanggal_bayar || '-',
        t.metode_bayar || '-',
      ]),
      summary: [
        { label: 'Lunas', value: `${lunas.length} · ${fmt(totalLunas)}` },
        { label: 'Belum Bayar', value: `${belum.length} · ${fmt(totalBelum)}` },
        { label: 'Total Tagihan', value: fmt(totalLunas + totalBelum) },
      ],
      footnotes: [`Periode pembayaran: ${labelPer}`, 'Dasar: tanggal bayar (uang masuk), bukan bulan tagihan.'],
    })
    if (!ok) toast.error('Popup diblokir browser')
  }

  const handleKuitansi = (t: Tagihan) => {
    const w = window.open('', '_blank')
    if (!w) { toast.error('Popup blocked'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>Kuitansi ${t.id}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;background:#fff}
      .kw{max-width:600px;margin:0 auto;border:2px solid #333;padding:30px;border-radius:4px}
      .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:15px;margin-bottom:20px}
      .hdr h1{font-size:20px;font-weight:700;margin-bottom:4px}.hdr p{font-size:11px;color:#666}
      .row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
      .row .lbl{color:#666;width:140px;flex-shrink:0}.row .val{font-weight:600;text-align:right}
      .total{border-top:2px solid #333;margin-top:15px;padding-top:15px;display:flex;justify-content:space-between;font-size:16px;font-weight:700}
      .stamp{margin-top:30px;text-align:center;padding:12px;border:3px solid #16a34a;color:#16a34a;font-size:24px;font-weight:900;letter-spacing:4px;border-radius:4px;display:inline-block;float:right}
      .footer{margin-top:40px;font-size:11px;color:#999;text-align:center;clear:both}
      @media print{body{padding:20px}.no-print{display:none}}</style></head><body>
      <div class="kw">
        <div class="hdr"><h1>KUITANSI PEMBAYARAN</h1><p>JURNALKU — Sistem Manajemen Sekolah</p></div>
        <div class="row"><span class="lbl">No. Kuitansi</span><span class="val">KWT-${t.id.substring(0,8).toUpperCase()}</span></div>
        <div class="row"><span class="lbl">Tanggal Bayar</span><span class="val">${t.tanggal_bayar || '-'}</span></div>
        <div class="row"><span class="lbl">Siswa</span><span class="val">${t.siswa_nama}</span></div>
        <div class="row"><span class="lbl">NIS</span><span class="val">${t.nis}</span></div>
        <div class="row"><span class="lbl">Jenis Tagihan</span><span class="val">${t.jenis_nama}</span></div>
        <div class="row"><span class="lbl">Periode</span><span class="val">${t.bulan || ''} ${t.tahun}</span></div>
        <div class="row"><span class="lbl">Metode Bayar</span><span class="val">${t.metode_bayar || 'Tunai'}</span></div>
        <div class="total"><span>Total Pembayaran</span><span>${fmt(t.nominal)}</span></div>
        <div class="stamp">LUNAS</div>
        <div class="footer">Dikeluarkan oleh JURNALKU — ${new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
      <div class="no-print" style="text-align:center;margin-top:20px"><button onclick="window.print()" style="padding:10px 30px;background:#333;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Cetak / Save PDF</button></div>
    </body></html>`)
    w.document.close()
  }


  const handleEditTagihan = (t: Tagihan) => {
    setEditTagihan(t)
    setEditTagihanForm({ nominal: t.nominal, keterangan: t.keterangan || '' })
  }

  const handleSaveEditTagihan = async () => {
    if (!editTagihan) return
    if (!editTagihanForm.nominal || editTagihanForm.nominal <= 0) { toast.error('Nominal harus > 0'); return }
    try {
      await api.put('/tagihan/' + editTagihan.id, { nominal: Number(editTagihanForm.nominal), keterangan: editTagihanForm.keterangan })
      toast.success('Tagihan diperbarui'); setEditTagihan(null); fetchData()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  const handleDeleteTagihan = async (t: Tagihan) => {
    if (!confirm('Hapus tagihan ' + t.jenis_nama + ' untuk ' + t.siswa_nama + '?')) return
    try {
      await api.delete('/tagihan/' + t.id)
      toast.success('Tagihan dihapus'); fetchData()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Tagihan & Pembayaran</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola SPP, daftar ulang, dan tagihan lainnya</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"><FileSpreadsheet size={16} className="text-emerald-600" /> Excel</button>
          <button onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"><Printer size={16} className="text-rose-600" /> PDF</button>
          <button onClick={() => setShowGenerate(true)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            Generate Tagihan
          </button>
        </div>
      </div>

      <FinanceExcelPanel />

      {/* Periode ekspor laporan (harian/mingguan/bulanan) — dasar tanggal bayar. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <PeriodeFilter nilai={periode} onUbah={setPeriode} label="Periode laporan" />
        <span className="text-xs text-gray-400">Laporan dihitung dari tanggal bayar (uang masuk) — {labelPer}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Belum Bayar</p>
          <p className="text-xl font-bold text-red-600">{fmt(totalBelum)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Sudah Lunas</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalLunas)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Tagihan</p>
          <p className="text-xl font-bold text-gray-800">{data.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Cari siswa..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFilter('')} className={'px-3 py-2 rounded-lg text-sm ' + (!filter ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600')}>Semua</button>
            <button onClick={() => setFilter('belum_bayar')} className={'px-3 py-2 rounded-lg text-sm ' + (filter === 'belum_bayar' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600')}>Belum Bayar</button>
            <button onClick={() => setFilter('lunas')} className={'px-3 py-2 rounded-lg text-sm ' + (filter === 'lunas' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600')}>Lunas</button>
          </div>
        </div>
        {/* Baris periode: bulan + dasar perhitungan. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <MonthFilter nilai={bulan} onUbah={setBulan} label="Bulan tagihan" />
          <div className="inline-flex overflow-hidden rounded-xl border border-gray-200 text-xs">
            <button
              onClick={() => setDasarBulan('tagihan')}
              className={'px-3 py-2 font-semibold ' + (dasarBulan === 'tagihan' ? 'bg-primary text-white' : 'bg-white text-gray-600')}
              title="Tagihan yang diterbitkan untuk bulan tersebut"
            >Bulan tagihan</button>
            <button
              onClick={() => setDasarBulan('bayar')}
              className={'px-3 py-2 font-semibold ' + (dasarBulan === 'bayar' ? 'bg-primary text-white' : 'bg-white text-gray-600')}
              title="Tagihan yang dibayar pada bulan tersebut, termasuk tunggakan bulan lalu"
            >Bulan bayar</button>
          </div>
          <span className="text-xs text-gray-400">
            {!bulan ? 'Seluruh periode' : dasarBulan === 'tagihan' ? 'Tagihan terbit pada bulan itu' : 'Uang masuk pada bulan itu'}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">Memuat...</p>
        ) : (
          <ResponsiveTable<Tagihan>
            columns={[
              { key: 'siswa', header: 'Siswa', className: 'font-medium text-gray-800', render: (t) => (
                <><span className="font-medium text-gray-800">{t.siswa_nama}</span><br/><span className="text-xs text-gray-400">{t.nis}</span></>
              ) },
              { key: 'jenis_nama', header: 'Jenis' },
              { key: 'bulan', header: 'Bulan', hideOnMobile: true, render: (t) => `${t.bulan || '-'} ${t.tahun}` },
              { key: 'nominal', header: 'Nominal', className: 'font-medium', render: (t) => fmt(t.nominal) },
              { key: 'status', header: 'Status', render: (t) => (
                <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (t.status === 'lunas' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                  {t.status === 'lunas' ? 'Lunas' : 'Belum Bayar'}
                </span>
              ) },
              { key: 'tanggal_bayar', header: 'Tgl Bayar', hideOnMobile: true, render: (t) => t.tanggal_bayar || '-' },
            ]}
            rows={filtered}
            rowKey={(t) => t.id}
            empty="Belum ada tagihan. Klik 'Generate Tagihan' untuk membuat."
            actions={(t) => (
              <div className="flex gap-2">
                <button onClick={() => handleEditTagihan(t)} className="px-2 py-1 text-xs rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"><Pencil size={12} className="inline" /></button>
                <button onClick={() => handleDeleteTagihan(t)} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><Trash2 size={12} className="inline" /></button>
                {t.status !== 'lunas' && <button onClick={() => handleBayar(t.id)} className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">Bayar</button>}
                {t.status !== 'lunas' && <button onClick={() => setQris({ ref_type: 'tagihan', ref_id: t.id, student_id: t.siswa_id, nominal: t.nominal, label: `${t.jenis_nama} — ${t.siswa_nama}` })} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 inline-flex items-center gap-1"><QrCode size={12} className="inline" /> QRIS</button>}
                {t.status === 'lunas' && <button onClick={() => handleKuitansi(t)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">Kuitansi</button>}
              </div>
            )}
          />
        )}
      </div>

      {showGenerate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Generate Tagihan</h2>
              <button onClick={() => setShowGenerate(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Jenis Tagihan *</label><input type="text" value={genForm.jenis_nama} onChange={e => setGenForm({...genForm, jenis_nama: e.target.value})} placeholder="Contoh: SPP Juli, Daftar Ulang, Seragam" className="w-full px-3 py-2 border rounded-lg text-sm" /><p className="text-[11px] text-gray-400 mt-1">Ketik nama tagihan. Akan tersimpan otomatis untuk penggunaan berikutnya.</p></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Nominal *</label><input type="number" value={genForm.nominal} onChange={e => setGenForm({...genForm, nominal: e.target.value})} placeholder="150000" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Target *</label>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setGenForm({...genForm, siswa_id: '', rombel_id: ''})}
                    className={'flex-1 py-1.5 rounded-lg text-xs font-medium border transition ' + (!genForm.siswa_id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200')}>
                    Per Rombel
                  </button>
                  <button type="button" onClick={() => setGenForm({...genForm, rombel_id: '', siswa_id: ''})}
                    className={'flex-1 py-1.5 rounded-lg text-xs font-medium border transition ' + (genForm.siswa_id !== undefined && genForm.rombel_id === '' && !genForm.siswa_id ? 'bg-primary text-white border-primary' : genForm.siswa_id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200')}>
                    Per Siswa
                  </button>
                </div>
                {/* Mode Rombel */}
                {!genForm.siswa_id && (
                  <select value={genForm.rombel_id} onChange={e => setGenForm({...genForm, rombel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- Pilih Rombel --</option>
                    <option value="all">Semua Rombel (semua siswa aktif)</option>
                    {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </select>
                )}
                {/* Mode Siswa — search box */}
                {genForm.siswa_id !== undefined && genForm.rombel_id === '' && (
                  <div className={!genForm.siswa_id && genForm.rombel_id === '' ? 'block' : 'block'}>
                    <SearchSiswa
                      value={genForm.siswa_id}
                      onChange={id => setGenForm({...genForm, siswa_id: id, rombel_id: ''})}
                      placeholder="Ketik nama atau NIS siswa..."
                    />
                    {genForm.siswa_id && (
                      <p className="text-xs text-primary mt-1">✓ Tagihan akan dibuat untuk 1 siswa ini</p>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Bulan *</label><select value={genForm.bulan} onChange={e => setGenForm({...genForm, bulan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">-- Pilih Bulan --</option>{BULAN.map(bulan => <option key={bulan} value={bulan}>{bulan}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Tahun *</label><input type="number" min="2000" max="2100" value={genForm.tahun} onChange={e => setGenForm({...genForm, tahun: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowGenerate(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleGenerate} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Generate</button>
            </div>
          </div>
        </div>
      )}\n
      {/* Modal Edit Tagihan */}
      {editTagihan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit Tagihan</h2>
              <button onClick={() => setEditTagihan(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="text-sm text-gray-500 mb-3">{editTagihan.siswa_nama} — {editTagihan.jenis_nama}</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nominal *</label>
                <input type="number" value={editTagihanForm.nominal} onChange={e => setEditTagihanForm({...editTagihanForm, nominal: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm" min={1} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                <input value={editTagihanForm.keterangan} onChange={e => setEditTagihanForm({...editTagihanForm, keterangan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Opsional" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditTagihan(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleSaveEditTagihan} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Bayar lewat QRIS dinamis (payment gateway lembaga) */}
      {qris && (
        <QrisPayModal target={qris} onClose={() => setQris(null)} onPaid={() => { setQris(null); fetchData() }} />
      )}
    </div>
  )
}
