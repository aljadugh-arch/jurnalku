import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Edit, Printer, Eye, CheckCircle, Play, Lock,
  FileText, ClipboardList, Monitor, BookOpen, Users, Search,
  GripVertical, CreditCard, BarChart3, X, ChevronLeft, Save
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import Modal from '../../components/ui/Modal'

/* ─── Types ─── */
interface Mapel { id: string; nama: string; kode: string }
interface Rombel { id: string; nama: string; tingkat: string }
interface Soal {
  id: string; mapel_id: string; tipe: string; level_kognitif: string
  soal: string; opsi: string[]; kunci_jawaban: string | string[]
  skor: number; pembahasan: string; kompetensi_dasar: string; indikator: string
}
interface PaketUjian {
  id: string; nama: string; mapel_id: string; mapel?: Mapel
  jenis: string; model: string; tingkat: string
  tahun_ajaran: string; semester: string; durasi_menit: number
  acak_soal: boolean; acak_opsi: boolean; tampil_nilai: boolean; tampil_pembahasan: boolean
  password: string; status: string; mulai: string; selesai: string
  soal_ids: string[]; rombel_ids: string[]; soal?: Soal[]
  jumlah_soal?: number
}
interface HasilSiswa {
  siswa_id: string; nama: string; nis: string; rombel: string
  nilai: number; benar: number; salah: number; kosong: number; status: string
}
interface KoreksiItem {
  no: number; soal: string; tipe: string; opsi: string[]
  kunci_jawaban: string | string[]; jawaban_siswa: string | string[]
  skor_maks: number; skor: number; pembahasan: string
}
interface KartuUjian {
  siswa_id: string; nama: string; nis: string; rombel: string; foto?: string
  ujian_nama: string; mapel: string; tanggal: string; durasi: number; ruang?: string
}

const JENIS_OPTIONS = [
  { value: 'sts', label: 'STS' }, { value: 'sas', label: 'SAS' },
  { value: 'sumatif_harian', label: 'Sumatif Harian' },
  { value: 'ulangan', label: 'Ulangan' }, { value: 'latihan', label: 'Latihan' },
]
const MODEL_OPTIONS = [
  { value: 'cetak', label: 'Cetak', icon: Printer },
  { value: 'online', label: 'Online', icon: Monitor },
  { value: 'cbt', label: 'CBT', icon: Monitor },
]
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' }, { value: 'aktif', label: 'Aktif' }, { value: 'selesai', label: 'Selesai' },
]
const OPSI_LABELS = ['A', 'B', 'C', 'D', 'E']

