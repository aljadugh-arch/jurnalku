import { useState, useEffect } from 'react'
import { Download, FileSpreadsheet, Users, GraduationCap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import api from '../../services/api'
import * as XLSX from 'xlsx'

type Mode = 'weekly' | 'monthly' | 'semester' | 'yearly'

export default function RekapAbsensiPage() {
  const [tab, setTab] = useState<'siswa' | 'gtk'>('siswa')
  const [mode, setMode] = useState<Mode>('monthly')
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const [bulan, setBulan] = useState(() => { const d = today; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
  const [mulai, setMulai] = useState(() => iso(today))
  const [tahun, setTahun] = useState(() => String(today.getFullYear()))
  const [tahunAjaran, setTahunAjaran] = useState(() => {
    const y = today.getFullYear(); const m = today.getMonth() + 1
    return m >= 7 ? `${y}/${y+1}` : `${y-1}/${y}`
  })
  const [semester, setSemester] = useState<'ganjil' | 'genap'>(() => (today.getMonth() + 1) >= 7 ? 'ganjil' : 'genap')
  const [rekapSiswa, setRekapSiswa] = useState<any[]>([])
  const [rekapGtk, setRekapGtk] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({ hadir: 0, sakit: 0, izin: 0, alpha: 0 })
  const [periodeLabel, setPeriodeLabel] = useState('')

  useEffect(() => { loadRekap() }, [mode, bulan, mulai, tahun, tahunAjaran, semester, tab])

  const buildParams = () => {
    const p: any = { tipe: tab, mode }
    if (mode === 'weekly') p.mulai = mulai
    else if (mode === 'monthly') p.bulan = bulan
    else if (mode === 'yearly') p.tahun = tahun
    else if (mode === 'semester') { p.tahun_ajaran = tahunAjaran; p.semester = semester }
    return p
  }

  const loadRekap = async () => {
    try {
      const res = await api.get('/rekap-absensi', { params: buildParams() })
      if (tab === 'siswa') setRekapSiswa(res.data.detail)
      else setRekapGtk(res.data.detail)
      setSummary(res.data.summary)
      setPeriodeLabel(res.data.label || '')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat rekap')
    }
  }

  const data = tab === 'siswa' ? rekapSiswa : rekapGtk

  const chartData = [
    { name: 'Hadir', value: summary.hadir, fill: '#3b82f6' },
    { name: 'Sakit', value: summary.sakit, fill: '#f59e0b' },
    { name: 'Izin', value: summary.izin, fill: '#8b5cf6' },
    { name: 'Alpha', value: summary.alpha, fill: '#ef4444' },
  ]

  const exportExcel = () => {
    const header = tab === 'siswa'
      ? ['No', 'Nama', 'NIS', 'Rombel', 'Hadir', 'Sakit', 'Izin', 'Alpha', '% Hadir']
      : ['No', 'Nama', 'NIP', 'Jabatan', 'Hadir', 'Sakit', 'Izin', 'Alpha', '% Hadir']
    const rows = data.map((d: any, i: number) => [
      i + 1, d.nama, d.nis || d.nip || '', d.rombel_nama || d.jabatan || '',
      d.hadir, d.sakit, d.izin, d.alpha,
      d.total > 0 ? Math.round(d.hadir / d.total * 100) + '%' : '0%'
    ])
    const periodeStr = periodeLabel || bulan
    const suffix = mode === 'weekly' ? `week_${mulai}`
      : mode === 'yearly' ? `year_${tahun}`
      : mode === 'semester' ? `sem_${semester}_${tahunAjaran.replace('/', '-')}`
      : `bulan_${bulan}`
    const ws = XLSX.utils.aoa_to_sheet([
      [`Rekapitulasi Absensi ${tab === 'siswa' ? 'Siswa' : 'GTK'} — ${periodeStr}`],
      [],
      header,
      ...rows
    ])
    ws['!cols'] = header.map(() => ({ wch: 15 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap')
    XLSX.writeFile(wb, `Rekap_Absensi_${tab}_${suffix}.xlsx`)
    toast.success('Excel diunduh')
  }

  const exportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { toast.error('Popup blocked'); return }
    const header = tab === 'siswa'
      ? '<th>No</th><th>Nama</th><th>NIS</th><th>Rombel</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpha</th><th>%</th>'
      : '<th>No</th><th>Nama</th><th>NIP</th><th>Jabatan</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpha</th><th>%</th>'
    const rows = data.map((d: any, i: number) =>
      `<tr><td>${i+1}</td><td>${d.nama}</td><td>${d.nis||d.nip||''}</td><td>${d.rombel_nama||d.jabatan||''}</td><td>${d.hadir}</td><td>${d.sakit}</td><td>${d.izin}</td><td>${d.alpha}</td><td>${d.total>0?Math.round(d.hadir/d.total*100):'0'}%</td></tr>`
    ).join('')
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Rekap Absensi</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px;text-align:center}th{background:#f3f4f6}@media print{body{padding:0}}</style></head><body><h2 style="text-align:center">Rekapitulasi Absensi ${tab === 'siswa' ? 'Siswa' : 'GTK'}</h2><h3 style="text-align:center">Periode: ${bulan}</h3><p>Total: Hadir ${summary.hadir} | Sakit ${summary.sakit} | Izin ${summary.izin} | Alpha ${summary.alpha}</p><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table><script>setTimeout(()=>window.print(),500)</script></body></html>`)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Rekapitulasi Absensi</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap kehadiran siswa dan GTK — mingguan, bulanan, semester, tahunan</p>
          {periodeLabel && <p className="text-xs text-gray-400 mt-0.5">Periode: {periodeLabel}</p>}
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
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('siswa')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${tab === 'siswa' ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>
            <GraduationCap size={16} /> Siswa
          </button>
          <button onClick={() => setTab('gtk')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${tab === 'gtk' ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>
            <Users size={16} /> GTK
          </button>
        </div>
        <select value={mode} onChange={e => setMode(e.target.value as Mode)} className="px-3 py-2 border rounded-lg text-sm">
          <option value="weekly">Mingguan (7 hari)</option>
          <option value="monthly">Bulanan</option>
          <option value="semester">Per-Semester</option>
          <option value="yearly">Tahunan</option>
        </select>
        {mode === 'weekly' && (
          <label className="text-xs text-gray-600 flex items-center gap-2">Mulai
            <input type="date" value={mulai} onChange={e => setMulai(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          </label>
        )}
        {mode === 'monthly' && (
          <input type="month" value={bulan} onChange={e => setBulan(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
        )}
        {mode === 'yearly' && (
          <label className="text-xs text-gray-600 flex items-center gap-2">Tahun
            <input type="number" min="2020" max="2100" value={tahun} onChange={e => setTahun(e.target.value)} className="px-3 py-2 border rounded-lg text-sm w-28" />
          </label>
        )}
        {mode === 'semester' && (
          <>
            <label className="text-xs text-gray-600 flex items-center gap-2">Tahun Ajaran
              <input type="text" value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} placeholder="2026/2027" className="px-3 py-2 border rounded-lg text-sm w-32" />
            </label>
            <select value={semester} onChange={e => setSemester(e.target.value as 'ganjil' | 'genap')} className="px-3 py-2 border rounded-lg text-sm">
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600 font-medium">Hadir</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{summary.hadir}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
          <p className="text-xs text-yellow-600 font-medium">Sakit</p>
          <p className="text-2xl font-bold text-yellow-800 mt-1">{summary.sakit}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
          <p className="text-xs text-purple-600 font-medium">Izin</p>
          <p className="text-2xl font-bold text-purple-800 mt-1">{summary.izin}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-xs text-red-600 font-medium">Alpha</p>
          <p className="text-2xl font-bold text-red-800 mt-1">{summary.alpha}</p>
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

      {/* Tabel Detail */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{tab === 'siswa' ? 'NIS' : 'NIP'}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{tab === 'siswa' ? 'Rombel' : 'Jabatan'}</th>
                <th className="text-center px-4 py-3 font-medium text-blue-600">Hadir</th>
                <th className="text-center px-4 py-3 font-medium text-yellow-600">Sakit</th>
                <th className="text-center px-4 py-3 font-medium text-purple-600">Izin</th>
                <th className="text-center px-4 py-3 font-medium text-red-600">Alpha</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">% Hadir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Belum ada data absensi untuk periode ini</td></tr>
              )}
              {data.map((d: any, i: number) => (
                <tr key={d.id || i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{d.nama}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{d.nis || d.nip || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.rombel_nama || d.jabatan || '-'}</td>
                  <td className="px-4 py-3 text-center font-medium text-blue-600">{d.hadir}</td>
                  <td className="px-4 py-3 text-center font-medium text-yellow-600">{d.sakit}</td>
                  <td className="px-4 py-3 text-center font-medium text-purple-600">{d.izin}</td>
                  <td className="px-4 py-3 text-center font-medium text-red-600">{d.alpha}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${d.total > 0 && d.hadir/d.total >= 0.9 ? 'bg-green-100 text-green-700' : d.total > 0 && d.hadir/d.total >= 0.75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {d.total > 0 ? Math.round(d.hadir / d.total * 100) : 0}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
