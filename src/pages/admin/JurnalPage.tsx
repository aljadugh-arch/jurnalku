import { useState, useEffect } from 'react'
import { Download, FileSpreadsheet, Eye, CheckCircle, XCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import * as XLSX from 'xlsx'

export default function JurnalPage() {
  const [data, setData] = useState<any[]>([])
  const [filter, setFilter] = useState({ tanggal: '', guru_id: '', status: '' })
  const [gtks, setGtks] = useState<any[]>([])
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    api.get('/gtk').then(res => setGtks(res.data))
    loadData()
  }, [])

  useEffect(() => { loadData() }, [filter])

  const loadData = async () => {
    const params: any = {}
    if (filter.tanggal) params.tanggal = filter.tanggal
    if (filter.guru_id) params.guru_id = filter.guru_id
    if (filter.status) params.status = filter.status
    const res = await api.get('/jurnal', { params })
    setData(res.data)
  }

  const updateStatus = async (id: string, status: string) => {
    await api.put('/jurnal/' + id, { status })
    toast.success(`Status diubah ke ${status}`)
    loadData()
    if (detail?.id === id) setDetail({ ...detail, status })
  }

  const exportExcel = () => {
    const rows = data.map((d, i) => [
      i + 1, d.tanggal, d.guru_nama || '', d.mapel_nama || '', d.rombel_nama || '',
      `Jam ${d.jam_ke}`, d.materi || '', d.kegiatan || '', d.catatan || '', d.status
    ])
    const ws = XLSX.utils.aoa_to_sheet([
      ['Jurnal Mengajar - JURNALKU'], [],
      ['No', 'Tanggal', 'Guru', 'Mapel', 'Rombel', 'Jam Ke', 'Materi', 'Kegiatan', 'Catatan', 'Status'],
      ...rows
    ])
    ws['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Jurnal')
    XLSX.writeFile(wb, 'Jurnal_Mengajar.xlsx')
    toast.success('Excel diunduh')
  }

  const exportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { toast.error('Popup blocked'); return }
    const rows = data.map((d, i) =>
      `<tr><td>${i+1}</td><td>${d.tanggal}</td><td>${d.guru_nama||''}</td><td>${d.mapel_nama||''}</td><td>${d.rombel_nama||''}</td><td>${d.jam_ke||''}</td><td>${d.materi||''}</td><td>${d.status}</td></tr>`
    ).join('')
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Jurnal Mengajar</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:5px}th{background:#f3f4f6;font-size:10px}@media print{body{padding:0}}</style></head><body><h2 style="text-align:center">Jurnal Mengajar</h2><table><thead><tr><th>No</th><th>Tanggal</th><th>Guru</th><th>Mapel</th><th>Rombel</th><th>Jam</th><th>Materi</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><script>setTimeout(()=>window.print(),500)<\/script></body></html>`)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Jurnal Mengajar</h1>
          <p className="text-gray-500 text-sm mt-1">Monitoring & kontrol jurnal mengajar guru</p>
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
        <input type="date" value={filter.tanggal} onChange={e => setFilter({...filter, tanggal: e.target.value})} className="px-3 py-2 border rounded-lg text-sm" />
        <select value={filter.guru_id} onChange={e => setFilter({...filter, guru_id: e.target.value})} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Semua Guru</option>
          {gtks.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
        </select>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Guru</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mapel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rombel</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Jam</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Materi</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Belum ada jurnal</td></tr>
              )}
              {data.map(j => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 text-xs">{j.tanggal}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{j.guru_nama}</td>
                  <td className="px-4 py-3 text-gray-600">{j.mapel_nama}</td>
                  <td className="px-4 py-3 text-gray-600">{j.rombel_nama}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{j.jam_ke}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{j.materi}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      j.status === 'approved' ? 'bg-green-100 text-green-700' :
                      j.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                      j.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{j.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDetail(j)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Detail"><Eye size={16} /></button>
                      {j.status === 'submitted' && (
                        <>
                          <button onClick={() => updateStatus(j.id, 'approved')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Approve"><CheckCircle size={16} /></button>
                          <button onClick={() => updateStatus(j.id, 'rejected')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Reject"><XCircle size={16} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Detail Jurnal</h2>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-gray-100 rounded-lg"><XCircle size={20} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Tanggal:</span> <strong>{detail.tanggal}</strong></div>
                <div><span className="text-gray-500">Jam:</span> <strong>{detail.jam_ke}</strong></div>
                <div><span className="text-gray-500">Guru:</span> <strong>{detail.guru_nama}</strong></div>
                <div><span className="text-gray-500">Mapel:</span> <strong>{detail.mapel_nama}</strong></div>
                <div><span className="text-gray-500">Rombel:</span> <strong>{detail.rombel_nama}</strong></div>
                <div><span className="text-gray-500">Status:</span> <strong>{detail.status}</strong></div>
              </div>
              <div>
                <p className="text-gray-500">Materi:</p>
                <p className="bg-gray-50 p-3 rounded-lg mt-1">{detail.materi || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Kegiatan Pembelajaran:</p>
                <p className="bg-gray-50 p-3 rounded-lg mt-1">{detail.kegiatan || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Catatan:</p>
                <p className="bg-gray-50 p-3 rounded-lg mt-1">{detail.catatan || '-'}</p>
              </div>
            </div>
            {detail.status === 'submitted' && (
              <div className="flex gap-2 mt-4">
                <button onClick={() => updateStatus(detail.id, 'approved')} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Approve</button>
                <button onClick={() => updateStatus(detail.id, 'rejected')} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Reject</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
