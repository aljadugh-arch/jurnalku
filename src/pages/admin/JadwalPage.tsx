import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, AlertTriangle, Check, X, Download, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import * as XLSX from 'xlsx'
import { generateJamPelajaran, jtmMenit } from '../../lib/jenjang'
import { useSettingsStore } from '../../stores/settingsStore'

interface Jadwal {
  id: string; mapel_id: string; rombel_id: string; gtk_id: string; hari: string; jam_mulai: string; jam_selesai: string; ruangan: string
  mapel_nama?: string; gtk_nama?: string; rombel_nama?: string
}

const SEMUA_HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'] as const

export default function JadwalPage() {
  const [jadwal, setJadwal] = useState<Jadwal[]>([])
  const [rombels, setRombels] = useState<any[]>([])
  const [mapels, setMapels] = useState<any[]>([])
  const [gtks, setGtks] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [conflicts, setConflicts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const settings = useSettingsStore(s => s.settings)
  const jenjang = (settings.jenjang as string) || ''
  const hariLibur: string[] = useMemo(() => {
    try { return JSON.parse((settings as any).hari_libur || '["jumat","minggu"]') } catch { return ['jumat', 'minggu'] }
  }, [settings])
  const hari = useMemo(() => SEMUA_HARI.filter(h => !hariLibur.includes(h)), [hariLibur])
  const jamPelajaran = useMemo(() => generateJamPelajaran(jenjang, 10), [jenjang])
  const [form, setForm] = useState({ mapel_id: '', rombel_id: '', gtk_id: '', hari: 'senin', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: '' })

  // sinkronkan default jam form dgn slot pertama saat jenjang berubah
  useEffect(() => {
    if (jamPelajaran[0]) setForm(f => ({ ...f, jam_mulai: jamPelajaran[0].mulai, jam_selesai: jamPelajaran[0].selesai }))
  }, [jamPelajaran])

  // pastikan hari terpilih bukan hari libur
  useEffect(() => {
    if (hari.length > 0 && !hari.includes(form.hari as any)) setForm(f => ({ ...f, hari: hari[0] }))
  }, [hari])

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

  const exportMasterExcel = async () => {
    try {
      const [jadwalAll, taRes] = await Promise.all([api.get('/jadwal'), api.get('/tahun-ajaran')])
      const allRows: Jadwal[] = jadwalAll.data
      const taAktif = taRes.data.find((t: any) => t.aktif)
      const namaLembaga = (settings.nama_lembaga as string) || ''

      // Kode Guru: pakai kode manual dari data GTK (field kode_guru).
      // Guru tanpa kode manual di-fallback ke huruf otomatis A,B,C... (urutan kemunculan pertama di jadwal)
      const kodeMap = new Map<string, string>()
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      let idx = 0
      allRows.forEach(r => {
        if (r.gtk_id && !kodeMap.has(r.gtk_id)) {
          const gtk = gtks.find(g => g.id === r.gtk_id)
          const manual = (gtk?.kode_guru || '').trim()
          kodeMap.set(r.gtk_id, manual || (idx < 26 ? letters[idx] : 'A' + letters[idx - 26]))
          if (!manual) idx++
        }
      })
      const guruList = gtks.filter(g => kodeMap.has(g.id))

      // Export mengikuti pola referensi: Sabtu, Ahad, Senin, Selasa, Rabo, Kamis (Jumat libur disaring).
      const exportHariOrder = ['sabtu', 'minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat']
      const hariExport = exportHariOrder.filter(h => hari.includes(h as any))
      const cap = (h: string) => ({ minggu: 'AHAD', rabu: 'RABO' } as Record<string, string>)[h] || h.toUpperCase()
      const findSlot = (rombelId: string, h: string, jam: typeof jamPelajaran[0]) =>
        allRows.find(r => r.rombel_id === rombelId && r.hari === h && r.jam_mulai <= jam.mulai && r.jam_selesai >= jam.selesai)

      const nRombel = rombels.length
      const nHari = hariExport.length
      const COL_WAKTU = 3 // A,B,C = HARI,JAM,WAKTU
      const COL_REKAP_START = COL_WAKTU + nRombel * 2 + 1 // +1 kolom pemisah kosong
      const COL_REKAP = { no: COL_REKAP_START, kg: COL_REKAP_START + 1, nama: COL_REKAP_START + 2, hariStart: COL_REKAP_START + 3 }
      const COL_TOTAL = COL_REKAP.hariStart + nHari
      const lastCol = COL_TOTAL

      const merges: any[] = []
      const wsData: any[][] = []

      // Baris 1-4: judul (merge full width)
      wsData.push(['JADWAL PELAJARAN']); merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } })
      wsData.push([]); merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: COL_REKAP_START - 1 } })
      const r1 = wsData[1]; r1[COL_REKAP.no] = 'JUMLAH JAM NGAJAR'
      merges.push({ s: { r: 1, c: COL_REKAP.no }, e: { r: 1, c: COL_TOTAL } })
      wsData.push([namaLembaga]); merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } })
      wsData.push([`TAHUN PELAJARAN ${taAktif ? taAktif.nama + ' ' + taAktif.semester : ''}`]); merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } })

      // Baris 5-6: header 2-baris
      const rowHeaderIdx = wsData.length // 4 (0-indexed)
      const h1: any[] = ['HARI', 'JAM', 'WAKTU']
      rombels.forEach(r => { h1.push(r.nama, '') })
      h1.push('') // kolom pemisah
      h1.push('NO', 'KG', 'NAMA GURU', 'JUMLAH JAM', ...hariExport.map(() => ''), 'TOTAL')
      const h2: any[] = ['', '', '']
      rombels.forEach(() => h2.push('KG', 'MAPEL'))
      h2.push('')
      h2.push('', '', '', ...hariExport.map(cap), '')
      wsData.push(h1, h2)
      // merge vertikal HARI/JAM/WAKTU
      ;[0, 1, 2].forEach(c => merges.push({ s: { r: rowHeaderIdx, c }, e: { r: rowHeaderIdx + 1, c } }))
      // merge nama rombel horizontal (2 kolom: KG+MAPEL)
      rombels.forEach((_, i) => {
        const c = COL_WAKTU + i * 2
        merges.push({ s: { r: rowHeaderIdx, c }, e: { r: rowHeaderIdx, c: c + 1 } })
      })
      // merge NO/KG/NAMA GURU vertikal, JUMLAH JAM horizontal, TOTAL vertikal
      merges.push({ s: { r: rowHeaderIdx, c: COL_REKAP.no }, e: { r: rowHeaderIdx + 1, c: COL_REKAP.no } })
      merges.push({ s: { r: rowHeaderIdx, c: COL_REKAP.kg }, e: { r: rowHeaderIdx + 1, c: COL_REKAP.kg } })
      merges.push({ s: { r: rowHeaderIdx, c: COL_REKAP.nama }, e: { r: rowHeaderIdx + 1, c: COL_REKAP.nama } })
      merges.push({ s: { r: rowHeaderIdx, c: COL_REKAP.hariStart }, e: { r: rowHeaderIdx, c: COL_REKAP.hariStart + nHari - 1 } })
      merges.push({ s: { r: rowHeaderIdx, c: COL_TOTAL }, e: { r: rowHeaderIdx + 1, c: COL_TOTAL } })

      // Baris data: per hari, per jam — sisipkan baris "Istirahat" di antara slot jam
      const istirahatSetelah = [4, 6]
      const guruRekapRows: number[] = [] // baris (0-indexed) tempat rekap guru mulai ditulis
      hariExport.forEach(h => {
        const hariRowStart = wsData.length
        jamPelajaran.forEach((jam, ji) => {
          const rIdx = wsData.length
          if (guruRekapRows.length < guruList.length) guruRekapRows.push(rIdx)
          const row: any[] = [ji === 0 ? cap(h) : '', jam.ke, `${jam.mulai}-${jam.selesai}`]
          rombels.forEach(r => {
            const slot = findSlot(r.id, h, jam)
            row.push(slot?.gtk_id ? kodeMap.get(slot.gtk_id) : '', slot ? (slot.mapel_nama || '') : '')
          })
          wsData.push(row)
          if (istirahatSetelah.includes(jam.ke) && ji < jamPelajaran.length - 1) {
            const next = jamPelajaran[ji + 1]
            const istRow: any[] = ['', '', `${jam.selesai}-${next.mulai}`, 'Istirahat']
            wsData.push(istRow)
            merges.push({ s: { r: wsData.length - 1, c: COL_WAKTU }, e: { r: wsData.length - 1, c: COL_WAKTU + nRombel * 2 - 1 } })
          }
        })
        const hariRowEnd = wsData.length - 1
        if (hariRowEnd > hariRowStart) merges.push({ s: { r: hariRowStart, c: 0 }, e: { r: hariRowEnd, c: 0 } })
      })

      // Rekap jam mengajar guru ditempel di kolom kanan mulai baris data pertama
      guruList.forEach((g, gi) => {
        const perHari = hariExport.map(h => allRows.filter(r => r.gtk_id === g.id && r.hari === h).length)
        const total = perHari.reduce((a, b) => a + b, 0)
        const rIdx = guruRekapRows[gi]
        if (rIdx == null) return
        const row = wsData[rIdx]
        const rekap = [gi + 1, kodeMap.get(g.id), g.nama, ...perHari, total]
        rekap.forEach((v, i) => { row[COL_REKAP.no + i] = v })
      })

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!merges'] = merges
      ws['!cols'] = [{ wch: 10 }, { wch: 6 }, { wch: 14 }, ...rombels.flatMap(() => [{ wch: 5 }, { wch: 16 }]), { wch: 2 }, { wch: 5 }, { wch: 5 }, { wch: 22 }, ...hariExport.map(() => ({ wch: 6 })), { wch: 7 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Master Jadwal')
      XLSX.writeFile(wb, `Master_Jadwal_${namaLembaga || 'Lembaga'}.xlsx`)
      toast.success('Master jadwal diunduh')
    } catch { toast.error('Gagal export master jadwal') }
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
          <button onClick={exportMasterExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm hover:bg-emerald-800">
            <FileSpreadsheet size={16} /> Master Excel (Semua Rombel)
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
                    {hari.map(h => <option key={h} value={h} className="capitalize">{h.charAt(0).toUpperCase()+h.slice(1)}</option>)}
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
                  <input type="time" value={form.jam_mulai} onChange={e => setForm({...form, jam_mulai: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jam Selesai</label>
                  <input type="time" value={form.jam_selesai} onChange={e => setForm({...form, jam_selesai: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-1">
                Referensi 1 JTM {jenjang || 'default'}: <strong>{jtmMenit(jenjang)} menit</strong> (KMA 736/2026). Jam bebas diisi manual.
              </p>
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
