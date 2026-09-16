import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Edit, Printer, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import Modal from '../../components/ui/Modal'

interface Mapel { id: string; nama: string; kode: string }

interface KisiKisiItem {
  no: number
  kompetensi_dasar: string
  indikator: string
  level_kognitif: string
  tipe_soal: string
  jumlah_soal: number
  skor_per_soal: number
}

interface KisiKisi {
  id: string
  nama: string
  mapel_id: string
  mapel?: Mapel
  tingkat: string
  jenis_ujian: string
  tahun_ajaran: string
  semester: string
  items: KisiKisiItem[]
}

const JENIS_UJIAN = [
  { value: 'sts', label: 'STS (Sumatif Tengah Semester)' },
  { value: 'sas', label: 'SAS (Sumatif Akhir Semester)' },
  { value: 'sumatif_harian', label: 'Sumatif Harian' },
]

const TIPE_SOAL = [
  { value: 'pg', label: 'Pilihan Ganda' },
  { value: 'pg_kompleks', label: 'PG Kompleks' },
  { value: 'isian', label: 'Isian Singkat' },
  { value: 'uraian', label: 'Uraian' },
]

const LEVEL_KOGNITIF = [
  { value: 'C1', label: 'C1 - Mengingat' },
  { value: 'C2', label: 'C2 - Memahami' },
  { value: 'C3', label: 'C3 - Menerapkan' },
  { value: 'C4', label: 'C4 - Menganalisis' },
  { value: 'C5', label: 'C5 - Mengevaluasi' },
  { value: 'C6', label: 'C6 - Mencipta' },
]

