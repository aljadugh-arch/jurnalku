import { useState, useEffect } from 'react'
import { Plus, Trash2, AlertTriangle, Check, X, Download, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import * as XLSX from 'xlsx'

interface Jadwal {
  id: string; mapel_id: string; rombel_id: string; gtk_id: string; hari: string; jam_mulai: string; jam_selesai: string; ruangan: string
  mapel_nama?: string; gtk_nama?: string; rombel_nama?: string
}

const hari = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'] as const
const jamPelajaran = [
  { ke: 1, mulai: '07:00', selesai: '07:45' },
  { ke: 2, mulai: '07:45', selesai: '08:30' },
  { ke: 3, mulai: '08:30', selesai: '09:15' },
  { ke: 4, mulai: '09:15', selesai: '10:00' },
  { ke: 5, mulai: '10:15', selesai: '11:00' },
  { ke: 6, mulai: '11:00', selesai: '11:45' },
  { ke: 7, mulai: '12:30', selesai: '13:15' },
  { ke: 8, mulai: '13:15', selesai: '14:00' },
]

export default function JadwalPage() {
  const [jadwal, setJadwal] = useState<Jadwal[]>([])
  const [rombels, setRombels] = useState<any[]>([])
  const [mapels, setMapels] = useState<any[]>([])
  const [gtks, setGtks] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [conflicts, setConflicts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ mapel_id: '', rombel_id: '', gtk_id: '', hari: 'senin', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: '' })

  useEffect(() => {
    Promise.all([api.get('/rombel'), api.get('/mapel'), api.get('/gtk')]).then(([r, m, g]) => {
      setRombels(r.data); setMapels(m.data); setGtks(g.data)
      if (r.data.length > 0) setSelectedRombel(r.data[0].id)
    })
  }, [])

  useEffect(() => { if (selectedRombel) loadJadwal() }, [selectedRombel])
  useEffect(() => { checkConflicts(true) }, [])

  const loadJadwal = async () => {
    const res = await api.get('/jadwal', { params: { rombel_id: selectedRombel } })
    setJadwal(res.data)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/jadwal', { ...form, rombel_id: selectedRombel })
      toast.success('Jadwal ditambahkan')
      setShowForm(false)
      loadJadwal()
      checkConflicts(true)
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal tambah jadwal') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus jadwal ini?')) return
    await api.delete('/jadwal/' + id)
    toast.success('Jadwal dihapus')
    loadJadwal()
    checkConflicts(true)
  }

  const checkConflicts = async (silent = false) => {
    try {
      const res = await api.get('/jadwal/konflik')
      setConflicts(res.data)
      if (!silent) {
        if (res.data.length === 0) toast.success('Tidak ada konflik jadwal')
        else toast.error(`${res.data.length} konflik jadwal ditemukan`)
      }
    } catch { if (!silent) toast.error('Gagal cek konflik') }
  }

  const getSlot = (h: string, jam: typeof jamPelajaran[0]) => {
    return jadwal.find(j => j.hari === h && j.jam_mulai <= jam.mulai && j.jam_selesai >= jam.selesai)
  }

  const exportExcel = () => {
    const rombelNama = rombels.find(r => r.id === selectedRombel)?.nama || 'Jadwal'
    const wsData = [['Jadwal Pelajaran - ' + rombelNama], [], ['Jam', ...hari.map(h => h.charAt(0).toUpperCase() + h.slice(1))]]
    jamPelajaran.forEach(jam => {
      const row = [`Jam ${jam.ke} (${jam.mulai}-${jam.selesai})`]
      hari.forEach(h => {
        const slot = getSlot(h, jam)
        row.push(slot ? `${slot.mapel_nama || ''} - ${slot.gtk_nama || ''} (${slot.ruangan || ''})` : '-')
      })
      wsData.push(row)
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 22 }, ...hari.map(() => ({ wch: 30 }))]
    XLSX.utils.book_append_sheet(wb, ws, 'Jadwal')
    XLSX.writeFile(wb, `Jadwal_${rombelNama}.xlsx`)
    toast.success('Excel diunduh')
  }

  const exportPDF = () => {
    const rombelNama = rombels.find(r => r.id === selectedRombel)?.nama || 'Jadwal'
    const printWindow = window.open('', '_blank')
    if (!printWindow) { toast.error('Popup blocked'); return }
    let rows = ''
    jamPelajaran.forEach(jam => {
      rows += `<tr><td style="padding:6px;border:1px solid #ddd;font-size:11px;white-space:nowrap">Jam ${jam.ke}<br/><small>${jam.mulai}-${jam.selesai}</small></td>`
      hari.forEach(h => {
        const slot = getSlot(h, jam)
        rows += `<td style="padding:6px;border:1px solid #ddd;font-size:11px">${slot ? `<b>${slot.mapel_nama || ''}</b><br/>${slot.gtk_nama || ''}<br/><small>${slot.ruangan || ''}</small>` : '-'}</td>`
      })
      rows += '</tr>'
    })
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Jadwal ${rombelNama}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th{background:#f3f4f6;padding:8px;border:1px solid #ddd;font-size:12px}@media print{body{padding:0}}</style></head><body><h2 style="text-align:center">Jadwal Pelajaran</h2><h3 style="text-align:center">${rombelNama}</h3><table><thead><tr><th>Jam</th>${hari.map(h => `<th>${h.charAt(0).toUpperCase() + h.slice(1)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><script>setTimeout(()=>window.print(),500)<\/script></body></html>`)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Jadwal Pelajaran</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola jadwal dengan sistem anti tabrakan</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
            <Download size={16} /> PDF
          </button>
          <button onClick={() => checkConflicts(false)} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600">
            <AlertTriangle size={16} /> Cek Tabrakan
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Jadwal
          </button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-red-800 flex items-center gap-2 mb-2"><AlertTriangle size={16} /> {conflicts.length} Konflik Jadwal Terdeteksi</h3>
          <ul className="text-sm text-red-700 space-y-1">
            {conflicts.map((c, i) => <li key={i}>• <b>{c.jenis}</b> — {c.hari} {c.jam}: {c.a} vs {c.b}</li>)}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex gap-3 items-center">
        <label className="text-sm font-medium text-gray-700">Rombel:</label>
        <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop: matrix table */}
        <div className="hidden md:block overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jam</th>
                {hari.map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 capitalize">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jamPelajaran.map(jam => (
                <tr key={jam.ke} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    <div className="text-xs font-medium">Jam {jam.ke}</div>
                    <div className="text-[10px] text-gray-400">{jam.mulai}-{jam.selesai}</div>
                  </td>
                  {hari.map(h => {
                    const slot = getSlot(h, jam)
                    return (
                      <td key={h} className="px-4 py-3">
                        {slot ? (
                          <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 group relative">
                            <p className="text-xs font-medium text-primary">{slot.mapel_nama || mapels.find(m => m.id === slot.mapel_id)?.nama}</p>
                            <p className="text-[10px] text-gray-500">{slot.gtk_nama || gtks.find(g => g.id === slot.gtk_id)?.nama}</p>
                            <p className="text-[10px] text-gray-400">{slot.ruangan}</p>
                            <button onClick={() => handleDelete(slot.id)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={12} /></button>
                          </div>
                        ) : (
                          <div className="text-center text-gray-300 text-xs">-</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: grouped by day */}
        <div className="md:hidden divide-y divide-gray-100">
          {hari.map(h => {
            const slotsHari = jamPelajaran.map(jam => ({ jam, slot: getSlot(h, jam) })).filter(x => x.slot)
            return (
              <div key={h} className="p-3">
                <p className="text-sm font-semibold text-gray-800 capitalize mb-2">{h}</p>
                {slotsHari.length === 0 ? (
                  <p className="text-xs text-gray-300">Tidak ada jadwal</p>
                ) : (
                  <div className="space-y-2">
                    {slotsHari.map(({ jam, slot }) => (
                      <div key={jam.ke} className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-lg p-2.5">
                        <div className="shrink-0 text-center">
                          <p className="text-xs font-bold text-primary">Jam {jam.ke}</p>
                          <p className="text-[10px] text-gray-400">{jam.mulai}-{jam.selesai}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 break-words">{slot!.mapel_nama || mapels.find(m => m.id === slot!.mapel_id)?.nama}</p>
                          <p className="text-xs text-gray-500 break-words">{slot!.gtk_nama || gtks.find(g => g.id === slot!.gtk_id)?.nama}{slot!.ruangan ? ' • ' + slot!.ruangan : ''}</p>
                        </div>
                        <button onClick={() => handleDelete(slot!.id)} className="shrink-0 p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Tambah Jadwal</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mata Pelajaran</label>
                <select value={form.mapel_id} onChange={e => setForm({...form, mapel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih --</option>
                  {mapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Guru</label>
                <select value={form.gtk_id} onChange={e => setForm({...form, gtk_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih --</option>
                  {gtks.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hari</label>
                  <select value={form.hari} onChange={e => setForm({...form, hari: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {hari.map(h => <option key={h} value={h} className="capitalize">{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ruangan</label>
                  <input value={form.ruangan} onChange={e => setForm({...form, ruangan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="R.101" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jam Mulai</label>
                  <select value={form.jam_mulai} onChange={e => setForm({...form, jam_mulai: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {jamPelajaran.map(j => <option key={j.mulai} value={j.mulai}>{j.mulai}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jam Selesai</label>
                  <select value={form.jam_selesai} onChange={e => setForm({...form, jam_selesai: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {jamPelajaran.map(j => <option key={j.selesai} value={j.selesai}>{j.selesai}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
