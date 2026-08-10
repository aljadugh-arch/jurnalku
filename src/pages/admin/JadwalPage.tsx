import { useState, useEffect, useMemo } from 'react'
import { escapeHtml } from '../../utils/escapeHtml'
import { Plus, Trash2, AlertTriangle, X, Download, FileSpreadsheet, Pencil, Settings2, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { generateJamPelajaran, jtmMenit } from '../../lib/jenjang'
import { pilihGuru, pilihMapel } from '../../lib/jadwalSelection'
import BulkDeleteButton from '../../components/BulkDeleteButton'
import { useSettingsStore } from '../../stores/settingsStore'

interface Jadwal {
  id: string; mapel_id: string; rombel_id: string; gtk_id: string; hari: string; jam_mulai: string; jam_selesai: string; ruangan: string; template_id?: string | null; jenis_kegiatan?: string; nama_kegiatan?: string
  mapel_nama?: string; gtk_nama?: string; rombel_nama?: string; guru_valid: boolean | number
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
  const [pengajar, setPengajar] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateRules, setGenerateRules] = useState({ maks: 2, aturan: "Pujianto: senin, selasa, rabu, kamis, jumat, sabtu\nMuhammad Shofiqin: senin, selasa, rabu, kamis, jumat, sabtu\nM.'Ainur Rofiq: senin, selasa, rabu, kamis, jumat, sabtu\nDarsani: sabtu, senin, rabu" })
  const [jamPulang,setJamPulang]=useState<Record<string,string>>({})
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [guruFilter, setGuruFilter] = useState<'all' | 'valid' | 'invalid'>('invalid')
  const [repairMapel, setRepairMapel] = useState('')
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([])
  const [bulkGtkId, setBulkGtkId] = useState('')
  const [conflicts, setConflicts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState({ nama: '', jenis: 'reguler', maks_jtm: 15, keterangan: '' })
  const settings = useSettingsStore(s => s.settings)
  const jenjang = (settings.jenjang as string) || ''
  const isGuruKelasJenjang = ['mi', 'sd'].includes(jenjang.toLowerCase())
  const hariLibur: string[] = useMemo(() => {
    try { return JSON.parse((settings as any).hari_libur || '["jumat"]') } catch { return ['jumat'] }
  }, [settings])
  const hari = useMemo(() => SEMUA_HARI.filter(h => !hariLibur.includes(h)), [hariLibur])
  const jamPelajaran = useMemo(() => generateJamPelajaran(jenjang, 10), [jenjang])
  const [form, setForm] = useState({ mapel_id: '', rombel_id: '', gtk_id: '', hari: 'senin', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: '', template_id: '', jenis_kegiatan: 'mapel', nama_kegiatan: '' })
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
    Promise.all([api.get('/rombel'), api.get('/mapel'), api.get('/gtk'), api.get('/template-jadwal'), api.get('/pengajar'), api.get('/rombel-jam-pulang')]).then(async ([r, m, g, t, p, jp]) => {
      setRombels(r.data); setGtks(g.data); setTemplates(t.data); setPengajar(p.data)
      setJamPulang(Object.fromEntries(jp.data.map((x:any)=>[`${x.rombel_id}:${x.hari}`,x.jam_pulang])))
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
    setSelectedSchedules([])
  }

  const repairRows = useMemo(() => jadwal.filter(j =>
    j.jenis_kegiatan === 'mapel' && Boolean(j.mapel_id) &&
    (!repairMapel || j.mapel_id === repairMapel) &&
    (guruFilter === 'all' || (guruFilter === 'valid') === Boolean(j.guru_valid))
  ), [jadwal, repairMapel, guruFilter])
  const invalidCount = jadwal.filter(j => j.jenis_kegiatan === 'mapel' && j.mapel_id && !j.guru_valid).length
  const bulkAssign = async () => {
    const guru = gtks.find(g => g.id === bulkGtkId)
    if (!guru || !selectedSchedules.length) return
    const scope = [...new Set(repairRows.filter(j => selectedSchedules.includes(j.id)).map(j => `${j.mapel_nama || '-'} / ${j.rombel_nama || rombels.find(r => r.id === j.rombel_id)?.nama || '-'}`))].join(', ')
    if (!confirm(`Tetapkan ${guru.nama} ke ${selectedSchedules.length} jadwal?\nCakupan mapel/rombel: ${scope}`)) return
    try {
      const res = await api.patch('/jadwal/bulk-guru', { schedule_ids: selectedSchedules, gtk_id: bulkGtkId })
      toast.success(`${res.data.updated} jadwal diperbarui`); await loadJadwal()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menetapkan guru') }
  }

  // Build time slots: merge actual jadwal ranges + generated, remove overlaps
  const allTimeSlots = useMemo(() => {
    const durasi = jtmMenit(jenjang)
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const toTime = (n: number) => `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`

    // Actual slots matching grid tetap Jam 1, Jam 2, dst; hanya waktu di luar grid dianggap custom.
    const actual = Array.from(new Set(jadwal.map(j => `${j.jam_mulai}|${j.jam_selesai}`))).map(k => {
      const [mulai, selesai] = k.split('|')
      const standardIndex = jamPelajaran.findIndex(j => j.mulai === mulai && j.selesai === selesai)
      return { mulai, selesai, isCustom: standardIndex < 0, standardKe: standardIndex + 1 }
    })

    const generated = jamPelajaran.map(j => ({ mulai: j.mulai, selesai: j.selesai, isCustom: false, standardKe: j.ke }))

    // Merge: keep generated only if it does NOT overlap with any actual slot
    const merged = [...actual]
    for (const g of generated) {
      const gMulai = toMin(g.mulai); const gSelesai = toMin(g.selesai)
      const overlaps = actual.some(a => toMin(a.mulai) < gSelesai && toMin(a.selesai) > gMulai)
      if (!overlaps) merged.push(g)
    }

    // Sort by mulai, re-number ke
    const sorted = merged.sort((a, b) => a.mulai.localeCompare(b.mulai))
    return sorted.map((s, i) => ({ ke: s.standardKe || i + 1, ...s }))
  }, [jamPelajaran, jadwal, jenjang])

  const resetForm = () => setForm({ mapel_id: '', rombel_id: '', gtk_id: '', hari: hari[0] || 'senin', jam_mulai: jamPelajaran[0]?.mulai || '07:00', jam_selesai: jamPelajaran[0]?.selesai || '07:45', ruangan: '', template_id: '', jenis_kegiatan: 'mapel', nama_kegiatan: '' })

  const openAdd = () => { setEditId(null); resetForm(); setShowForm(true) }
  const openEdit = (slot: Jadwal) => {
    setEditId(slot.id)
    setForm({ mapel_id: slot.mapel_id, rombel_id: slot.rombel_id, gtk_id: slot.gtk_id, hari: slot.hari, jam_mulai: slot.jam_mulai, jam_selesai: slot.jam_selesai, ruangan: slot.ruangan || '', template_id: slot.template_id || '', jenis_kegiatan: slot.jenis_kegiatan || 'mapel', nama_kegiatan: slot.nama_kegiatan || '' })
    setShowForm(true)
  }

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.jenis_kegiatan === 'mapel' && !form.mapel_id) { toast.error('Mapel wajib dipilih'); return }
    if (form.jenis_kegiatan === 'mapel' && !form.gtk_id) { toast.error('Guru wajib dipilih untuk mapel'); return }
    if (form.jenis_kegiatan === 'istirahat' && !form.nama_kegiatan.trim()) { toast.error('Nama istirahat wajib diisi'); return }
    if (form.jenis_kegiatan === 'kegiatan' && !form.nama_kegiatan.trim()) { toast.error('Nama kegiatan wajib diisi'); return }
    if (!selectedRombel && form.jenis_kegiatan === 'mapel') { toast.error('Rombel wajib dipilih'); return }
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

  // Mapel yg diajar guru terpilih di rombel aktif (dari relasi Pengajar)
  const mapelGuruDiRombel = useMemo(() => {
    if (!form.gtk_id || !selectedRombel) return []
    return pengajar.filter(p => p.gtk_id === form.gtk_id && p.rombel_id === selectedRombel)
  }, [pengajar, form.gtk_id, selectedRombel])
  const guruMapelDiRombel = useMemo(() => {
    if (!form.mapel_id || !selectedRombel) return []
    const ids = new Set(pengajar.filter(p => p.mapel_id === form.mapel_id && p.rombel_id === selectedRombel).map(p => p.gtk_id))
    const guruKelasId = isGuruKelasJenjang ? rombels.find(r => r.id === selectedRombel)?.wali_kelas_id : ''
    if (guruKelasId) ids.add(guruKelasId)
    return gtks.filter(g => ids.has(g.id))
  }, [pengajar, gtks, rombels, form.mapel_id, selectedRombel, isGuruKelasJenjang])

  // Saat pilih guru: auto-isi mapel bila guru punya tepat 1 mapel di rombel ini
  const onGuruChange = (gtkId: string) => {
    const cocok = pengajar.filter(p => p.gtk_id === gtkId && p.rombel_id === selectedRombel)
    const guruKelas = isGuruKelasJenjang && rombels.find(r => r.id === selectedRombel)?.wali_kelas_id === gtkId
    setForm(f => ({ ...f, gtk_id: gtkId, mapel_id: pilihGuru(pengajar, selectedRombel, gtkId, f.mapel_id, guruKelas) }))
    if (cocok.length === 0 && gtkId && !guruKelas) toast('Guru ini belum terdaftar mengajar di rombel terpilih (menu Pengajar).', { icon: 'ℹ️' })
  }

  const onMapelChange = (mapelId: string) => {
    const cocok = pengajar.filter(p => p.mapel_id === mapelId && p.rombel_id === selectedRombel)
    const guruKelasId = isGuruKelasJenjang ? rombels.find(r => r.id === selectedRombel)?.wali_kelas_id || '' : ''
    setForm(f => ({ ...f, mapel_id: mapelId, gtk_id: pilihMapel(pengajar, selectedRombel, mapelId, f.gtk_id, guruKelasId) }))
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const slots = allTimeSlots.filter(s => !s.isCustom).map(j => ({ ke: j.ke, mulai: j.mulai, selesai: j.selesai }))
      const res = await api.post('/jadwal/generate', { hari, slots, overwrite: false, template_id: form.template_id || null, maks_jam_mapel_per_hari: generateRules.maks, aturan_hari_guru: generateRules.aturan, mode_guru_kelas: isGuruKelasJenjang })
      const kurang = res.data.kurang || []
      toast.success(`${res.data.created} slot jadwal dibuat otomatis`)
      if (kurang.length) {
        const nama = kurang.map((k: any) => gtks.find(g => g.id === k.gtk_id)?.nama || k.gtk_id).slice(0, 5).join(', ')
        toast(`${kurang.length} guru belum penuh target jam: ${nama}${kurang.length > 5 ? '...' : ''}`, { icon: '⚠️', duration: 6000 })
      }
      loadJadwal(); checkConflicts(true); setShowGenerate(false)
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal generate jadwal') }
    finally { setGenerating(false) }
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

  const getSlot = (h: string, jam: { mulai: string; selesai: string }) => {
    return jadwal.find(j => j.hari === h && j.jam_mulai === jam.mulai && j.jam_selesai === jam.selesai)
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
            if (slot) row[c + 1] = slot.jenis_kegiatan === 'mapel' ? (slot.mapel_nama || '') : (slot.nama_kegiatan || '')
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
        row.push(slot ? `${slot.jenis_kegiatan === 'mapel' ? (slot.mapel_nama || '') : (slot.nama_kegiatan || '')} - ${slot.gtk_nama || ''} (${slot.ruangan || ''})` : '-')
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
        rows += `<td style="padding:6px;border:1px solid #ddd;font-size:11px">${slot ? `<b>${slot.jenis_kegiatan === 'mapel' ? (slot.mapel_nama || '') : (slot.nama_kegiatan || '')}</b><br/>${slot.gtk_nama || ''}<br/><small>${slot.ruangan || ''}</small>` : '-'}</td>`
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
          <button onClick={() => setShowGenerate(true)} disabled={generating} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-60">
            <Wand2 size={16} /> {generating ? 'Menyusun...' : 'Generate Otomatis'}
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Jadwal
          </button>
          <BulkDeleteButton kategori="jadwal" label="Jadwal" onDone={loadJadwal} />
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

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {([['all', 'Semua'], ['valid', 'Guru valid'], ['invalid', 'Guru belum valid']] as const).map(([value, label]) => <button key={value} onClick={() => { setGuruFilter(value); setSelectedSchedules([]) }} className={`px-3 py-1.5 rounded-lg text-xs border ${guruFilter === value ? 'bg-primary text-white' : 'bg-white'}`}>{label} <span className="ml-1">{value === 'all' ? jadwal.length : value === 'valid' ? jadwal.length - invalidCount : invalidCount}</span></button>)}
          <select value={repairMapel} onChange={e => { setRepairMapel(e.target.value); setSelectedSchedules([]) }} className="px-3 py-1.5 border rounded-lg text-xs"><option value="">Semua mapel</option>{mapelReguler.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}</select>
          <button onClick={() => setSelectedSchedules(repairRows.filter(j => !j.guru_valid).map(j => j.id))} className="px-3 py-1.5 border rounded-lg text-xs">Pilih hasil filter invalid</button>
        </div>
        {repairRows.map(j => <label key={j.id} className={`flex gap-3 items-center p-2 rounded-lg border text-sm ${j.guru_valid ? 'border-gray-100' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><input type="checkbox" checked={selectedSchedules.includes(j.id)} onChange={e => setSelectedSchedules(s => e.target.checked ? [...s, j.id] : s.filter(id => id !== j.id))} /><span className="flex-1">{j.mapel_nama || '-'} · {j.rombel_nama || rombels.find(r => r.id === j.rombel_id)?.nama} · {j.hari} {j.jam_mulai}</span><b>{j.guru_valid ? j.gtk_nama : 'Guru belum valid'}</b></label>)}
        <div className="flex flex-wrap gap-2"><select value={bulkGtkId} onChange={e => setBulkGtkId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="">Pilih GTK valid</option>{gtks.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}</select><button disabled={!bulkGtkId || !selectedSchedules.length} onClick={bulkAssign} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-40">Tetapkan guru ({selectedSchedules.length})</button></div>
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
              {allTimeSlots.map(jam => (
                <tr key={`${jam.mulai}-${jam.selesai}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    <div className="text-xs font-medium">{jam.isCustom ? '⏰' : `Jam ${jam.ke}`}</div>
                    <div className="text-[10px] text-gray-400">{jam.mulai}-{jam.selesai}</div>
                  </td>
                  {hari.map(h => {
                    const slot = getSlot(h, jam)
                    return (
                      <td key={h} className="px-4 py-3">
                        {slot ? (
                          <div className={`rounded-lg p-2 group relative border ${slot.jenis_kegiatan !== 'mapel' || slot.guru_valid ? 'bg-primary/5 border-primary/20' : 'bg-red-50 border-red-300'}`}>
                            <p className="text-xs font-medium text-primary">{slot.jenis_kegiatan === 'mapel' ? (slot.mapel_nama || mapels.find(m => m.id === slot.mapel_id)?.nama) : slot.nama_kegiatan}</p>
                            {slot.jenis_kegiatan === 'mapel' && <p className={`text-[10px] ${slot.guru_valid ? 'text-gray-500' : 'font-bold text-red-700'}`}>{slot.guru_valid ? slot.gtk_nama : 'Guru belum valid'}</p>}
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
            const slotsHari = allTimeSlots.map(jam => ({ jam, slot: getSlot(h, jam) })).filter(x => x.slot)
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
                          <p className={`text-xs break-words ${slot!.guru_valid ? 'text-gray-500' : 'font-bold text-red-700'}`}>{slot!.guru_valid ? slot!.gtk_nama : 'Guru belum valid'}{slot!.ruangan ? ' • ' + slot!.ruangan : ''}</p>
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
                <label className="block text-xs font-medium text-gray-600 mb-2">Jenis</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="jenis" value="mapel" checked={form.jenis_kegiatan === 'mapel'} onChange={e => setForm({...form, jenis_kegiatan: e.target.value, nama_kegiatan: '', mapel_id: ''})} className="w-4 h-4" />
                    <span className="text-sm">Mata Pelajaran</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="jenis" value="istirahat" checked={form.jenis_kegiatan === 'istirahat'} onChange={e => setForm({...form, jenis_kegiatan: e.target.value, mapel_id: '', nama_kegiatan: 'Istirahat Sholat Dhuha'})} className="w-4 h-4" />
                    <span className="text-sm">Istirahat</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="jenis" value="kegiatan" checked={form.jenis_kegiatan === 'kegiatan'} onChange={e => setForm({...form, jenis_kegiatan: e.target.value, mapel_id: '', nama_kegiatan: 'Apel Pagi'})} className="w-4 h-4" />
                    <span className="text-sm">Kegiatan</span>
                  </label>
                </div>
              </div>
              {form.jenis_kegiatan === 'mapel' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mata Pelajaran</label>
                  <select value={form.mapel_id} onChange={e => onMapelChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- Pilih --</option>
                    {mapelGuruDiRombel.length > 0 && (
                      <optgroup label="Mapel Guru Ini (disarankan)">
                        {mapelGuruDiRombel.map(p => <option key={'pg-' + p.id} value={p.mapel_id}>{p.mapel_nama}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Mata Pelajaran">
                      {mapelReguler.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                    </optgroup>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Kegiatan</label>
                  <input type="text" value={form.nama_kegiatan} onChange={e => setForm({...form, nama_kegiatan: e.target.value})} placeholder={form.jenis_kegiatan === 'istirahat' ? 'Istirahat Sholat Dhuha / Dhuhur' : 'Apel Pagi / Upacara / Pembiasaan'} className="w-full px-3 py-2 border rounded-lg text-sm" maxLength={100} />
                  <p className="text-xs text-gray-400 mt-1">{form.jenis_kegiatan === 'istirahat' ? 'Contoh: Istirahat Sholat Dhuha, Istirahat Sholat Dhuhur' : 'Contoh: Apel Pagi, Upacara Bendera, Pembiasaan'}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{form.jenis_kegiatan === 'mapel' ? 'Guru (wajib)' : 'Guru / Penanggung Jawab (opsional)'}</label>
                <select value={form.gtk_id} onChange={e => onGuruChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih --</option>
                  {guruMapelDiRombel.length > 0 && <optgroup label="Pengajar Mapel Ini (disarankan)">{guruMapelDiRombel.map(g => <option key={'gm-'+g.id} value={g.id}>{g.nama}{g.kode_guru ? ` (${g.kode_guru})` : ''}</option>)}</optgroup>}
                  <optgroup label="Semua Guru">{gtks.filter(g => !guruMapelDiRombel.some(x => x.id === g.id)).map(g => <option key={g.id} value={g.id}>{g.nama}{g.kode_guru ? ` (${g.kode_guru})` : ''}</option>)}</optgroup>
                </select>
                {mapelGuruDiRombel.length > 0 && (
                  <p className="text-[11px] text-emerald-600 mt-1">Mengajar di kelas ini: {mapelGuruDiRombel.map(p => p.mapel_nama).join(', ')}</p>
                )}
                {isGuruKelasJenjang && rombels.find(r => r.id === selectedRombel)?.wali_kelas_id === form.gtk_id && (
                  <p className="text-[11px] text-blue-600 mt-1">Guru Kelas rombel ini — dapat mengajar semua mapel umum tanpa harus cocok bidang studi.</p>
                )}
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

      {showGenerate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowGenerate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Aturan Generate Otomatis</h2>
            <label className="block text-xs font-medium text-gray-600 mb-1">Maks jam mapel per kelas per hari</label>
            <input type="number" min={1} max={10} value={generateRules.maks} onChange={e => setGenerateRules({...generateRules, maks: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm mb-3" />
            <label className="block text-xs font-medium text-gray-600 mb-1">Hari guru tersedia</label>
            <textarea rows={6} value={generateRules.aturan} onChange={e => setGenerateRules({...generateRules, aturan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <p className="text-xs text-gray-400 mt-1">Format: Nama Guru: senin, selasa. Guru tanpa aturan bebas dijadwalkan.</p>
            {isGuruKelasJenjang&&<div className="mt-3"><p className="text-sm font-medium mb-2">Jam pulang MI per rombel/hari</p><div className="max-h-52 overflow-auto space-y-2">{rombels.map(r=><div key={r.id}><b className="text-xs">{r.nama}</b><div className="grid grid-cols-3 gap-1">{hari.map(h=><label key={h} className="text-[10px] capitalize">{h}<input type="time" className="border rounded p-1 w-full text-xs" value={jamPulang[`${r.id}:${h}`]||''} onChange={e=>setJamPulang({...jamPulang,[`${r.id}:${h}`]:e.target.value})}/></label>)}</div></div>)}</div><button onClick={async()=>{try{await Promise.all(Object.entries(jamPulang).filter(([,v])=>v).map(([k,v])=>{const [rid,h]=k.split(':');return api.put(`/rombel-jam-pulang/${rid}/${h}`,{jam_pulang:v})}));toast.success('Jam pulang tersimpan')}catch{toast.error('Gagal simpan jam pulang')}}} className="mt-2 px-3 py-2 border rounded-lg text-sm">Simpan Jam Pulang</button></div>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowGenerate(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleGenerate} disabled={generating} className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm">{generating ? 'Menyusun...' : 'Generate'}</button>
            </div>
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