const jenisBadge = (jenis: string) => {
  switch (jenis) {
    case 'sts': return 'bg-blue-100 text-blue-700'
    case 'sas': return 'bg-purple-100 text-purple-700'
    case 'sumatif_harian': return 'bg-green-100 text-green-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

const jenisLabel = (jenis: string) => JENIS_UJIAN.find(j => j.value === jenis)?.label || jenis

const emptyItem = (no: number): KisiKisiItem => ({
  no,
  kompetensi_dasar: '',
  indikator: '',
  level_kognitif: 'C1',
  tipe_soal: 'pg',
  jumlah_soal: 1,
  skor_per_soal: 1,
})

const emptyForm = () => ({
  nama: '',
  mapel_id: '',
  tingkat: '',
  jenis_ujian: 'sts',
  tahun_ajaran: '',
  semester: '1',
  items: [emptyItem(1)],
})

export default function KisiKisiPage() {
  const [data, setData] = useState<KisiKisi[]>([])
  const [mapelList, setMapelList] = useState<Mapel[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<KisiKisi | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/kisi-kisi')
      setData(Array.isArray(res.data) ? res.data : res.data.data || [])
    } catch { toast.error('Gagal memuat kisi-kisi') }
    finally { setLoading(false) }
  }, [])

  const fetchMapel = useCallback(async () => {
    try {
      const res = await api.get('/mapel')
      setMapelList(Array.isArray(res.data) ? res.data : [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchData(); fetchMapel() }, [fetchData, fetchMapel])

  const handleSave = async () => {
    if (!form.nama.trim()) { toast.error('Nama kisi-kisi wajib diisi'); return }
    if (!form.mapel_id) { toast.error('Mata pelajaran wajib dipilih'); return }
    if (form.items.length === 0) { toast.error('Minimal 1 item kisi-kisi'); return }

    const payload = {
      ...form,
      items: form.items.map((item, i) => ({ ...item, no: i + 1 })),
    }

    try {
      if (editing) {
        await api.put('/kisi-kisi/' + editing.id, payload)
        toast.success('Kisi-kisi berhasil diperbarui')
      } else {
        await api.post('/kisi-kisi', payload)
        toast.success('Kisi-kisi berhasil ditambahkan')
      }
      setShowModal(false); setEditing(null); setForm(emptyForm()); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus kisi-kisi ini?')) return
    try {
      await api.delete('/kisi-kisi/' + id)
      toast.success('Berhasil dihapus')
      fetchData()
    } catch { toast.error('Gagal menghapus') }
  }

  const openEdit = (k: KisiKisi) => {
    setEditing(k)
    setForm({
      nama: k.nama,
      mapel_id: k.mapel_id,
      tingkat: k.tingkat || '',
      jenis_ujian: k.jenis_ujian,
      tahun_ajaran: k.tahun_ajaran || '',
      semester: k.semester || '1',
      items: k.items?.length ? k.items : [emptyItem(1)],
    })
    setShowModal(true)
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setShowModal(true)
  }

  const addItem = () => {
    setForm(f => ({ ...f, items: [...f.items, emptyItem(f.items.length + 1)] }))
  }

  const removeItem = (idx: number) => {
    setForm(f => ({
      ...f,
      items: f.items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, no: i + 1 })),
    }))
  }

  const updateItem = (idx: number, field: keyof KisiKisiItem, value: any) => {
    setForm(f => ({
      ...f,
      items: f.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }))
  }

  const handlePrint = (k: KisiKisi) => {
    const mapelNama = k.mapel?.nama || mapelList.find(m => m.id === k.mapel_id)?.nama || '-'
    const printContent = `
      <html><head><title>Kisi-Kisi ${k.nama}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 12px; }
        h2 { text-align: center; margin-bottom: 4px; }
        .info { margin-bottom: 16px; }
        .info p { margin: 2px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
        .center { text-align: center; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h2>KISI-KISI SOAL</h2>
      <h3 style="text-align:center;margin-top:0">${k.nama}</h3>
      <div class="info">
        <p><strong>Mata Pelajaran:</strong> ${mapelNama}</p>
        <p><strong>Tingkat:</strong> ${k.tingkat || '-'}</p>
        <p><strong>Jenis Ujian:</strong> ${jenisLabel(k.jenis_ujian)}</p>
        <p><strong>Tahun Ajaran:</strong> ${k.tahun_ajaran || '-'}</p>
        <p><strong>Semester:</strong> ${k.semester || '-'}</p>
      </div>
      <table>
        <thead><tr>
          <th class="center">No</th>
          <th>Kompetensi Dasar</th>
          <th>Indikator</th>
          <th class="center">Level</th>
          <th class="center">Tipe Soal</th>
          <th class="center">Jml Soal</th>
          <th class="center">Skor/Soal</th>
          <th class="center">Total Skor</th>
        </tr></thead>
        <tbody>
          ${(k.items || []).map((item, i) => `<tr>
            <td class="center">${i + 1}</td>
            <td>${item.kompetensi_dasar}</td>
            <td>${item.indikator}</td>
            <td class="center">${item.level_kognitif}</td>
            <td class="center">${TIPE_SOAL.find(t => t.value === item.tipe_soal)?.label || item.tipe_soal}</td>
            <td class="center">${item.jumlah_soal}</td>
            <td class="center">${item.skor_per_soal}</td>
            <td class="center">${item.jumlah_soal * item.skor_per_soal}</td>
          </tr>`).join('')}
          <tr>
            <td colspan="5" style="text-align:right;font-weight:bold">Total</td>
            <td class="center" style="font-weight:bold">${(k.items || []).reduce((a, b) => a + b.jumlah_soal, 0)}</td>
            <td></td>
            <td class="center" style="font-weight:bold">${(k.items || []).reduce((a, b) => a + b.jumlah_soal * b.skor_per_soal, 0)}</td>
          </tr>
        </tbody>
      </table></body></html>
    `
    const w = window.open('', '_blank')
    if (w) { w.document.write(printContent); w.document.close(); w.print() }
  }

  const mapelName = (id: string) => mapelList.find(m => m.id === id)?.nama || '-'

  const totalSoal = (items: KisiKisiItem[]) => items.reduce((a, b) => a + b.jumlah_soal, 0)
  const totalSkor = (items: KisiKisiItem[]) => items.reduce((a, b) => a + b.jumlah_soal * b.skor_per_soal, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Kisi-Kisi Soal</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola kisi-kisi penyusunan soal ({data.length} kisi-kisi)</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
          <Plus size={16} /> Tambah Kisi-Kisi
        </button>
      </div>

      {/* Card List */}
      <div className="space-y-3" ref={printRef}>
        {loading ? (
          <p className="text-gray-400 text-center py-8">Memuat...</p>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText size={32} className="text-blue-400" />
            </div>
            <p className="text-gray-500 text-sm">Belum ada kisi-kisi soal</p>
          </div>
        ) : data.map(k => (
          <div key={k.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            {/* Card Header */}
            <div
              className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50"
              onClick={() => setExpandedId(expandedId === k.id ? null : k.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-gray-800 text-sm">{k.nama}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${jenisBadge(k.jenis_ujian)}`}>
                    {jenisLabel(k.jenis_ujian)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{k.mapel?.nama || mapelName(k.mapel_id)}</span>
                  {k.tingkat && <><span>·</span><span>Tingkat {k.tingkat}</span></>}
                  {k.tahun_ajaran && <><span>·</span><span>TA {k.tahun_ajaran}</span></>}
                  <span>·</span>
                  <span>{totalSoal(k.items || [])} soal</span>
                  <span>·</span>
                  <span>Total skor: {totalSkor(k.items || [])}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <button
                  onClick={e => { e.stopPropagation(); handlePrint(k) }}
                  className="p-2 hover:bg-blue-50 rounded-lg text-blue-600" title="Cetak"
                >
                  <Printer size={16} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); openEdit(k) }}
                  className="p-2 hover:bg-blue-50 rounded-lg text-blue-600" title="Edit"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(k.id) }}
                  className="p-2 hover:bg-red-50 rounded-lg text-red-500" title="Hapus"
                >
                  <Trash2 size={16} />
                </button>
                {expandedId === k.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </div>

            {/* Expanded Table */}
            {expandedId === k.id && k.items && k.items.length > 0 && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-12">No</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Kompetensi Dasar</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Indikator</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-16">Level</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-28">Tipe Soal</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-16">Jml</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-16">Skor</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-16">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {k.items.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-gray-500 text-center">{i + 1}</td>
                        <td className="px-4 py-2 text-gray-700">{item.kompetensi_dasar}</td>
                        <td className="px-4 py-2 text-gray-700">{item.indikator}</td>
                        <td className="px-4 py-2 text-center"><span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">{item.level_kognitif}</span></td>
                        <td className="px-4 py-2 text-center text-gray-600 text-xs">{TIPE_SOAL.find(t => t.value === item.tipe_soal)?.label || item.tipe_soal}</td>
                        <td className="px-4 py-2 text-center font-medium">{item.jumlah_soal}</td>
                        <td className="px-4 py-2 text-center">{item.skor_per_soal}</td>
                        <td className="px-4 py-2 text-center font-medium">{item.jumlah_soal * item.skor_per_soal}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td colSpan={5} className="px-4 py-2 text-right text-gray-600">Total</td>
                      <td className="px-4 py-2 text-center">{totalSoal(k.items)}</td>
                      <td></td>
                      <td className="px-4 py-2 text-center">{totalSkor(k.items)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Tambah/Edit */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null) }}
        title={editing ? 'Edit Kisi-Kisi' : 'Tambah Kisi-Kisi Baru'}
        maxWidth="md:max-w-4xl"
        footer={
          <div className="flex gap-3">
            <button onClick={() => { setShowModal(false); setEditing(null) }} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
            <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">{editing ? 'Update' : 'Simpan'}</button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Form Info */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nama Kisi-Kisi *</label>
            <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} placeholder="Kisi-kisi STS Matematika Kelas 7" className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mata Pelajaran *</label>
              <select value={form.mapel_id} onChange={e => setForm({ ...form, mapel_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Pilih Mapel</option>
                {mapelList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tingkat</label>
              <input value={form.tingkat} onChange={e => setForm({ ...form, tingkat: e.target.value })} placeholder="7 / 8 / 9" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Jenis Ujian *</label>
              <select value={form.jenis_ujian} onChange={e => setForm({ ...form, jenis_ujian: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                {JENIS_UJIAN.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tahun Ajaran</label>
              <input value={form.tahun_ajaran} onChange={e => setForm({ ...form, tahun_ajaran: e.target.value })} placeholder="2025/2026" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Semester</label>
              <select value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="1">Semester 1 (Ganjil)</option>
                <option value="2">Semester 2 (Genap)</option>
              </select>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Item Kisi-Kisi</label>
              <button onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20">
                <Plus size={14} /> Tambah Item
              </button>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">No</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">KD</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Indikator</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24">Level</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">Tipe</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">Jml</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">Skor</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-gray-400 text-center">{idx + 1}</td>
                      <td className="px-3 py-1">
                        <input value={item.kompetensi_dasar} onChange={e => updateItem(idx, 'kompetensi_dasar', e.target.value)} placeholder="3.1" className="w-full px-2 py-1.5 border rounded text-sm" />
                      </td>
                      <td className="px-3 py-1">
                        <input value={item.indikator} onChange={e => updateItem(idx, 'indikator', e.target.value)} placeholder="Siswa mampu..." className="w-full px-2 py-1.5 border rounded text-sm" />
                      </td>
                      <td className="px-3 py-1">
                        <select value={item.level_kognitif} onChange={e => updateItem(idx, 'level_kognitif', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
                          {LEVEL_KOGNITIF.map(l => <option key={l.value} value={l.value}>{l.value}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <select value={item.tipe_soal} onChange={e => updateItem(idx, 'tipe_soal', e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
                          {TIPE_SOAL.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <input type="number" min={1} value={item.jumlah_soal} onChange={e => updateItem(idx, 'jumlah_soal', +e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm text-center" />
                      </td>
                      <td className="px-3 py-1">
                        <input type="number" min={0} value={item.skor_per_soal} onChange={e => updateItem(idx, 'skor_per_soal', +e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm text-center" />
                      </td>
                      <td className="px-3 py-1 text-center">
                        {form.items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-medium text-xs text-gray-600">
                    <td colSpan={5} className="px-3 py-2 text-right">Total</td>
                    <td className="px-3 py-2 text-center">{form.items.reduce((a, b) => a + b.jumlah_soal, 0)}</td>
                    <td className="px-3 py-2 text-center">{form.items.reduce((a, b) => a + b.jumlah_soal * b.skor_per_soal, 0)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
