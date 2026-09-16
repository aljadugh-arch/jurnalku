import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Upload, Search, BookOpen, Edit, Filter, Brain, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import Modal from '../../components/ui/Modal'

interface Mapel { id: string; nama: string; kode: string }
interface Soal {
  id: string
  mapel_id: string
  mapel?: Mapel
  tipe: 'pg' | 'pg_kompleks' | 'isian' | 'uraian'
  level_kognitif: string
  kompetensi_dasar: string
  indikator: string
  soal: string
  opsi: string[]
  kunci_jawaban: string | string[]
  skor: number
  pembahasan: string
}

const TIPE_OPTIONS = [
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

const OPSI_LABELS = ['A', 'B', 'C', 'D', 'E']

const tipeBadge = (tipe: string) => {
  switch (tipe) {
    case 'pg': return 'bg-blue-100 text-blue-700'
    case 'pg_kompleks': return 'bg-purple-100 text-purple-700'
    case 'isian': return 'bg-green-100 text-green-700'
    case 'uraian': return 'bg-orange-100 text-orange-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

const levelBadge = (level: string) => {
  const n = parseInt(level.replace('C', ''))
  if (n <= 2) return 'bg-green-100 text-green-700'
  if (n <= 4) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

const tipeLabel = (tipe: string) => TIPE_OPTIONS.find(t => t.value === tipe)?.label || tipe

const emptyForm = (): Omit<Soal, 'id' | 'mapel'> => ({
  mapel_id: '',
  tipe: 'pg',
  level_kognitif: 'C1',
  kompetensi_dasar: '',
  indikator: '',
  soal: '',
  opsi: ['', '', '', '', ''],
  kunci_jawaban: '',
  skor: 1,
  pembahasan: '',
})

export default function BankSoalPage() {
  const [data, setData] = useState<Soal[]>([])
  const [mapelList, setMapelList] = useState<Mapel[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editing, setEditing] = useState<Soal | null>(null)
  const [form, setForm] = useState(emptyForm())

  // Filters
  const [search, setSearch] = useState('')
  const [filterMapel, setFilterMapel] = useState('')
  const [filterTipe, setFilterTipe] = useState('')
  const [filterLevel, setFilterLevel] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/bank-soal')
      setData(Array.isArray(res.data) ? res.data : res.data.data || [])
    } catch { toast.error('Gagal memuat bank soal') }
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
    if (!form.mapel_id) { toast.error('Mata pelajaran wajib dipilih'); return }
    if (!form.soal.trim()) { toast.error('Soal wajib diisi'); return }
    if ((form.tipe === 'pg' || form.tipe === 'pg_kompleks') && form.opsi.filter(o => o.trim()).length < 2) {
      toast.error('Minimal 2 opsi jawaban'); return
    }
    if (form.tipe === 'pg' && !form.kunci_jawaban) { toast.error('Kunci jawaban wajib dipilih'); return }
    if (form.tipe === 'pg_kompleks' && (!Array.isArray(form.kunci_jawaban) || (form.kunci_jawaban as string[]).length === 0)) {
      toast.error('Kunci jawaban wajib dipilih minimal 1'); return
    }

    const payload = {
      ...form,
      opsi: (form.tipe === 'pg' || form.tipe === 'pg_kompleks') ? form.opsi.filter(o => o.trim()) : [],
      kunci_jawaban: form.tipe === 'pg_kompleks'
        ? (Array.isArray(form.kunci_jawaban) ? form.kunci_jawaban : [])
        : (typeof form.kunci_jawaban === 'string' ? form.kunci_jawaban : ''),
    }

    try {
      if (editing) {
        await api.put('/bank-soal/' + editing.id, payload)
        toast.success('Soal berhasil diperbarui')
      } else {
        await api.post('/bank-soal', payload)
        toast.success('Soal berhasil ditambahkan')
      }
      setShowModal(false); setEditing(null); setForm(emptyForm()); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus soal ini?')) return
    try {
      await api.delete('/bank-soal/' + id)
      toast.success('Soal berhasil dihapus')
      fetchData()
    } catch { toast.error('Gagal menghapus') }
  }

  const openEdit = (s: Soal) => {
    setEditing(s)
    setForm({
      mapel_id: s.mapel_id,
      tipe: s.tipe,
      level_kognitif: s.level_kognitif,
      kompetensi_dasar: s.kompetensi_dasar,
      indikator: s.indikator,
      soal: s.soal,
      opsi: s.opsi?.length ? [...s.opsi, ...Array(5 - s.opsi.length).fill('')].slice(0, 5) : ['', '', '', '', ''],
      kunci_jawaban: s.kunci_jawaban || (s.tipe === 'pg_kompleks' ? [] : ''),
      skor: s.skor,
      pembahasan: s.pembahasan,
    })
    setShowModal(true)
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setShowModal(true)
  }

  const handleTipeChange = (tipe: 'pg' | 'pg_kompleks' | 'isian' | 'uraian') => {
    setForm(f => ({
      ...f,
      tipe,
      kunci_jawaban: tipe === 'pg_kompleks' ? [] : '',
      opsi: (tipe === 'pg' || tipe === 'pg_kompleks') ? f.opsi : ['', '', '', '', ''],
    }))
  }

  const filtered = data.filter(s => {
    if (filterMapel && s.mapel_id !== filterMapel) return false
    if (filterTipe && s.tipe !== filterTipe) return false
    if (filterLevel && s.level_kognitif !== filterLevel) return false
    if (search) {
      const q = search.toLowerCase()
      return s.soal.toLowerCase().includes(q) || s.kompetensi_dasar?.toLowerCase().includes(q) || s.indikator?.toLowerCase().includes(q)
    }
    return true
  })

  const mapelName = (id: string) => mapelList.find(m => m.id === id)?.nama || id

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Bank Soal</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola bank soal ujian ({data.length} soal)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Soal
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari soal, KD, atau indikator..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2 items-center text-sm">
            <Filter size={14} className="text-gray-400" />
            <select value={filterMapel} onChange={e => setFilterMapel(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">Semua Mapel</option>
              {mapelList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
            <select value={filterTipe} onChange={e => setFilterTipe(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">Semua Tipe</option>
              {TIPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">Semua Level</option>
              {LEVEL_KOGNITIF.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="text-gray-400 col-span-3 text-center py-8">Memuat...</p>
        ) : filtered.length === 0 ? (
          <div className="col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain size={32} className="text-blue-400" />
            </div>
            <p className="text-gray-500 text-sm">{search || filterMapel || filterTipe || filterLevel ? 'Tidak ada soal yang cocok dengan filter' : 'Belum ada soal di bank soal'}</p>
          </div>
        ) : filtered.map(s => (
          <div
            key={s.id}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-primary/40 transition-all group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tipeBadge(s.tipe)}`}>
                  {tipeLabel(s.tipe)}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${levelBadge(s.level_kognitif)}`}>
                  {s.level_kognitif}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600" title="Edit">
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title="Hapus">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-800 line-clamp-3 mb-2">{s.soal}</p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <BookOpen size={12} />
              <span>{s.mapel?.nama || mapelName(s.mapel_id)}</span>
              <span>·</span>
              <span>Skor: {s.skor}</span>
            </div>
            {(s.tipe === 'pg' || s.tipe === 'pg_kompleks') && s.opsi?.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {s.opsi.slice(0, 4).map((o, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                    <span className="font-medium text-gray-600 shrink-0">{OPSI_LABELS[i]}.</span>
                    <span className="line-clamp-1">{o}</span>
                  </div>
                ))}
                {s.opsi.length > 4 && <span className="text-xs text-gray-400">+{s.opsi.length - 4} opsi lainnya</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Tambah/Edit */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null) }}
        title={editing ? 'Edit Soal' : 'Tambah Soal Baru'}
        maxWidth="md:max-w-2xl"
        footer={
          <div className="flex gap-3">
            <button onClick={() => { setShowModal(false); setEditing(null) }} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
            <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">{editing ? 'Update' : 'Simpan'}</button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Row 1: Mapel + Tipe */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mata Pelajaran *</label>
              <select value={form.mapel_id} onChange={e => setForm({ ...form, mapel_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Pilih Mapel</option>
                {mapelList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipe Soal *</label>
              <select value={form.tipe} onChange={e => handleTipeChange(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg text-sm">
                {TIPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Level + Skor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Level Kognitif *</label>
              <select value={form.level_kognitif} onChange={e => setForm({ ...form, level_kognitif: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                {LEVEL_KOGNITIF.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Skor</label>
              <input type="number" min={0} value={form.skor} onChange={e => setForm({ ...form, skor: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          {/* KD + Indikator */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kompetensi Dasar</label>
            <input value={form.kompetensi_dasar} onChange={e => setForm({ ...form, kompetensi_dasar: e.target.value })} placeholder="Masukkan KD" className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Indikator</label>
            <input value={form.indikator} onChange={e => setForm({ ...form, indikator: e.target.value })} placeholder="Masukkan indikator" className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>

          {/* Soal */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Soal *</label>
            <textarea value={form.soal} onChange={e => setForm({ ...form, soal: e.target.value })} rows={4} placeholder="Tuliskan soal..." className="w-full px-3 py-2 border rounded-lg text-sm resize-y" />
          </div>

          {/* Opsi (for PG / PG Kompleks) */}
          {(form.tipe === 'pg' || form.tipe === 'pg_kompleks') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opsi Jawaban</label>
              <div className="space-y-2">
                {form.opsi.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                      {OPSI_LABELS[i]}
                    </span>
                    <input
                      value={o}
                      onChange={e => {
                        const newOpsi = [...form.opsi]
                        newOpsi[i] = e.target.value
                        setForm({ ...form, opsi: newOpsi })
                      }}
                      placeholder={`Opsi ${OPSI_LABELS[i]}`}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kunci Jawaban */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kunci Jawaban *</label>
            {form.tipe === 'pg' ? (
              <div className="flex gap-2 flex-wrap">
                {form.opsi.map((o, i) => o.trim() ? (
                  <label key={i} className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer transition-colors ${form.kunci_jawaban === OPSI_LABELS[i] ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-gray-50'}`}>
                    <input
                      type="radio"
                      name="kunci"
                      value={OPSI_LABELS[i]}
                      checked={form.kunci_jawaban === OPSI_LABELS[i]}
                      onChange={e => setForm({ ...form, kunci_jawaban: e.target.value })}
                      className="accent-primary"
                    />
                    <span className="font-medium">{OPSI_LABELS[i]}</span>
                  </label>
                ) : null)}
              </div>
            ) : form.tipe === 'pg_kompleks' ? (
              <div className="flex gap-2 flex-wrap">
                {form.opsi.map((o, i) => o.trim() ? (
                  <label key={i} className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer transition-colors ${(form.kunci_jawaban as string[]).includes(OPSI_LABELS[i]) ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      value={OPSI_LABELS[i]}
                      checked={(form.kunci_jawaban as string[]).includes(OPSI_LABELS[i])}
                      onChange={e => {
                        const arr = Array.isArray(form.kunci_jawaban) ? [...form.kunci_jawaban] : []
                        if (e.target.checked) arr.push(OPSI_LABELS[i])
                        else { const idx = arr.indexOf(OPSI_LABELS[i]); if (idx >= 0) arr.splice(idx, 1) }
                        setForm({ ...form, kunci_jawaban: arr })
                      }}
                      className="accent-primary"
                    />
                    <span className="font-medium">{OPSI_LABELS[i]}</span>
                  </label>
                ) : null)}
              </div>
            ) : form.tipe === 'isian' ? (
              <input value={form.kunci_jawaban as string} onChange={e => setForm({ ...form, kunci_jawaban: e.target.value })} placeholder="Jawaban singkat" className="w-full px-3 py-2 border rounded-lg text-sm" />
            ) : (
              <textarea value={form.kunci_jawaban as string} onChange={e => setForm({ ...form, kunci_jawaban: e.target.value })} rows={3} placeholder="Kunci jawaban uraian..." className="w-full px-3 py-2 border rounded-lg text-sm resize-y" />
            )}
          </div>

          {/* Pembahasan */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pembahasan</label>
            <textarea value={form.pembahasan} onChange={e => setForm({ ...form, pembahasan: e.target.value })} rows={3} placeholder="Pembahasan soal (opsional)..." className="w-full px-3 py-2 border rounded-lg text-sm resize-y" />
          </div>
        </div>
      </Modal>

      {/* Import Excel */}
      {showImport && (
        <ImportExcel
          title="Import Bank Soal"
          templateName="template-bank-soal.xlsx"
          headerRow={1}
          columnMap={{
            'Tipe (pg/pg_kompleks/isian/uraian)': 'tipe',
            'Level Kognitif (C1-C6)': 'level_kognitif',
            'Kompetensi Dasar': 'kompetensi_dasar',
            'Indikator': 'indikator',
            'Soal': 'soal',
            'Opsi A': 'opsi_a',
            'Opsi B': 'opsi_b',
            'Opsi C': 'opsi_c',
            'Opsi D': 'opsi_d',
            'Opsi E': 'opsi_e',
            'Kunci Jawaban': 'kunci_jawaban',
            'Skor': 'skor',
            'Pembahasan': 'pembahasan',
          }}
          sampleRows={[
            { tipe: 'pg', level_kognitif: 'C1', kompetensi_dasar: '3.1', indikator: 'Siswa mampu...', soal: 'Berapakah 2+2?', opsi_a: '3', opsi_b: '4', opsi_c: '5', opsi_d: '6', opsi_e: '', kunci_jawaban: 'B', skor: '1', pembahasan: '2+2=4' },
          ]}
          onImport={async (rows) => {
            let ok = 0, skip = 0
            for (const row of rows) {
              try {
                const opsi = [row.opsi_a, row.opsi_b, row.opsi_c, row.opsi_d, row.opsi_e].filter(Boolean)
                await api.post('/bank-soal', {
                  mapel_id: filterMapel || undefined,
                  tipe: row.tipe || 'pg',
                  level_kognitif: row.level_kognitif || 'C1',
                  kompetensi_dasar: row.kompetensi_dasar || '',
                  indikator: row.indikator || '',
                  soal: row.soal || '',
                  opsi,
                  kunci_jawaban: row.tipe === 'pg_kompleks' ? (row.kunci_jawaban || '').split(',').map((s: string) => s.trim()) : row.kunci_jawaban || '',
                  skor: parseInt(row.skor) || 1,
                  pembahasan: row.pembahasan || '',
                })
                ok++
              } catch { skip++ }
            }
            if (skip > 0) toast(`${ok} berhasil, ${skip} dilewati`, { icon: '⚠️' })
            fetchData()
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
