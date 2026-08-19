import { useState, useEffect } from 'react'
import { escapeHtml } from '../../utils/escapeHtml'
import { Download, FileSpreadsheet, Users, GraduationCap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import api from '../../services/api'
import * as XLSX from 'xlsx'

export default function RekapAbsensiPage() {
  const [tab, setTab] = useState<'siswa' | 'gtk'>('siswa')
  const [bulan, setBulan] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
  const [mode, setMode] = useState<'harian' | 'mingguan' | 'bulanan' | 'semester'>('bulanan')
  const [from, setFrom] = useState(() => new Date().toISOString().split('T')[0])
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])
  const [rekapSiswa, setRekapSiswa] = useState<any[]>([])
  const [rekapGtk, setRekapGtk] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({ hadir: 0, sakit: 0, izin: 0, alpha: 0 })

  useEffect(() => { loadRekap() }, [bulan, tab, mode, from, to])

  const loadRekap = async () => {
    try {
      const apiMode = mode === 'harian' ? 'daily' : mode === 'mingguan' ? 'weekly' : mode === 'bulanan' ? 'monthly' : 'semester'
      const res = await api.get('/rekap-absensi', { params: { tipe: tab, mode: apiMode, mulai: from, tanggal_mulai: from, selesai: to, tanggal_selesai: to, bulan, tahun_ajaran: new Date().getFullYear() + '/' + (new Date().getFullYear()+1), semester: 'ganjil' } })
      if (tab === 'siswa') setRekapSiswa(res.data.detail)
      else setRekapGtk(res.data.detail)
      setSummary(res.data.summary)
    } catch { /* empty */ }
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
    const ws = XLSX.utils.aoa_to_sheet([
      [`Rekapitulasi Absensi ${tab === 'siswa' ? 'Siswa' : 'GTK'} - ${bulan}`],
      [],
      header,
      ...rows
    ])
    ws['!cols'] = header.map(() => ({ wch: 15 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap')
    XLSX.writeFile(wb, `Rekap_Absensi_${tab}_${bulan}.xlsx`)
    toast.success('Excel diunduh')
  }

  const exportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { toast.error('Popup blocked'); return }
    const who = tab === 'siswa' ? 'SISWA' : 'GTK'
    const fmt = (x: string) => new Date(x + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const dates = (() => {
      const out: string[] = []
      const a = mode === 'bulanan' || mode === 'semester' ? (data[0]?.from || '') : from
      const b = mode === 'bulanan' ? `${bulan}-${String(new Date(Number(bulan.slice(0,4)), Number(bulan.slice(5,7)), 0).getDate()).padStart(2,'0')}` : mode === 'semester' ? (data[0]?.to || to) : to
      const start = new Date((mode === 'bulanan' ? `${bulan}-01` : a) + 'T00:00:00')
      const end = new Date(b + 'T00:00:00')
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) out.push(d.toISOString().slice(0,10))
      return out
    })()
    const periodeText = mode === 'bulanan' ? `${fmt(`${bulan}-01`)} s/d ${fmt(dates[dates.length-1] || `${bulan}-01`)}` : `${fmt(from)} s/d ${fmt(to)}`
    const dayHeaders = dates.map(d => `<th class="tgl">${Number(d.slice(8,10))}</th>`).join('')
    const rows = data.map((d: any, i: number) => {
      const map = d.per_tanggal || {}
      const dayCells = dates.map(x => `<td>${escapeHtml(map[x] || '')}</td>`).join('')
      return `<tr><td>${i+1}</td><td class="nama">${escapeHtml(d.nama || '')}</td><td>${escapeHtml(d.nisn || d.nis || d.nip || '')}</td>${dayCells}<td>${d.sakit || 0}</td><td>${d.izin || 0}</td><td>${d.alpha || 0}</td><td>${d.hadir || 0}</td></tr>`
    }).join('')
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Rekap Absensi</title><style>@page{size:landscape;margin:7mm}body{font-family:Arial,sans-serif;font-size:9px;color:#000}h2,h3{text-align:center;margin:1px 0}.meta{display:flex;gap:12px;margin:8px 0;font-weight:bold}.hl{background:#ffeb3b;padding:2px 14px}table{border-collapse:collapse;width:100%;font-size:8px}th,td{border:1px solid #000;text-align:center;padding:2px}.nama{text-align:left;min-width:170px}.tgl{width:18px}.total{background:#e5e7eb;font-weight:bold}.s{background:#22c55e}.i{background:#38bdf8}.a{background:#ef4444;color:#fff}.h{background:#d1d5db}.foot{margin-top:8px;font-size:8px;display:flex;justify-content:space-between}</style></head><body><h2>REKAPITULASI ABSENSI ${who}</h2><h3>SEMESTER GANJIL TP. ${new Date().getFullYear()}/${new Date().getFullYear()+1}</h3><h3>MADRASAH TSANAWIYAH PLUS SUNAN DRAJAT 7 PALANG</h3><div class="meta"><div>PERIODE: <span class="hl">${escapeHtml(periodeText)}</span></div><div>KELAS: <span class="hl">${tab==='siswa'?'SEMUA KELAS':'GTK'}</span></div></div><table><thead><tr><th rowspan="2">NO</th><th rowspan="2">NAMA LENGKAP</th><th rowspan="2">NISN/NIS</th><th colspan="${dates.length}">TANGGAL</th><th colspan="4" class="total">TOTAL</th></tr><tr>${dayHeaders}<th class="s">SAKIT</th><th class="i">IZIN</th><th class="a">ALFA</th><th class="h">HADIR</th></tr></thead><tbody>${rows}</tbody></table><div class="foot"><div>Kode: H=Hadir, S=Sakit, I=Izin, A=Alfa</div><div>Dicetak: ${new Date().toLocaleString('id-ID')}</div></div><script>setTimeout(()=>window.print(),500)<\/script></body></html>`)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Rekapitulasi Absensi</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap kehadiran siswa dan GTK per bulan</p>
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
          <button onClick={() => setTab('siswa')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${tab === 'siswa' ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>
            <GraduationCap size={16} /> Siswa
          </button>
          <button onClick={() => setTab('gtk')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${tab === 'gtk' ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>
            <Users size={16} /> GTK
          </button>
        </div>
        <select value={mode} onChange={e => setMode(e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm"><option value="harian">Harian</option><option value="mingguan">Mingguan</option><option value="bulanan">Bulanan</option><option value="semester">Semester</option></select><input type="month" value={bulan} onChange={e => setBulan(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />{mode !== 'bulanan' && mode !== 'semester' && <><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" /><input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" /></>}
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
