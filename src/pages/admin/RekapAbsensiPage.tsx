import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { escapeHtml } from '../../utils/escapeHtml'
import { Download, FileSpreadsheet, Users, GraduationCap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib, yearWib, addDaysWib } from '../../lib/dateFormat'
import * as XLSX from 'xlsx'
import { useSettingsStore } from '../../stores/settingsStore'
import { tenantExportFilename, tenantIdentity } from '../../utils/tenantExport'

function PercentageBadge({ row }: { row: any }) {
  const percentage = row.total > 0 ? Math.round(row.hadir / row.total * 100) : 0
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${percentage >= 90 ? 'bg-green-100 text-green-700' : percentage >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{percentage}%</span>
}

// Kelompokkan baris rekap berdasarkan rombel (urutan pertama kali muncul).
// Siswa tanpa rombel dikelompokkan terpisah di akhir sebagai "Tanpa Rombel".
function groupByRombel(data: any[]) {
  const groups: { rombel: string; items: any[] }[] = []
  const index = new Map<string, number>()
  for (const row of data) {
    const rombel = String(row.rombel_nama || '').trim() || 'Tanpa Rombel'
    let gi = index.get(rombel)
    if (gi == null) { gi = groups.length; index.set(rombel, gi); groups.push({ rombel, items: [] }) }
    groups[gi].items.push(row)
  }
  // Tanpa Rombel selalu di akhir.
  groups.sort((a, b) => {
    if (a.rombel === 'Tanpa Rombel') return 1
    if (b.rombel === 'Tanpa Rombel') return -1
    return a.rombel.localeCompare(b.rombel, 'id')
  })
  return groups
}

function SiswaRecapTable({ data }: { data: any[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Nama Siswa</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">NIS</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Rombel</th>
            <th className="text-center px-4 py-3 font-medium text-blue-600">Hadir</th>
            <th className="text-center px-4 py-3 font-medium text-yellow-600">Sakit</th>
            <th className="text-center px-4 py-3 font-medium text-purple-600">Izin</th>
            <th className="text-center px-4 py-3 font-medium text-red-600">Alpha</th>
            <th className="text-center px-4 py-3 font-medium text-teal-600">Pulang</th>
            <th className="text-center px-4 py-3 font-medium text-gray-600">% Hadir</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Belum ada data absensi siswa untuk periode ini</td></tr>}
            {groupByRombel(data).map(group => (
              <Fragment key={group.rombel}>
                <tr className="bg-slate-100/80">
                  <td colSpan={10} className="px-4 py-2 text-sm font-semibold text-slate-700">{group.rombel} <span className="text-xs font-normal text-slate-500">({group.items.length} siswa)</span></td>
                </tr>
                {group.items.map((siswa: any, i: number) => <tr key={siswa.id || i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{siswa.nama}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{siswa.nis || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{siswa.rombel_nama || '-'}</td>
                  <td className="px-4 py-3 text-center font-medium text-blue-600">{siswa.hadir}</td>
                  <td className="px-4 py-3 text-center font-medium text-yellow-600">{siswa.sakit}</td>
                  <td className="px-4 py-3 text-center font-medium text-purple-600">{siswa.izin}</td>
                  <td className="px-4 py-3 text-center font-medium text-red-600">{siswa.alpha}</td>
                  <td className="px-4 py-3 text-center font-medium text-teal-600">{siswa.pulang || 0}</td>
                  <td className="px-4 py-3 text-center"><PercentageBadge row={siswa} /></td>
                </tr>)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GtkRecapTable({ data }: { data: any[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Nama GTK</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">NIP</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Jabatan</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Mata Pelajaran Diampu</th>
            <th className="text-center px-4 py-3 font-medium text-gray-600">Jumlah JTM</th>
            <th className="text-center px-4 py-3 font-medium text-emerald-600">Jumlah Kehadiran</th>
            <th className="text-center px-4 py-3 font-medium text-teal-600">Pulang</th>
            <th className="text-center px-4 py-3 font-medium text-yellow-600">Sakit</th>
            <th className="text-center px-4 py-3 font-medium text-purple-600">Izin</th>
            <th className="text-center px-4 py-3 font-medium text-red-600">Alpha</th>
            <th className="text-center px-4 py-3 font-medium text-gray-600">% Hadir</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 && <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">Belum ada data absensi GTK untuk periode ini</td></tr>}
            {data.map((gtk: any, i: number) => <tr key={gtk.id || i} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-600">{i + 1}</td>
              <td className="px-4 py-3 font-medium text-gray-800">{gtk.nama}</td>
              <td className="px-4 py-3 text-gray-600 text-xs">{gtk.nip || '-'}</td>
              <td className="px-4 py-3 text-gray-600">{gtk.jabatan || '-'}</td>
              <td className="px-4 py-3 text-gray-600 min-w-48">{gtk.mapel_list?.length ? gtk.mapel_list.join(', ') : '-'}</td>
              <td className="px-4 py-3 text-center font-medium text-gray-800">{gtk.jml_jtm}</td>
              <td className="px-4 py-3 text-center font-medium text-emerald-700">{gtk.jumlah_kehadiran}</td>
              <td className="px-4 py-3 text-center font-medium text-teal-600">{gtk.pulang || 0}</td>
              <td className="px-4 py-3 text-center font-medium text-yellow-600">{gtk.sakit}</td>
              <td className="px-4 py-3 text-center font-medium text-purple-600">{gtk.izin}</td>
              <td className="px-4 py-3 text-center font-medium text-red-600">{gtk.alpha}</td>
              <td className="px-4 py-3 text-center"><PercentageBadge row={gtk} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CategoryRecapTable({ data }: { data: any[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-medium text-gray-600">No</th><th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th><th className="text-left px-4 py-3 font-medium text-gray-600">NIS</th><th className="text-left px-4 py-3 font-medium text-gray-600">Rombel</th><th className="text-left px-4 py-3 font-medium text-gray-600">Kegiatan/Mapel</th><th className="text-center px-4 py-3 font-medium text-blue-600">Hadir</th><th className="text-center px-4 py-3 font-medium text-yellow-600">Sakit</th><th className="text-center px-4 py-3 font-medium text-purple-600">Izin</th><th className="text-center px-4 py-3 font-medium text-red-600">Alpha</th><th className="text-center px-4 py-3 font-medium text-gray-600">% Hadir</th></tr></thead>
      <tbody className="divide-y divide-gray-100">{data.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Belum ada data absensi untuk periode ini</td></tr>}{data.map((row: any, i: number) => <tr key={row.id || i} className="hover:bg-gray-50"><td className="px-4 py-3 text-gray-600">{i + 1}</td><td className="px-4 py-3 font-medium text-gray-800">{row.nama}</td><td className="px-4 py-3 text-gray-600 text-xs">{row.nis || row.nisn || '-'}</td><td className="px-4 py-3 text-gray-600">{row.rombel_nama || '-'}</td><td className="px-4 py-3 text-gray-600">{row.kegiatan_nama || '-'}</td><td className="px-4 py-3 text-center font-medium text-blue-600">{row.hadir}</td><td className="px-4 py-3 text-center font-medium text-yellow-600">{row.sakit}</td><td className="px-4 py-3 text-center font-medium text-purple-600">{row.izin}</td><td className="px-4 py-3 text-center font-medium text-red-600">{row.alpha}</td><td className="px-4 py-3 text-center"><PercentageBadge row={row} /></td></tr>)}</tbody>
    </table></div></div>
  )
}

// Ringkasan per mapel: jumlahkan seluruh baris (siswa x mapel) menjadi satu baris per mapel.
function aggregateByMapel(data: any[]) {
  const map = new Map<string, any>()
  for (const row of data) {
    const key = String(row.kegiatan_nama || '').trim() || '(tanpa mapel)'
    if (!map.has(key)) map.set(key, { kegiatan_nama: key, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0, total: 0 })
    const agg = map.get(key)
    agg.hadir += Number(row.hadir || 0)
    agg.sakit += Number(row.sakit || 0)
    agg.izin += Number(row.izin || 0)
    agg.alpha += Number(row.alpha || 0)
    agg.lain += Number(row.lain || 0)
    agg.total += Number(row.total || 0)
  }
  return Array.from(map.values()).sort((a, b) => a.kegiatan_nama.localeCompare(b.kegiatan_nama, 'id'))
}

function MapelAggregateTable({ data }: { data: any[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-medium text-gray-600">No</th><th className="text-left px-4 py-3 font-medium text-gray-600">Mata Pelajaran</th><th className="text-center px-4 py-3 font-medium text-blue-600">Hadir</th><th className="text-center px-4 py-3 font-medium text-yellow-600">Sakit</th><th className="text-center px-4 py-3 font-medium text-purple-600">Izin</th><th className="text-center px-4 py-3 font-medium text-red-600">Alpha</th><th className="text-center px-4 py-3 font-medium text-gray-600">Total</th><th className="text-center px-4 py-3 font-medium text-gray-600">% Hadir</th></tr></thead>
      <tbody className="divide-y divide-gray-100">{data.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Belum ada data absensi mapel untuk periode ini</td></tr>}{data.map((row: any, i: number) => <tr key={row.kegiatan_nama || i} className="hover:bg-gray-50"><td className="px-4 py-3 text-gray-600">{i + 1}</td><td className="px-4 py-3 font-medium text-gray-800">{row.kegiatan_nama}</td><td className="px-4 py-3 text-center font-medium text-blue-600">{row.hadir}</td><td className="px-4 py-3 text-center font-medium text-yellow-600">{row.sakit}</td><td className="px-4 py-3 text-center font-medium text-purple-600">{row.izin}</td><td className="px-4 py-3 text-center font-medium text-red-600">{row.alpha}</td><td className="px-4 py-3 text-center font-medium text-gray-800">{row.total}</td><td className="px-4 py-3 text-center"><PercentageBadge row={row} /></td></tr>)}</tbody>
    </table></div></div>
  )
}

// Rekap per guru: satu baris per GTK dengan daftar mapel yang diampu. Penting karena
// satu guru dapat mengampu lebih dari satu mapel, sehingga rekap per mapel saja tidak
// menunjukkan keterisian absensi per pengajar.
function GuruMapelRecapTable({ data }: { data: any[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-medium text-gray-600">No</th><th className="text-left px-4 py-3 font-medium text-gray-600">Nama Guru</th><th className="text-left px-4 py-3 font-medium text-gray-600">NIP</th><th className="text-left px-4 py-3 font-medium text-gray-600">Mata Pelajaran Diampu</th><th className="text-center px-4 py-3 font-medium text-blue-600">Hadir</th><th className="text-center px-4 py-3 font-medium text-yellow-600">Sakit</th><th className="text-center px-4 py-3 font-medium text-purple-600">Izin</th><th className="text-center px-4 py-3 font-medium text-red-600">Alpha</th><th className="text-center px-4 py-3 font-medium text-gray-600">Total</th><th className="text-center px-4 py-3 font-medium text-gray-600">% Hadir</th></tr></thead>
      <tbody className="divide-y divide-gray-100">{data.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Belum ada data absensi mapel per guru untuk periode ini</td></tr>}{data.map((row: any, i: number) => <tr key={row.id || i} className="hover:bg-gray-50"><td className="px-4 py-3 text-gray-600">{i + 1}</td><td className="px-4 py-3 font-medium text-gray-800">{row.nama}</td><td className="px-4 py-3 text-gray-600 text-xs">{row.nip || '-'}</td><td className="px-4 py-3 text-gray-600 min-w-48">{row.mapel_list?.length ? row.mapel_list.join(', ') : '-'}</td><td className="px-4 py-3 text-center font-medium text-blue-600">{row.hadir}</td><td className="px-4 py-3 text-center font-medium text-yellow-600">{row.sakit}</td><td className="px-4 py-3 text-center font-medium text-purple-600">{row.izin}</td><td className="px-4 py-3 text-center font-medium text-red-600">{row.alpha}</td><td className="px-4 py-3 text-center font-medium text-gray-800">{row.total}</td><td className="px-4 py-3 text-center"><PercentageBadge row={row} /></td></tr>)}</tbody>
    </table></div></div>
  )
}

export default function RekapAbsensiPage() {
  const settings = useSettingsStore(s => s.settings)
  const [tab, setTab] = useState<'siswa' | 'gtk'>('siswa')
  const [bulan, setBulan] = useState(() => todayWib().slice(0, 7))
  const [mode, setMode] = useState<'harian' | 'mingguan' | 'bulanan' | 'semester'>('bulanan')
  const [from, setFrom] = useState(() => todayWib())
  const [to, setTo] = useState(() => todayWib())
  const [rekapSiswa, setRekapSiswa] = useState<any[]>([])
  const [rekapGtk, setRekapGtk] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({ hadir: 0, sakit: 0, izin: 0, alpha: 0 })
  const [breakdown, setBreakdown] = useState<any>({ granularity: 'record', items: [] })
  const [reportPeriod, setReportPeriod] = useState({ from: todayWib(), to: todayWib(), label: '' })
  const [semester, setSemester] = useState<'ganjil' | 'genap'>(() => Number(todayWib().slice(5, 7)) >= 7 ? 'ganjil' : 'genap')
  const [tahunAjaran, setTahunAjaran] = useState(() => {
    const year = yearWib(), month = Number(todayWib().slice(5, 7))
    return month >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`
  })
  const [category, setCategory] = useState<'kehadiran' | 'mapel' | 'kokurikuler' | 'ekskul' | 'jamaah' | 'kegiatan_lain'>('kehadiran')
  const [categoryData, setCategoryData] = useState<any>({ summary: { total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0 }, detail: [] })
  const [rombels, setRombels] = useState<any[]>([])
  const [filterRombel, setFilterRombel] = useState('')
  const [mapels, setMapels] = useState<any[]>([])
  const [filterMapel, setFilterMapel] = useState('')
  // Tampilan kategori Absensi Mapel: per siswa (default), per mapel (agregat), atau per guru.
  const [mapelView, setMapelView] = useState<'siswa' | 'mapel' | 'guru'>('siswa')
  const [guruRecap, setGuruRecap] = useState<any>({ summary: { total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0 }, detail: [] })
  const recapRequestId = useRef(0)

  useEffect(() => {
    api.get('/rombel').then(r => setRombels(r.data)).catch(() => setRombels([]))
    api.get('/mapel').then(r => setMapels(r.data || [])).catch(() => setMapels([]))
  }, [])

  const reportRange = useCallback(() => {
    if (mode === 'bulanan') {
      const [year, month] = bulan.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      return { mulai: `${bulan}-01`, selesai: `${bulan}-${String(lastDay).padStart(2, '0')}` }
    }
    if (mode === 'semester') {
      const year = yearWib()
      return { mulai: `${year}-07-01`, selesai: `${year}-12-31` }
    }
    return { mulai: from, selesai: to }
  }, [bulan, mode, from, to])

  const loadCategoryRecap = useCallback(async () => {
    const range = reportRange()
    // Tampilan per guru memakai pengelompokan guru_id di backend.
    if (category === 'mapel' && mapelView === 'guru') {
      try {
        const res = await api.get('/rekap-absensi/kategori', { params: { kategori: 'mapel', group_by: 'guru', rombel_id: filterRombel, mapel_id: filterMapel, ...range } })
        setGuruRecap(res.data)
      } catch { setGuruRecap({ summary: { total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0 }, detail: [] }) }
      return
    }
    try {
      const res = await api.get('/rekap-absensi/kategori', { params: { kategori: category, rombel_id: filterRombel, mapel_id: category === 'mapel' ? filterMapel : '', ...range } })
      setCategoryData(res.data)
    } catch { setCategoryData({ summary: { total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0 }, detail: [] }) }
  }, [reportRange, category, filterRombel, filterMapel, mapelView])

  const loadRekap = useCallback(async () => {
    const requestId = ++recapRequestId.current
    try {
      const apiMode = mode === 'harian' ? 'daily' : mode === 'mingguan' ? 'weekly' : mode === 'bulanan' ? 'monthly' : 'semester'
      const params: Record<string, string> = { tipe: tab, mode: apiMode, rombel_id: filterRombel }
      if (mode === 'harian') params.tanggal = from
      if (mode === 'mingguan') params.mulai = from
      if (mode === 'bulanan') params.bulan = bulan
      if (mode === 'semester') { params.tahun_ajaran = tahunAjaran; params.semester = semester }
      const res = await api.get('/rekap-absensi', { params })
      if (requestId !== recapRequestId.current) return
      if (tab === 'siswa') setRekapSiswa(res.data.detail)
      else setRekapGtk(res.data.detail)
      setSummary(res.data.summary)
      setBreakdown(res.data.breakdown || { granularity: 'record', items: [] })
      setReportPeriod({ from: res.data.from, to: res.data.to, label: res.data.label || '' })
    } catch { /* empty */ }
  }, [bulan, tab, mode, from, to, tahunAjaran, semester, filterRombel])

  useEffect(() => { void loadRekap() }, [loadRekap])
  useEffect(() => { if (category !== 'kehadiran') void loadCategoryRecap() }, [category, loadCategoryRecap])

  const isGuruMapelView = category === 'mapel' && mapelView === 'guru'
  const data = category === 'kehadiran'
    ? (tab === 'siswa' ? rekapSiswa : rekapGtk)
    : (isGuruMapelView ? guruRecap.detail : categoryData.detail)
  const mapelAggregateRows = category === 'mapel' && mapelView === 'mapel' ? aggregateByMapel(categoryData.detail) : null
  const activeSummary = category === 'kehadiran' ? summary : (isGuruMapelView ? guruRecap.summary : categoryData.summary)
  const chartData = [
    { name: 'Hadir', value: activeSummary.hadir, fill: '#3b82f6' },
    { name: 'Sakit', value: activeSummary.sakit, fill: '#f59e0b' },
    { name: 'Izin', value: activeSummary.izin, fill: '#8b5cf6' },
    { name: 'Alpha', value: activeSummary.alpha, fill: '#ef4444' },
  ]

  const categoryLabel = { kehadiran: 'Kehadiran Masuk & Pulang', mapel: 'Mata Pelajaran', kokurikuler: 'Kokurikuler', ekskul: 'Ekstrakurikuler', jamaah: 'Jamaah', kegiatan_lain: 'Kegiatan Lain' }[category]
  // Suffix tampilan untuk kategori mapel supaya judul ekspor mencerminkan sudut pandang.
  const categoryViewLabel = category === 'mapel'
    ? (mapelView === 'mapel' ? ' per Mapel' : mapelView === 'guru' ? ' per Guru' : '')
    : ''
  const exportTitle = `${categoryLabel}${categoryViewLabel}`
  const tenant = tenantIdentity(settings)

  const exportExcel = () => {
    const isCategory = category !== 'kehadiran'
    // Rentang tanggal identik dengan exportPDF supaya layout Excel mengikuti PDF.
    const dates = (() => {
      const a = mode === 'bulanan' || mode === 'semester' ? reportPeriod.from : from
      const b = mode === 'bulanan' || mode === 'semester' ? reportPeriod.to : to
      const out: string[] = []
      let cursor = a
      while (cursor <= b) { out.push(cursor); cursor = addDaysWib(cursor, 1) }
      return out
    })()
    const periodeText = `${reportPeriod.label || `${reportPeriod.from} s/d ${reportPeriod.to}`}`
    const dayHeaders = dates.map(d => Number(d.slice(8, 10)))
    const aoa: any[][] = []

    if (category === 'kehadiran') {
      // Layout MATRIKS mengikuti export PDF (per-tanggal + total SAKIT/IZIN/ALFA/HADIR).
      const isSiswa = tab === 'siswa'
      aoa.push(['REKAPITULASI ABSENSI ' + (isSiswa ? 'SISWA' : 'GTK')])
      aoa.push([tenant.name])
      if (tenant.address) aoa.push([tenant.address])
      aoa.push(['Periode: ' + periodeText])
      aoa.push([])
      const header = ['NO', 'NAMA LENGKAP', isSiswa ? 'NISN/NIS' : 'NIP', ...dayHeaders, 'SAKIT', 'IZIN', 'ALFA', 'HADIR', 'PULANG']
      aoa.push(header)
      const pushRow = (row: any, i: number) => {
        const map = row.per_tanggal || {}
        const mapPulang = row.per_tanggal_pulang || {}
        aoa.push([
          i + 1,
          row.nama || '',
          isSiswa ? (row.nisn || row.nis || '') : (row.nip || ''),
          ...dates.map(x => (map[x] || '') + (mapPulang[x] ? '/' + mapPulang[x] : '')),
          row.sakit || 0, row.izin || 0, row.alpha || 0, row.hadir || 0, row.pulang || 0,
        ])
      }
      if (isSiswa) {
        for (const group of groupByRombel(data)) {
          aoa.push(['', group.rombel + ` (${group.items.length} siswa)`])
          group.items.forEach((d, i) => pushRow(d, i))
        }
      } else {
        data.forEach((d: any, i: number) => pushRow(d, i))
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      // Merge baris judul selebar tabel.
      const totalCols = header.length
      const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }]
      if (tenant.address) merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } })
      ws['!merges'] = merges
      ws['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 14 }, ...dates.map(() => ({ wch: 5 })), { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap')
      wb.Props = { Title: `Rekapitulasi Absensi ${categoryLabel}`, Subject: `Periode ${reportPeriod.label}`, Author: tenant.name, Company: tenant.name }
      XLSX.writeFile(wb, tenantExportFilename(`Rekap_Absensi_${category}`, tenant.name, reportPeriod.from, 'xlsx'))
      toast.success('Excel diunduh')
      return
    }

    // Kategori non-kehadiran: kolom datar, dikelompokkan per rombel.
    // Tampilan "per guru" memakai satu baris per GTK dengan daftar mapel diampu.
    const guruView = category === 'mapel' && mapelView === 'guru'
    const header = guruView
      ? ['No', 'Nama Guru', 'NIP', 'Mata Pelajaran Diampu', 'Hadir', 'Sakit', 'Izin', 'Alpha', 'Lain', 'Total', '% Hadir']
      : ['No', 'Nama', 'NIS/NISN', 'Rombel', 'Kegiatan/Mapel', 'Hadir', 'Sakit', 'Izin', 'Alpha', 'Lain', 'Total', '% Hadir']
    const rows = (d: any, i: number) => (guruView
      ? [i + 1, d.nama, d.nip || '', (d.mapel_list || []).join(', '), d.hadir, d.sakit, d.izin, d.alpha, d.lain, d.total, d.total > 0 ? Math.round(d.hadir / d.total * 100) + '%' : '0%']
      : [i + 1, d.nama, d.nisn || d.nis || '', d.rombel_nama || '', d.kegiatan_nama || (d.mapel_list || []).join(', '), d.hadir, d.sakit, d.izin, d.alpha, d.lain, d.total, d.total > 0 ? Math.round(d.hadir / d.total * 100) + '%' : '0%'])
    aoa.push([`Rekapitulasi Absensi ${exportTitle}`])
    aoa.push([tenant.name])
    if (tenant.address) aoa.push([tenant.address])
    aoa.push([`Periode: ${periodeText}`])
    aoa.push([])
    aoa.push(header)
    if (guruView) {
      data.forEach((d: any, i: number) => aoa.push(rows(d, i)))
    } else {
      for (const group of groupByRombel(data)) {
        aoa.push(['', group.rombel + ` (${group.items.length} siswa)`])
        group.items.forEach((d, i) => aoa.push(rows(d, i)))
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = header.map(() => ({ wch: 15 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap')
    wb.Props = { Title: `Rekapitulasi Absensi ${categoryLabel}`, Subject: `Periode ${reportPeriod.label}`, Author: tenant.name, Company: tenant.name }
    XLSX.writeFile(wb, tenantExportFilename(`Rekap_Absensi_${category}`, tenant.name, reportPeriod.from, 'xlsx'))
    toast.success('Excel diunduh')
  }

  const exportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { toast.error('Popup blocked'); return }
    const fmt = (x: string) => new Date(x + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const logo = tenant.logo ? `<img src="${escapeHtml(tenant.logo)}" alt="Logo ${escapeHtml(tenant.name)}" onerror="this.style.display='none'">` : ''
    // Kategori selain kehadiran memakai tabel datar (Hadir/Sakit/Izin/Alpha),
    // bukan matriks per-tanggal — sebelumnya PDF kategori ini kosong karena selalu
    // memakai layout matriks yang hanya berisi data absensi harian.
    if (category !== 'kehadiran') {
      const guruView = category === 'mapel' && mapelView === 'guru'
      const header = guruView
        ? ['NO', 'NAMA GURU', 'NIP', 'MATA PELAJARAN DIAMPU', 'HADIR', 'SAKIT', 'IZIN', 'ALFA', 'LAIN', 'TOTAL', '% HADIR']
        : ['NO', 'NAMA', 'NIS/NISN', 'ROMBEL', 'KEGIATAN/MAPEL', 'HADIR', 'SAKIT', 'IZIN', 'ALFA', 'LAIN', 'TOTAL', '% HADIR']
      const pct = (d: any) => d.total > 0 ? Math.round(d.hadir / d.total * 100) + '%' : '0%'
      const row = (d: any, i: number) => (guruView
        ? `<tr><td>${i + 1}</td><td class="nama">${escapeHtml(d.nama || '')}</td><td>${escapeHtml(d.nip || '')}</td><td class="nama">${escapeHtml((d.mapel_list || []).join(', '))}</td><td>${d.hadir || 0}</td><td>${d.sakit || 0}</td><td>${d.izin || 0}</td><td>${d.alpha || 0}</td><td>${d.lain || 0}</td><td>${d.total || 0}</td><td>${pct(d)}</td></tr>`
        : `<tr><td>${i + 1}</td><td class="nama">${escapeHtml(d.nama || '')}</td><td>${escapeHtml(d.nisn || d.nis || '')}</td><td>${escapeHtml(d.rombel_nama || '')}</td><td class="nama">${escapeHtml(d.kegiatan_nama || '')}</td><td>${d.hadir || 0}</td><td>${d.sakit || 0}</td><td>${d.izin || 0}</td><td>${d.alpha || 0}</td><td>${d.lain || 0}</td><td>${d.total || 0}</td><td>${pct(d)}</td></tr>`)
      const body = guruView
        ? data.map((d: any, i: number) => row(d, i)).join('')
        : (groupByRombel(data).map(group => `<tr class="rombel"><td colspan="${header.length}">${escapeHtml(group.rombel)} (${group.items.length} siswa)</td></tr>` + group.items.map((d: any, i: number) => row(d, i)).join('')).join(''))
      // Deklarasi lokal: blok non-kehadiran memakai periodeText sementara deklarasi
      // fungsi (matriks kehadiran) ada di bawah — tanpa ini terjadi TDZ (dipakai sebelum deklarasi).
      const periodeText = `${fmt(reportPeriod.from)} s/d ${fmt(reportPeriod.to)}`
      const title = tenantExportFilename(`Rekap_Absensi_${category}`, tenant.name, reportPeriod.from, 'pdf').replace(/\.pdf$/, '')
      printWindow.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><meta name="author" content="${escapeHtml(tenant.name)}"><style>@page{size:portrait;margin:8mm}body{font-family:Arial,sans-serif;font-size:10px;color:#000}.kop{display:flex;align-items:center;justify-content:center;gap:12px;border-bottom:2px solid #000;padding-bottom:7px;margin-bottom:6px}.kop img{width:58px;height:58px;object-fit:contain}.kop-text{text-align:center}.kop-text h2,.kop-text h3{margin:1px 0}h2,h3{text-align:center;margin:1px 0}.meta{display:flex;gap:12px;margin:8px 0;font-weight:bold}.hl{background:#ffeb3b;padding:2px 14px}table{border-collapse:collapse;width:100%;font-size:9px}th,td{border:1px solid #000;text-align:center;padding:3px}.nama{text-align:left}.rombel td{background:#e2e8f0;font-weight:bold;text-align:left}.foot{margin-top:8px;font-size:8px;display:flex;justify-content:space-between}</style></head><body><div class="kop">${logo}<div class="kop-text"><h2>${escapeHtml(tenant.name)}</h2>${tenant.address ? `<div>${escapeHtml(tenant.address)}</div>` : ''}<h3>REKAPITULASI ABSENSI ${escapeHtml(exportTitle.toUpperCase())}</h3></div></div><div class="meta"><div>PERIODE: <span class="hl">${escapeHtml(periodeText)}</span></div></div><table><thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><div class="foot"><div>Kode: H=Hadir, S=Sakit, I=Izin, A=Alfa</div><div>Dicetak: ${new Date().toLocaleString('id-ID')}</div></div></body></html>`)
      printWindow.document.close()
      return
    }
    const who = tab === 'siswa' ? 'SISWA' : 'GTK'
    const dates = (() => {
      const out: string[] = []
      const a = mode === 'bulanan' || mode === 'semester' ? reportPeriod.from : from
      const b = mode === 'bulanan' || mode === 'semester' ? reportPeriod.to : to
      let cursor = a
      while (cursor <= b) { out.push(cursor); cursor = addDaysWib(cursor, 1) }
      return out
    })()
    const periodeText = `${fmt(reportPeriod.from)} s/d ${fmt(reportPeriod.to)}`
    const dayHeaders = dates.map(d => `<th class="tgl">${Number(d.slice(8,10))}</th>`).join('')
    const cell = (d: any, i: number) => {
      const map = d.per_tanggal || {}
      const mapPulang = d.per_tanggal_pulang || {}
      const dayCells = dates.map(x => `<td>${escapeHtml((map[x] || '') + (mapPulang[x] ? '/' + mapPulang[x] : ''))}</td>`).join('')
      return `<tr><td>${i+1}</td><td class="nama">${escapeHtml(d.nama || '')}</td><td>${escapeHtml(d.nisn || d.nis || d.nip || '')}</td>${dayCells}<td>${d.sakit || 0}</td><td>${d.izin || 0}</td><td>${d.alpha || 0}</td><td>${d.hadir || 0}</td><td>${d.pulang || 0}</td></tr>`
    }
    const totalCols = 8 + dates.length
    const rows = (tab === 'siswa'
      ? groupByRombel(data).map(group => `<tr class="rombel"><td colspan="${totalCols}">${escapeHtml(group.rombel)} (${group.items.length} siswa)</td></tr>` + group.items.map((d, i) => cell(d, i)).join('')).join('')
      : data.map((d: any, i: number) => cell(d, i)).join('')
    )
    const title = tenantExportFilename(`Rekap_Absensi_${category}`, tenant.name, reportPeriod.from, 'pdf').replace(/\.pdf$/, '')
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><meta name="author" content="${escapeHtml(tenant.name)}"><style>@page{size:landscape;margin:7mm}body{font-family:Arial,sans-serif;font-size:9px;color:#000}.kop{display:flex;align-items:center;justify-content:center;gap:12px;border-bottom:2px solid #000;padding-bottom:7px;margin-bottom:6px}.kop img{width:58px;height:58px;object-fit:contain}.kop-text{text-align:center}.kop-text h2,.kop-text h3{margin:1px 0}h2,h3{text-align:center;margin:1px 0}.meta{display:flex;gap:12px;margin:8px 0;font-weight:bold}.hl{background:#ffeb3b;padding:2px 14px}table{border-collapse:collapse;width:100%;font-size:8px}th,td{border:1px solid #000;text-align:center;padding:2px}.nama{text-align:left;min-width:170px}.rombel td{background:#e2e8f0;font-weight:bold;text-align:left}.tgl{width:18px}.total{background:#e5e7eb;font-weight:bold}.s{background:#22c55e}.i{background:#38bdf8}.a{background:#ef4444;color:#fff}.h{background:#d1d5db}.foot{margin-top:8px;font-size:8px;display:flex;justify-content:space-between}</style></head><body><div class="kop">${logo}<div class="kop-text"><h2>${escapeHtml(tenant.name)}</h2>${tenant.address ? `<div>${escapeHtml(tenant.address)}</div>` : ''}<h3>REKAPITULASI ABSENSI ${who}</h3><h3>SEMESTER GANJIL TP. ${new Date().getFullYear()}/${new Date().getFullYear()+1}</h3></div></div><div class="meta"><div>PERIODE: <span class="hl">${escapeHtml(periodeText)}</span></div><div>KELAS: <span class="hl">${tab==='siswa'?'SEMUA KELAS':'GTK'}</span></div></div><table><thead><tr><th rowspan="2">NO</th><th rowspan="2">NAMA LENGKAP</th><th rowspan="2">NISN/NIS</th><th colspan="${dates.length}">TANGGAL</th><th colspan="4" class="total">TOTAL</th></tr><tr>${dayHeaders}<th class="s">SAKIT</th><th class="i">IZIN</th><th class="a">ALFA</th><th class="h">HADIR</th></tr></thead><tbody>${rows}</tbody></table><div class="foot"><div>Kode: H=Hadir, S=Sakit, I=Izin, A=Alfa</div><div>Dicetak: ${new Date().toLocaleString('id-ID')}</div></div><script>setTimeout(()=>window.print(),500)<\/script></body></html>`)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Rekapitulasi Absensi</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap kehadiran siswa, GTK, mapel, kegiatan, ekstrakurikuler, dan jamaah</p>
          <select value={category} onChange={e => setCategory(e.target.value as typeof category)} className="mt-3 px-3 py-2 border rounded-lg text-sm">
            <option value="kehadiran">Kehadiran Masuk & Pulang</option>
            <option value="mapel">Absensi Mapel</option>
            <option value="kokurikuler">Absensi Kokurikuler</option>
            <option value="ekskul">Absensi Ekstrakurikuler</option>
            <option value="jamaah">Absensi Jamaah</option>
            <option value="kegiatan_lain">Absensi Kegiatan Lain</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
        <div className="flex bg-gray-100 rounded-lg p-1">
          {category === 'kehadiran' && <>
            <button onClick={() => setTab('siswa')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${tab === 'siswa' ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>
              <GraduationCap size={16} /> Siswa
            </button>
            <button onClick={() => setTab('gtk')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${tab === 'gtk' ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>
              <Users size={16} /> GTK
            </button>
          </>}
        </div>
        <select value={mode} onChange={e => setMode(e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm"><option value="harian">Harian</option><option value="mingguan">Mingguan</option><option value="bulanan">Bulanan</option><option value="semester">Semester</option></select>
        {(category !== 'kehadiran' || tab === 'siswa') && (
          <select value={filterRombel} onChange={e => setFilterRombel(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">Semua Rombel</option>
            {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
          </select>
        )}
        {category === 'mapel' && (
          <>
            <select value={filterMapel} onChange={e => setFilterMapel(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">Semua Mapel</option>
              {mapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {([['siswa', 'Per Siswa'], ['mapel', 'Per Mapel'], ['guru', 'Per Guru']] as const).map(([value, label]) => (
                <button key={value} onClick={() => setMapelView(value)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${mapelView === value ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>{label}</button>
              ))}
            </div>
          </>
        )}
        {mode === 'bulanan' && <input type="month" value={bulan} onChange={e => setBulan(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />}
        {mode === 'harian' && <input type="date" value={from} onChange={e => { setFrom(e.target.value); setTo(e.target.value) }} className="px-3 py-2 border rounded-lg text-sm" />}
        {mode === 'mingguan' && <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />}
        {mode === 'semester' && <><input value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} placeholder="2026/2027" className="px-3 py-2 border rounded-lg text-sm w-32" /><select value={semester} onChange={e => setSemester(e.target.value as 'ganjil' | 'genap')} className="px-3 py-2 border rounded-lg text-sm"><option value="ganjil">Ganjil</option><option value="genap">Genap</option></select></>}
        <span className="text-xs text-gray-500">{reportPeriod.label}</span>
      </div>

      {category === 'kehadiran' && breakdown.items.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Akumulasi {breakdown.granularity === 'daily' ? 'harian' : breakdown.granularity === 'weekly' ? 'mingguan' : breakdown.granularity === 'monthly' ? 'bulanan' : 'periode'}</h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">{breakdown.items.map((item: any) => <div key={`${item.from}-${item.to}`} className="border rounded-lg p-3 text-xs"><div className="font-semibold text-gray-700">{item.label}</div><div className="mt-1 text-gray-500">H {item.summary.hadir} · S {item.summary.sakit} · I {item.summary.izin} · A {item.summary.alpha}</div></div>)}</div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600 font-medium">Hadir</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{activeSummary.hadir}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
          <p className="text-xs text-yellow-600 font-medium">Sakit</p>
          <p className="text-2xl font-bold text-yellow-800 mt-1">{activeSummary.sakit}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
          <p className="text-xs text-purple-600 font-medium">Izin</p>
          <p className="text-2xl font-bold text-purple-800 mt-1">{activeSummary.izin}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-xs text-red-600 font-medium">Alpha</p>
          <p className="text-2xl font-bold text-red-800 mt-1">{activeSummary.alpha}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Grafik Kehadiran</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="value" name="Jumlah" radius={[4,4,0,0]}>
              {chartData.map((entry, i) => <rect key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Siswa dan GTK merupakan dua daftar berbeda; hanya daftar tab aktif yang dirender. */}
      {category === 'kehadiran'
        ? (tab === 'siswa' ? <SiswaRecapTable data={rekapSiswa} /> : <GtkRecapTable data={rekapGtk} />)
        : (category === 'mapel' && mapelView === 'mapel'
          ? <MapelAggregateTable data={mapelAggregateRows || []} />
          : (category === 'mapel' && mapelView === 'guru'
            ? <GuruMapelRecapTable data={guruRecap.detail} />
            : <CategoryRecapTable data={categoryData.detail} />))}
    </div>
  )
}
