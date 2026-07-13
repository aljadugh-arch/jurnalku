import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, AlertTriangle, X, Download, FileSpreadsheet, Pencil, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { generateJamPelajaran, jtmMenit } from '../../lib/jenjang'
import { useSettingsStore } from '../../stores/settingsStore'

interface Jadwal {
  id: string; mapel_id: string; rombel_id: string; gtk_id: string; hari: string; jam_mulai: string; jam_selesai: string; ruangan: string; template_id?: string | null
  mapel_nama?: string; gtk_nama?: string; rombel_nama?: string
}

const SEMUA_HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'] as const
const KEGIATAN_KHUSUS_DEFAULT = [
  { kode: 'UPC', nama: 'Upacara' },
  { kode: 'APG', nama: 'Apel Pagi' },
  { kode: 'PBS', nama: 'Pembiasaan' },
]

export default function JadwalPage() {
  const [jadwal, setJadwal] = useState<Jadwal[]>([])
  const [rombels, setRombels] = useState<any[]>([])
  const [mapels, setMapels] = useState<any[]>([])
  const [gtks, setGtks] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [conflicts, setConflicts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState({ nama: '', jenis: 'reguler', maks_jtm: 15, keterangan: '' })
  const settings = useSettingsStore(s => s.settings)
  const jenjang = (settings.jenjang as string) || ''
  const hariLibur: string[] = useMemo(() => {
    try { return JSON.parse((settings as any).hari_libur || '["jumat","minggu"]') } catch { return ['jumat', 'minggu'] }
  }, [settings])
  const hari = useMemo(() => SEMUA_HARI.filter(h => !hariLibur.includes(h)), [hariLibur])
  const jamPelajaran = useMemo(() => generateJamPelajaran(jenjang, 10), [jenjang])
  const [form, setForm] = useState({ mapel_id: '', rombel_id: '', gtk_id: '', hari: 'senin', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: '', template_id: '' })
  const mapelReguler = useMemo(() => mapels.filter(m => m.kelompok !== 'kegiatan'), [mapels])
  const mapelKegiatan = useMemo(() => mapels.filter(m => m.kelompok === 'kegiatan'), [mapels])

  // sinkronkan default jam form dgn slot pertama saat jenjang berubah
  useEffect(() => {
    if (jamPelajaran[0]) setForm(f => ({ ...f, jam_mulai: jamPelajaran[0].mulai, jam_selesai: jamPelajaran[0].selesai }))
  }, [jamPelajaran])

  // pastikan hari terpilih bukan hari libur
  useEffect(() => {
    if (hari.length > 0 && !hari.includes(form.hari as any)) setForm(f => ({ ...f, hari: hari[0] }))
  }, [hari])

  useEffect(() => {
    Promise.all([api.get('/rombel'), api.get('/mapel'), api.get('/gtk'), api.get('/template-jadwal')]).then(async ([r, m, g, t]) => {
      setRombels(r.data); setGtks(g.data); setTemplates(t.data)
      // Seed mapel kegiatan khusus kalau belum ada (sekali saja, idempotent by kode)
      const existingKodes = new Set(m.data.map((x: any) => x.kode))
      const missing = KEGIATAN_KHUSUS_DEFAULT.filter(k => !existingKodes.has(k.kode))
      if (missing.length > 0) {
        await Promise.all(missing.map(k => api.post('/mapel', { kode: k.kode, nama: k.nama, kelompok: 'kegiatan', jam_per_minggu: 1 }).catch(() => {})))
        const refreshed = await api.get('/mapel')
        setMapels(refreshed.data)
      } else {
        setMapels(m.data)
      }
      if (r.data.length > 0) setSelectedRombel(r.data[0].id)
    })
  }, [])

  useEffect(() => { if (selectedRombel) loadJadwal() }, [selectedRombel])
  useEffect(() => { checkConflicts(true) }, [])

  const loadJadwal = async () => {
    const res = await api.get('/jadwal', { params: { rombel_id: selectedRombel } })
    setJadwal(res.data)
  }

  const resetForm = () => setForm({ mapel_id: '', rombel_id: '', gtk_id: '', hari: hari[0] || 'senin', jam_mulai: jamPelajaran[0]?.mulai || '07:00', jam_selesai: jamPelajaran[0]?.selesai || '07:45', ruangan: '', template_id: '' })

  const openAdd = () => { setEditId(null); resetForm(); setShowForm(true) }
  const openEdit = (slot: Jadwal) => {
    setEditId(slot.id)
    setForm({ mapel_id: slot.mapel_id, rombel_id: slot.rombel_id, gtk_id: slot.gtk_id, hari: slot.hari, jam_mulai: slot.jam_mulai, jam_selesai: slot.jam_selesai, ruangan: slot.ruangan || '', template_id: slot.template_id || '' })
    setShowForm(true)
  }

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.mapel_id) { toast.error('Mapel/kegiatan wajib dipilih'); return }
    if (!form.gtk_id) { toast.error('Guru/penanggung jawab wajib dipilih'); return }
    if (!selectedRombel) { toast.error('Rombel wajib dipilih'); return }
    const payload = { ...form, rombel_id: selectedRombel, template_id: form.template_id || null }
    try {
      if (editId) {
        await api.put('/jadwal/' + editId, payload)
        toast.success('Jadwal diperbarui')
      } else {
        await api.post('/jadwal', payload)
        toast.success('Jadwal ditambahkan')
      }
      setShowForm(false); setEditId(null)
      loadJadwal()
      checkConflicts(true)
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal simpan jadwal') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus jadwal ini?')) return
    await api.delete('/jadwal/' + id)
    toast.success('Jadwal dihapus')
    loadJadwal()
    checkConflicts(true)
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.nama) { toast.error('Nama template wajib diisi'); return }
    try {
      await api.post('/template-jadwal', templateForm)
      toast.success('Template disimpan')
      const t = await api.get('/template-jadwal')
      setTemplates(t.data)
      setTemplateForm({ nama: '', jenis: 'reguler', maks_jtm: 15, keterangan: '' })
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal simpan template') }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Hapus template ini?')) return
    try {
      await api.delete('/template-jadwal/' + id)
      toast.success('Template dihapus')
      const t = await api.get('/template-jadwal')
      setTemplates(t.data)
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal hapus template') }
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

  // Palette warna kontras utk fill kode guru (siklus otomatis, tak perlu define per orang)
  const guruColor = (i: number) => {
    const palette = ['FFFDE68A', 'FFBFDBFE', 'FFBBF7D0', 'FFFBCFE8', 'FFDDD6FE', 'FFFED7AA', 'FFA7F3D0', 'FFFCA5A5', 'FF99F6E4', 'FFE9D5FF', 'FFFEF08A', 'FFC7D2FE']
    return palette[i % palette.length]
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
      const colorMap = new Map<string, string>()
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      let idx = 0
      allRows.forEach(r => {
        if (r.gtk_id && !kodeMap.has(r.gtk_id)) {
          const gtk = gtks.find(g => g.id === r.gtk_id)
          const manual = (gtk?.kode_guru || '').trim()
          kodeMap.set(r.gtk_id, manual || (idx < 26 ? letters[idx] : 'A' + letters[idx - 26]))
          colorMap.set(r.gtk_id, guruColor(idx))
          idx++
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
      const COL_WAKTU = 3 // A,B,C = HARI,JAM,WAKTU (0-indexed)
      const COL_REKAP_START = COL_WAKTU + nRombel * 2 + 1 // +1 kolom pemisah kosong
      const COL_REKAP = { no: COL_REKAP_START, kg: COL_REKAP_START + 1, nama: COL_REKAP_START + 2, hariStart: COL_REKAP_START + 3 }
      const COL_TOTAL = COL_REKAP.hariStart + nHari
      const lastCol = COL_TOTAL // 0-indexed -> total kolom = lastCol+1

      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Master Jadwal', {
        pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }, // A4
      })
      const c1 = (n: number) => n + 1 // ExcelJS kolom 1-indexed
      const merge = (r1: number, c1i: number, r2: number, c2i: number) => ws.mergeCells(r1 + 1, c1(c1i), r2 + 1, c1(c2i))
      const setRow = (rIdx: number, values: Record<number, any>) => {
        const row = ws.getRow(rIdx + 1)
        Object.entries(values).forEach(([c, v]) => { row.getCell(c1(Number(c))).value = v })
        row.commit()
      }

      let r = 0
      // Baris 1-4: judul
      setRow(r, { 0: 'JADWAL PELAJARAN' }); merge(r, 0, r, lastCol); ws.getRow(r + 1).font = { bold: true, size: 14 }; ws.getRow(r + 1).alignment = { horizontal: 'center' }; r++
      setRow(r, { [COL_REKAP.no]: 'JUMLAH JAM NGAJAR' })
      merge(r, 0, r, COL_REKAP_START - 1); merge(r, COL_REKAP.no, r, COL_TOTAL)
      ws.getRow(r + 1).getCell(c1(COL_REKAP.no)).alignment = { horizontal: 'center' }
      ws.getRow(r + 1).getCell(c1(COL_REKAP.no)).font = { bold: true }
      r++
      setRow(r, { 0: namaLembaga }); merge(r, 0, r, lastCol); ws.getRow(r + 1).font = { bold: true, size: 12 }; ws.getRow(r + 1).alignment = { horizontal: 'center' }; r++
      setRow(r, { 0: `TAHUN PELAJARAN ${taAktif ? taAktif.nama + ' ' + taAktif.semester : ''}` }); merge(r, 0, r, lastCol); ws.getRow(r + 1).alignment = { horizontal: 'center' }; r++

      // Baris 5-6: header 2-baris
      const rowHeaderIdx = r
      const h1: Record<number, any> = { 0: 'HARI', 1: 'JAM', 2: 'WAKTU' }
      rombels.forEach((rb, i) => { h1[COL_WAKTU + i * 2] = rb.nama })
      h1[COL_REKAP.no] = 'NO'; h1[COL_REKAP.kg] = 'KG'; h1[COL_REKAP.nama] = 'NAMA GURU'; h1[COL_REKAP.hariStart] = 'JUMLAH JAM'; h1[COL_TOTAL] = 'TOTAL'
      setRow(rowHeaderIdx, h1)
      const h2: Record<number, any> = {}
      rombels.forEach((_, i) => { h2[COL_WAKTU + i * 2] = 'KG'; h2[COL_WAKTU + i * 2 + 1] = 'MAPEL' })
      hariExport.forEach((h, i) => { h2[COL_REKAP.hariStart + i] = cap(h) })
      setRow(rowHeaderIdx + 1, h2)
      ;[rowHeaderIdx, rowHeaderIdx + 1].forEach(ri => { ws.getRow(ri + 1).font = { bold: true }; ws.getRow(ri + 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true } })
      ;[0, 1, 2].forEach(c => merge(rowHeaderIdx, c, rowHeaderIdx + 1, c))
      rombels.forEach((_, i) => { const c = COL_WAKTU + i * 2; merge(rowHeaderIdx, c, rowHeaderIdx, c + 1) })
      merge(rowHeaderIdx, COL_REKAP.no, rowHeaderIdx + 1, COL_REKAP.no)
      merge(rowHeaderIdx, COL_REKAP.kg, rowHeaderIdx + 1, COL_REKAP.kg)
      merge(rowHeaderIdx, COL_REKAP.nama, rowHeaderIdx + 1, COL_REKAP.nama)
      merge(rowHeaderIdx, COL_REKAP.hariStart, rowHeaderIdx, COL_REKAP.hariStart + nHari - 1)
      merge(rowHeaderIdx, COL_TOTAL, rowHeaderIdx + 1, COL_TOTAL)
      r += 2

      // Baris data: per hari, per jam — sisipkan baris "Istirahat" di antara slot jam
      const istirahatSetelah = [4, 6]
      const guruRekapRows: number[] = []
      const guruCellRefs: { r: number; c: number; gtkId: string }[] = []
      hariExport.forEach(h => {
        const hariRowStart = r
        jamPelajaran.forEach((jam, ji) => {
          if (guruRekapRows.length < guruList.length) guruRekapRows.push(r)
          const row: Record<number, any> = { 1: jam.ke, 2: `${jam.mulai}-${jam.selesai}` }
          if (ji === 0) row[0] = cap(h)
          rombels.forEach((rb, i) => {
            const slot = findSlot(rb.id, h, jam)
            const c = COL_WAKTU + i * 2
            if (slot?.gtk_id) { row[c] = kodeMap.get(slot.gtk_id); guruCellRefs.push({ r, c, gtkId: slot.gtk_id }) }
            if (slot) row[c + 1] = slot.mapel_nama || ''
          })
          setRow(r, row)
          r++
          if (istirahatSetelah.includes(jam.ke) && ji < jamPelajaran.length - 1) {
            const next = jamPelajaran[ji + 1]
            const labelIstirahat = jam.ke === 4
              ? 'Istirahat Pertama ( Sholat Dhuha )'
              : 'Istirahat Kedua ( Sholat Dzuhur Berjamaah )'
            setRow(r, { 2: `${jam.selesai}-${next.mulai}`, 3: labelIstirahat })
            merge(r, COL_WAKTU, r, COL_WAKTU + nRombel * 2 - 1)
            ws.getRow(r + 1).font = { italic: true }
            ws.getRow(r + 1).alignment = { horizontal: 'center' }
            r++
          }
        })
        const hariRowEnd = r - 1
        if (hariRowEnd > hariRowStart) merge(hariRowStart, 0, hariRowEnd, 0)
      })

      // Rekap jam mengajar guru + warnai fill sesuai kode guru
      guruList.forEach((g, gi) => {
        const perHari = hariExport.map(h => allRows.filter(rr => rr.gtk_id === g.id && rr.hari === h).length)
        const total = perHari.reduce((a, b) => a + b, 0)
        const rIdx = guruRekapRows[gi]
        if (rIdx == null) return
        const rekap: Record<number, any> = { [COL_REKAP.no]: gi + 1, [COL_REKAP.kg]: kodeMap.get(g.id), [COL_REKAP.nama]: g.nama, [COL_TOTAL]: total }
        perHari.forEach((v, i) => { rekap[COL_REKAP.hariStart + i] = v })
        setRow(rIdx, rekap)
        const fill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorMap.get(g.id) } }
        ws.getRow(rIdx + 1).getCell(c1(COL_REKAP.kg)).fill = fill
      })

      // Warnai sel matrix (kolom KG per rombel) sesuai kode guru
      guruCellRefs.forEach(({ r: rr, c, gtkId }) => {
        const fill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorMap.get(gtkId) } }
        ws.getRow(rr + 1).getCell(c1(c)).fill = fill
      })

      // Footer: blok KODE GURU (kode + nama, mengalir 3 kolom) + tanda tangan
      const dataEndRow = r
      r++ // spasi
      setRow(r, { 0: 'KODE GURU' }); merge(r, 0, r, COL_WAKTU + nRombel * 2 - 1)
      ws.getRow(r + 1).font = { bold: true }
      r++
      const kodeFooterStart = r
      const perKolom = Math.ceil(guruList.length / 3) || 1
      guruList.forEach((g, gi) => {
        const kolom = Math.floor(gi / perKolom)      // 0,1,2
        const baris = gi % perKolom
        const cKode = kolom * 3                        // 0,3,6
        const rr = kodeFooterStart + baris
        const row = ws.getRow(rr + 1)
        row.getCell(c1(cKode)).value = kodeMap.get(g.id)
        row.getCell(c1(cKode)).font = { bold: true }
        row.getCell(c1(cKode + 1)).value = g.nama
        merge(rr, cKode + 1, rr, cKode + 2)
      })
      r = kodeFooterStart + perKolom + 1 // spasi setelah blok kode

      // Tanda tangan: kiri = Mengetahui/Kepala Madrasah, kanan = Waka Kurikulum
      const kepala = (settings.kepala_sekolah as string) || (settings.nama_kepala as string) || ''
      const waka = (settings.waka_kurikulum as string) || ''
      const kota = (settings.kota as string) || (settings.kabupaten as string) || ''
      const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      const colKanan = COL_WAKTU + nRombel * 2 - 3
      setRow(r, { [colKanan]: `${kota ? kota + ', ' : ''}${tgl}` }); r++
      setRow(r, { 0: 'Mengetahui;', [colKanan]: 'Waka Kurikulum' }); r++
      setRow(r, { 0: 'Kepala Madrasah' }); r += 4 // ruang tanda tangan
      setRow(r, { 0: kepala, [colKanan]: waka })
      ws.getRow(r + 1).font = { bold: true }
      void dataEndRow

      // Lebar kolom + border tipis semua sel terisi
      ws.columns = [
        { width: 10 }, { width: 6 }, { width: 14 },
        ...rombels.flatMap(() => [{ width: 5 }, { width: 16 }]),
        { width: 2 },
        { width: 5 }, { width: 5 }, { width: 22 },
        ...hariExport.map(() => ({ width: 6 })),
        { width: 7 },
      ] as any
      for (let ri = 1; ri <= dataEndRow; ri++) {
        for (let ci = 1; ci <= lastCol + 1; ci++) {
          const cell = ws.getRow(ri).getCell(ci)
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        }
      }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Master_Jadwal_${namaLembaga || 'Lembaga'}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Master jadwal diunduh')
    } catch (e) { console.error(e); toast.error('Gagal export master jadwal') }
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
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Jadwal ${rombelNama}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th{background:#f3f4f6;padding:8px;border:1px solid #ddd;font-size:12px}@media print{body{padding:0}}</style></head><body><h2 style="text-align:center">Jadwal Pelajaran</h2><h3 style="text-align:center">${rombelNama}</h3><table><thead><tr><th>Jam</th>${hari.map(h => `<th>${h.charAt(0).toUpperCase() + h.slice(1)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><script>setTimeout(()=>window.print(),500)</script></body></html>`)
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
          <button onClick={() => setShowTemplateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
            <Settings2 size={16} /> Template Jadwal
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
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
                            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100">
                              <button onClick={() => openEdit(slot)} className="p-1 text-primary hover:bg-primary/10 rounded"><Pencil size={12} /></button>
                              <button onClick={() => handleDelete(slot.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={12} /></button>
                            </div>
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
                        <button onClick={() => openEdit(slot!)} className="shrink-0 p-1 text-primary hover:bg-primary/10 rounded"><Pencil size={14} /></button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowForm(false); setEditId(null) }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editId ? 'Edit Jadwal' : 'Tambah Jadwal'}</h2>
              <button onClick={() => { setShowForm(false); setEditId(null) }} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmitForm} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mata Pelajaran / Kegiatan</label>
                <select value={form.mapel_id} onChange={e => setForm({...form, mapel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih --</option>
                  <optgroup label="Mata Pelajaran">
                    {mapelReguler.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                  </optgroup>
                  <optgroup label="Kegiatan Khusus">
                    {mapelKegiatan.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Guru</label>
                <select value={form.gtk_id} onChange={e => setForm({...form, gtk_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih --</option>
                  {gtks.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Template Jadwal (opsional)</label>
                <select value={form.template_id} onChange={e => setForm({...form, template_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Tanpa Template --</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.nama} (maks {t.maks_jtm} JTM)</option>)}
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
                <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Template Jadwal</h2>
              <button onClick={() => setShowTemplateModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Template membatasi maks Jam Tatap Muka (JTM) per guru per minggu — beda utk hari biasa (13-15) vs ujian/ramadhan (lebih sedikit).</p>
            <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
              {templates.length === 0 && <p className="text-sm text-gray-400">Belum ada template</p>}
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{t.nama} <span className="text-xs text-gray-400">({t.jenis})</span></p>
                    <p className="text-xs text-gray-500">Maks {t.maks_jtm} JTM/minggu{t.keterangan ? ' • ' + t.keterangan : ''}</p>
                  </div>
                  <button onClick={() => handleDeleteTemplate(t.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-gray-600">Tambah Template Baru</p>
              <input value={templateForm.nama} onChange={e => setTemplateForm({...templateForm, nama: e.target.value})} placeholder="Nama, mis. Reguler Semester Ganjil" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <select value={templateForm.jenis} onChange={e => setTemplateForm({...templateForm, jenis: e.target.value})} className="px-3 py-2 border rounded-lg text-sm">
                  <option value="reguler">Reguler</option>
                  <option value="ujian">Ujian</option>
                  <option value="ramadhan">Ramadhan</option>
                </select>
                <input type="number" min={1} max={40} value={templateForm.maks_jtm} onChange={e => setTemplateForm({...templateForm, maks_jtm: Number(e.target.value)})} placeholder="Maks JTM" className="px-3 py-2 border rounded-lg text-sm" />
              </div>
              <input value={templateForm.keterangan} onChange={e => setTemplateForm({...templateForm, keterangan: e.target.value})} placeholder="Keterangan (opsional)" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <button onClick={handleSaveTemplate} className="w-full px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