const statusBadge = (s: string) => {
  switch (s) {
    case 'draft': return 'bg-gray-100 text-gray-600'
    case 'aktif': return 'bg-green-100 text-green-700'
    case 'selesai': return 'bg-blue-100 text-blue-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}
const modelBadge = (m: string) => {
  switch (m) {
    case 'cetak': return 'bg-yellow-100 text-yellow-700'
    case 'online': return 'bg-purple-100 text-purple-700'
    case 'cbt': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

const emptyForm = (): Omit<PaketUjian, 'id' | 'mapel' | 'soal' | 'jumlah_soal'> => ({
  nama: '', mapel_id: '', jenis: 'sts', model: 'online', tingkat: '',
  tahun_ajaran: '', semester: '1', durasi_menit: 60,
  acak_soal: false, acak_opsi: false, tampil_nilai: true, tampil_pembahasan: false,
  password: '', status: 'draft', mulai: '', selesai: '',
  soal_ids: [], rombel_ids: [],
})

/* ─── Sub-views enum ─── */
type ViewMode = 'list' | 'cetak_soal' | 'cetak_kartu' | 'hasil' | 'koreksi'

export default function PaketUjianPage() {
  const [data, setData] = useState<PaketUjian[]>([])
  const [mapelList, setMapelList] = useState<Mapel[]>([])
  const [rombelList, setRombelList] = useState<Rombel[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PaketUjian | null>(null)
  const [form, setForm] = useState(emptyForm())

  // Soal picker
  const [bankSoal, setBankSoal] = useState<Soal[]>([])
  const [soalSearch, setSoalSearch] = useState('')
  const [loadingSoal, setLoadingSoal] = useState(false)

  // Sub-views
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [viewPaket, setViewPaket] = useState<PaketUjian | null>(null)
  const [viewSoalList, setViewSoalList] = useState<Soal[]>([])
  const [hasilList, setHasilList] = useState<HasilSiswa[]>([])
  const [kartuList, setKartuList] = useState<KartuUjian[]>([])
  const [koreksiSiswa, setKoreksiSiswa] = useState<{ nama: string; nis: string; items: KoreksiItem[] } | null>(null)
  const [koreksiScores, setKoreksiScores] = useState<Record<number, number>>({})

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/paket-ujian')
      setData(Array.isArray(res.data) ? res.data : res.data.data || [])
    } catch { toast.error('Gagal memuat paket ujian') }
    finally { setLoading(false) }
  }, [])

  const fetchMapel = useCallback(async () => {
    try { const res = await api.get('/mapel'); setMapelList(Array.isArray(res.data) ? res.data : []) } catch {}
  }, [])

  const fetchRombel = useCallback(async () => {
    try { const res = await api.get('/rombel'); setRombelList(Array.isArray(res.data) ? res.data : []) } catch {}
  }, [])

  useEffect(() => { fetchData(); fetchMapel(); fetchRombel() }, [fetchData, fetchMapel, fetchRombel])

  const fetchBankSoal = async (mapelId: string) => {
    if (!mapelId) { setBankSoal([]); return }
    setLoadingSoal(true)
    try {
      const res = await api.get('/bank-soal', { params: { mapel_id: mapelId } })
      setBankSoal(Array.isArray(res.data) ? res.data : res.data.data || [])
    } catch { toast.error('Gagal memuat bank soal') }
    finally { setLoadingSoal(false) }
  }

  // When mapel changes in form, reload bank soal
  const handleMapelChange = (mapelId: string) => {
    setForm(f => ({ ...f, mapel_id: mapelId, soal_ids: [] }))
    fetchBankSoal(mapelId)
  }

  const handleSave = async () => {
    if (!form.nama.trim()) { toast.error('Nama paket wajib diisi'); return }
    if (!form.mapel_id) { toast.error('Mapel wajib dipilih'); return }
    if (form.soal_ids.length === 0) { toast.error('Pilih minimal 1 soal'); return }

    try {
      if (editing) {
        await api.put('/paket-ujian/' + editing.id, form)
        toast.success('Paket ujian berhasil diperbarui')
      } else {
        await api.post('/paket-ujian', form)
        toast.success('Paket ujian berhasil ditambahkan')
      }
      setShowModal(false); setEditing(null); setForm(emptyForm()); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus paket ujian ini?')) return
    try { await api.delete('/paket-ujian/' + id); toast.success('Berhasil dihapus'); fetchData() }
    catch { toast.error('Gagal menghapus') }
  }

  const handleAktifkan = async (p: PaketUjian) => {
    if (!confirm('Aktifkan paket ujian ini? Siswa akan dapat mengakses ujian.')) return
    try {
      await api.put('/paket-ujian/' + p.id, { ...p, status: 'aktif' })
      toast.success('Paket ujian diaktifkan')
      fetchData()
    } catch { toast.error('Gagal mengaktifkan') }
  }

  const openEdit = async (p: PaketUjian) => {
    setEditing(p)
    setForm({
      nama: p.nama, mapel_id: p.mapel_id, jenis: p.jenis, model: p.model,
      tingkat: p.tingkat || '', tahun_ajaran: p.tahun_ajaran || '', semester: p.semester || '1',
      durasi_menit: p.durasi_menit, acak_soal: p.acak_soal, acak_opsi: p.acak_opsi,
      tampil_nilai: p.tampil_nilai, tampil_pembahasan: p.tampil_pembahasan,
      password: p.password || '', status: p.status, mulai: p.mulai || '', selesai: p.selesai || '',
      soal_ids: p.soal_ids || [], rombel_ids: p.rombel_ids || [],
    })
    await fetchBankSoal(p.mapel_id)
    setShowModal(true)
  }

  const openCreate = () => {
    setEditing(null); setForm(emptyForm()); setBankSoal([]); setShowModal(true)
  }

  // Soal picker helpers
  const toggleSoal = (id: string) => {
    setForm(f => ({
      ...f,
      soal_ids: f.soal_ids.includes(id)
        ? f.soal_ids.filter(s => s !== id)
        : [...f.soal_ids, id],
    }))
  }

  const moveSoal = (from: number, to: number) => {
    if (to < 0 || to >= form.soal_ids.length) return
    setForm(f => {
      const ids = [...f.soal_ids]
      const [moved] = ids.splice(from, 1)
      ids.splice(to, 0, moved)
      return { ...f, soal_ids: ids }
    })
  }

  // Toggle rombel
  const toggleRombel = (id: string) => {
    setForm(f => ({
      ...f,
      rombel_ids: f.rombel_ids.includes(id) ? f.rombel_ids.filter(r => r !== id) : [...f.rombel_ids, id],
    }))
  }

  // Sub-view actions
  const openCetakSoal = async (p: PaketUjian) => {
    try {
      const res = await api.get('/paket-ujian/' + p.id)
      const detail = res.data
      setViewPaket(detail)
      setViewSoalList(detail.soal || [])
      setViewMode('cetak_soal')
    } catch { toast.error('Gagal memuat soal') }
  }

  const openCetakKartu = async (p: PaketUjian) => {
    try {
      const res = await api.get(`/ujian/${p.id}/kartu`)
      setViewPaket(p)
      setKartuList(Array.isArray(res.data) ? res.data : res.data.data || [])
      setViewMode('cetak_kartu')
    } catch { toast.error('Gagal memuat kartu ujian') }
  }

  const openHasil = async (p: PaketUjian) => {
    try {
      const res = await api.get(`/ujian/${p.id}/hasil`)
      setViewPaket(p)
      setHasilList(Array.isArray(res.data) ? res.data : res.data.data || [])
      setViewMode('hasil')
    } catch { toast.error('Gagal memuat hasil') }
  }

  const openKoreksi = async (paketId: string, siswaId: string) => {
    try {
      const res = await api.get(`/ujian/${paketId}/koreksi/${siswaId}`)
      const d = res.data
      setKoreksiSiswa({ nama: d.nama || '', nis: d.nis || '', items: d.items || [] })
      const scores: Record<number, number> = {}
      ;(d.items || []).forEach((item: KoreksiItem, i: number) => { scores[i] = item.skor })
      setKoreksiScores(scores)
      setViewMode('koreksi')
    } catch { toast.error('Gagal memuat koreksi') }
  }

  const saveKoreksi = async () => {
    if (!viewPaket || !koreksiSiswa) return
    try {
      await api.put(`/ujian/${viewPaket.id}/koreksi/${koreksiSiswa.nis}`, { scores: koreksiScores })
      toast.success('Skor berhasil disimpan')
      setViewMode('hasil')
      if (viewPaket) openHasil(viewPaket)
    } catch { toast.error('Gagal menyimpan skor') }
  }

  const doPrint = () => { window.print() }

  const backToList = () => {
    setViewMode('list'); setViewPaket(null); setViewSoalList([]); setHasilList([])
    setKartuList([]); setKoreksiSiswa(null)
  }

  const mapelName = (id: string) => mapelList.find(m => m.id === id)?.nama || '-'

  const filteredBankSoal = bankSoal.filter(s => {
    if (!soalSearch) return true
    const q = soalSearch.toLowerCase()
    return s.soal.toLowerCase().includes(q) || s.kompetensi_dasar?.toLowerCase().includes(q)
  })

  /* ─── Cetak Soal Print View ─── */
  if (viewMode === 'cetak_soal' && viewPaket) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 print:hidden">
          <button onClick={backToList} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <h1 className="text-xl font-bold text-gray-800 flex-1">Cetak Soal — {viewPaket.nama}</h1>
          <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Printer size={16} /> Cetak
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 print:shadow-none print:border-0 print:p-0">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold">{viewPaket.nama}</h2>
            <p className="text-sm text-gray-500">{viewPaket.mapel?.nama || mapelName(viewPaket.mapel_id)} · Durasi: {viewPaket.durasi_menit} menit</p>
          </div>
          <div className="space-y-6">
            {viewSoalList.map((s, i) => (
              <div key={s.id} className="flex gap-3">
                <span className="font-bold text-gray-600 shrink-0 w-8">{i + 1}.</span>
                <div className="flex-1">
                  <p className="text-sm mb-2">{s.soal}</p>
                  {(s.tipe === 'pg' || s.tipe === 'pg_kompleks') && s.opsi?.map((o, j) => (
                    <div key={j} className="flex gap-2 text-sm mb-1">
                      <span className="font-medium w-5">{OPSI_LABELS[j]}.</span>
                      <span>{o}</span>
                    </div>
                  ))}
                  {s.tipe === 'isian' && <div className="border-b border-gray-300 w-48 mt-2" />}
                  {s.tipe === 'uraian' && (
                    <div className="border border-gray-200 rounded h-24 mt-2" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Answer sheet */}
          <div className="mt-8 pt-6 border-t print:break-before-page">
            <h3 className="font-bold text-center mb-4">LEMBAR JAWABAN</h3>
            <div className="grid grid-cols-5 gap-3">
              {viewSoalList.filter(s => s.tipe === 'pg' || s.tipe === 'pg_kompleks').map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="font-medium w-6 text-right">{i + 1}.</span>
                  <div className="flex gap-1">
                    {OPSI_LABELS.slice(0, s.opsi?.length || 5).map(l => (
                      <span key={l} className="w-6 h-6 border border-gray-400 rounded-full flex items-center justify-center text-xs">{l}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Cetak Kartu Ujian ─── */
  if (viewMode === 'cetak_kartu' && viewPaket) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 print:hidden">
          <button onClick={backToList} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <h1 className="text-xl font-bold text-gray-800 flex-1">Kartu Ujian — {viewPaket.nama}</h1>
          <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Printer size={16} /> Cetak
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:grid-cols-2 print:gap-2">
          {kartuList.map(k => (
            <div key={k.siswa_id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 print:shadow-none print:text-xs print:p-3 print:break-inside-avoid">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-3">
                <div className="w-16 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                  {k.foto ? (
                    <img src={k.foto} alt={k.nama} className="w-full h-full object-cover" />
                  ) : (
                    <Users size={24} className="text-gray-300" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{k.nama}</h3>
                  <p className="text-xs text-gray-500">NIS: {k.nis}</p>
                  <p className="text-xs text-gray-500">Kelas: {k.rombel}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Ujian:</span> <span className="font-medium">{k.ujian_nama}</span></div>
                <div><span className="text-gray-400">Mapel:</span> <span className="font-medium">{k.mapel}</span></div>
                <div><span className="text-gray-400">Tanggal:</span> <span className="font-medium">{k.tanggal ? new Date(k.tanggal).toLocaleDateString('id-ID') : '-'}</span></div>
                <div><span className="text-gray-400">Durasi:</span> <span className="font-medium">{k.durasi} menit</span></div>
                {k.ruang && <div><span className="text-gray-400">Ruang:</span> <span className="font-medium">{k.ruang}</span></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ─── Lihat Hasil ─── */
  if (viewMode === 'hasil' && viewPaket) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={backToList} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">Hasil Ujian — {viewPaket.nama}</h1>
            <p className="text-sm text-gray-500">{hasilList.length} siswa</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">NIS</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kelas</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Benar</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Salah</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Kosong</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Nilai</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hasilList.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Belum ada siswa yang mengerjakan</td></tr>
                ) : hasilList.map((h, i) => (
                  <tr key={h.siswa_id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs">{h.nis}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{h.nama}</td>
                    <td className="px-4 py-3 text-gray-600">{h.rombel}</td>
                    <td className="px-4 py-3 text-center text-green-600 font-medium">{h.benar}</td>
                    <td className="px-4 py-3 text-center text-red-500 font-medium">{h.salah}</td>
                    <td className="px-4 py-3 text-center text-gray-400">{h.kosong}</td>
                    <td className="px-4 py-3 text-center font-bold text-lg">{h.nilai}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${h.status === 'selesai' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {h.status === 'selesai' ? 'Selesai' : 'Mengerjakan'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openKoreksi(viewPaket.id, h.siswa_id)}
                        className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs hover:bg-blue-100"
                      >
                        Koreksi
                      </button>
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

  /* ─── Koreksi Detail ─── */
  if (viewMode === 'koreksi' && viewPaket && koreksiSiswa) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setViewMode('hasil'); setKoreksiSiswa(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">Koreksi — {koreksiSiswa.nama}</h1>
            <p className="text-sm text-gray-500">NIS: {koreksiSiswa.nis}</p>
          </div>
          <button onClick={saveKoreksi} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Save size={16} /> Simpan Skor
          </button>
        </div>
        <div className="space-y-4">
          {koreksiSiswa.items.map((item, i) => {
            const isCorrect = JSON.stringify(item.jawaban_siswa) === JSON.stringify(item.kunci_jawaban)
            return (
              <div key={i} className={`bg-white rounded-xl shadow-sm border p-5 ${isCorrect ? 'border-green-200' : 'border-red-200'}`}>
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">{item.no || i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800 mb-2">{item.soal}</p>
                    {(item.tipe === 'pg' || item.tipe === 'pg_kompleks') && item.opsi?.map((o, j) => {
                      const label = OPSI_LABELS[j]
                      const isKunci = Array.isArray(item.kunci_jawaban) ? item.kunci_jawaban.includes(label) : item.kunci_jawaban === label
                      const isJawaban = Array.isArray(item.jawaban_siswa) ? item.jawaban_siswa.includes(label) : item.jawaban_siswa === label
                      return (
                        <div key={j} className={`flex gap-2 text-sm mb-1 px-2 py-1 rounded ${isKunci ? 'bg-green-50 text-green-700 font-medium' : ''} ${isJawaban && !isKunci ? 'bg-red-50 text-red-600' : ''}`}>
                          <span className="w-5 font-medium">{label}.</span>
                          <span>{o}</span>
                          {isKunci && <CheckCircle size={14} className="text-green-500 ml-auto" />}
                          {isJawaban && !isKunci && <X size={14} className="text-red-500 ml-auto" />}
                        </div>
                      )
                    })}
                    {(item.tipe === 'isian' || item.tipe === 'uraian') && (
                      <div className="mt-2 space-y-2">
                        <div className="bg-blue-50 rounded-lg p-3 text-sm">
                          <span className="text-xs text-blue-500 font-medium">Jawaban Siswa:</span>
                          <p className="text-blue-800 mt-1">{(item.jawaban_siswa as string) || <em className="text-gray-400">Tidak dijawab</em>}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-sm">
                          <span className="text-xs text-green-500 font-medium">Kunci Jawaban:</span>
                          <p className="text-green-800 mt-1">{item.kunci_jawaban as string}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-400">
                    {item.pembahasan && <span>Pembahasan: {item.pembahasan}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Skor:</label>
                    <input
                      type="number"
                      min={0}
                      max={item.skor_maks}
                      value={koreksiScores[i] ?? item.skor}
                      onChange={e => setKoreksiScores(s => ({ ...s, [i]: +e.target.value }))}
                      className="w-16 px-2 py-1 border rounded text-sm text-center"
                    />
                    <span className="text-xs text-gray-400">/ {item.skor_maks}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* ─── Main List View ─── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Paket Ujian</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola paket ujian dan asesmen ({data.length} paket)</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
          <Plus size={16} /> Buat Paket Ujian
        </button>
      </div>

      {/* Card List */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-gray-400 text-center py-8">Memuat...</p>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardList size={32} className="text-blue-400" />
            </div>
            <p className="text-gray-500 text-sm">Belum ada paket ujian</p>
          </div>
        ) : data.map(p => (
          <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-gray-800">{p.nama}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(p.status)}`}>
                    {STATUS_OPTIONS.find(s => s.value === p.status)?.label || p.status}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${modelBadge(p.model)}`}>
                    {p.model?.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1"><BookOpen size={12} /> {p.mapel?.nama || mapelName(p.mapel_id)}</span>
                  <span>{JENIS_OPTIONS.find(j => j.value === p.jenis)?.label || p.jenis}</span>
                  <span>{p.jumlah_soal ?? p.soal_ids?.length ?? 0} soal</span>
                  <span>{p.durasi_menit} menit</span>
                  {p.password && <span className="flex items-center gap-1"><Lock size={10} /> Password</span>}
                  {p.mulai && <span>Mulai: {new Date(p.mulai).toLocaleDateString('id-ID')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {p.status === 'draft' && (
                  <button onClick={() => handleAktifkan(p)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs hover:bg-green-100 border border-green-200">
                    <Play size={12} /> Aktifkan
                  </button>
                )}
                {p.model === 'cetak' && (
                  <button onClick={() => openCetakSoal(p)} className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-xs hover:bg-yellow-100 border border-yellow-200">
                    <Printer size={12} /> Cetak Soal
                  </button>
                )}
                <button onClick={() => openCetakKartu(p)} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg text-xs hover:bg-purple-100 border border-purple-200">
                  <CreditCard size={12} /> Kartu
                </button>
                <button onClick={() => openHasil(p)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs hover:bg-blue-100 border border-blue-200">
                  <BarChart3 size={12} /> Hasil
                </button>
                <button onClick={() => openEdit(p)} className="p-2 hover:bg-blue-50 rounded-lg text-blue-600" title="Edit">
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-500" title="Hapus">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Tambah/Edit */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null) }}
        title={editing ? 'Edit Paket Ujian' : 'Buat Paket Ujian Baru'}
        maxWidth="md:max-w-4xl"
        footer={
          <div className="flex gap-3">
            <button onClick={() => { setShowModal(false); setEditing(null) }} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
            <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">{editing ? 'Update' : 'Simpan'}</button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Basic Info */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nama Paket *</label>
            <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} placeholder="STS Matematika Kelas 7 Semester 1" className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mata Pelajaran *</label>
              <select value={form.mapel_id} onChange={e => handleMapelChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Pilih Mapel</option>
                {mapelList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Jenis</label>
              <select value={form.jenis} onChange={e => setForm({ ...form, jenis: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                {JENIS_OPTIONS.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
              <div className="flex gap-1">
                {MODEL_OPTIONS.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, model: m.value }))}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${form.model === m.value ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <m.icon size={12} /> {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tingkat</label>
              <input value={form.tingkat} onChange={e => setForm({ ...form, tingkat: e.target.value })} placeholder="7" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tahun Ajaran</label>
              <input value={form.tahun_ajaran} onChange={e => setForm({ ...form, tahun_ajaran: e.target.value })} placeholder="2025/2026" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Semester</label>
              <select value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="1">Ganjil</option><option value="2">Genap</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Durasi (menit)</label>
              <input type="number" min={1} value={form.durasi_menit} onChange={e => setForm({ ...form, durasi_menit: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mulai</label>
              <input type="datetime-local" value={form.mulai} onChange={e => setForm({ ...form, mulai: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Selesai</label>
              <input type="datetime-local" value={form.selesai} onChange={e => setForm({ ...form, selesai: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'acak_soal', label: 'Acak Soal' },
              { key: 'acak_opsi', label: 'Acak Opsi' },
              { key: 'tampil_nilai', label: 'Tampil Nilai' },
              { key: 'tampil_pembahasan', label: 'Tampil Pembahasan' },
            ].map(t => (
              <label key={t.key} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={form[t.key as keyof typeof form] as boolean}
                  onChange={e => setForm({ ...form, [t.key]: e.target.checked })}
                  className="accent-primary"
                />
                <span className="text-gray-700">{t.label}</span>
              </label>
            ))}
          </div>

          {/* Password + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password (opsional)</label>
              <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Kosongkan jika tidak perlu" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Soal Picker */}
          <div className="border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <FileText size={16} /> Pilih Soal ({form.soal_ids.length} dipilih)
              </h3>
            </div>
            {!form.mapel_id ? (
              <p className="text-sm text-gray-400 text-center py-4">Pilih mata pelajaran terlebih dahulu</p>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={soalSearch} onChange={e => setSoalSearch(e.target.value)} placeholder="Cari soal..." className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="flex gap-3">
                  {/* Available soal */}
                  <div className="flex-1 border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 border-b">Bank Soal</div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                      {loadingSoal ? (
                        <p className="px-3 py-4 text-center text-xs text-gray-400">Memuat...</p>
                      ) : filteredBankSoal.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-gray-400">Tidak ada soal</p>
                      ) : filteredBankSoal.map(s => (
                        <label key={s.id} className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.soal_ids.includes(s.id)}
                            onChange={() => toggleSoal(s.id)}
                            className="mt-0.5 accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 line-clamp-2">{s.soal}</p>
                            <div className="flex gap-1 mt-1">
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded">{s.tipe}</span>
                              <span className="px-1.5 py-0.5 bg-yellow-50 text-yellow-600 text-[10px] rounded">{s.level_kognitif}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* Selected soal order */}
                  <div className="flex-1 border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 border-b">Urutan Soal</div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                      {form.soal_ids.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-gray-400">Belum ada soal dipilih</p>
                      ) : form.soal_ids.map((id, idx) => {
                        const s = bankSoal.find(b => b.id === id)
                        return (
                          <div key={id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                            <div className="flex flex-col gap-0.5">
                              <button onClick={() => moveSoal(idx, idx - 1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                <GripVertical size={10} />
                              </button>
                            </div>
                            <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}.</span>
                            <p className="text-xs text-gray-700 flex-1 line-clamp-1">{s?.soal || id}</p>
                            <button onClick={() => toggleSoal(id)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Rombel Picker */}
          <div className="border rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-3">
              <Users size={16} /> Target Rombel ({form.rombel_ids.length} dipilih)
            </h3>
            <div className="flex flex-wrap gap-2">
              {rombelList.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada data rombel</p>
              ) : rombelList.map(r => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer transition-colors ${form.rombel_ids.includes(r.id) ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={form.rombel_ids.includes(r.id)}
                    onChange={() => toggleRombel(r.id)}
                    className="accent-primary"
                  />
                  {r.nama}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
