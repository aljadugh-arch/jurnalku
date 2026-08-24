import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, FileText, Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

type DocumentType = 'STS' | 'SAS' | 'LKPD' | 'PROTA' | 'PROMES' | 'ACP' | 'ATP' | 'MODUL_AJAR' | 'KISI_KISI'
type GenerationMode = 'ai' | 'template'
type HistoryItem = { id: string; type: DocumentType; title: string; subject: string; grade: string; topic: string; generation_mode: GenerationMode; created_at: string }

const documentTypes: { value: DocumentType; label: string; hint: string }[] = [
  { value: 'STS', label: 'Soal STS', hint: 'Sumatif Tengah Semester' },
  { value: 'SAS', label: 'Soal SAS', hint: 'Sumatif Akhir Semester' },
  { value: 'LKPD', label: 'LKPD', hint: 'Lembar Kerja Peserta Didik' },
  { value: 'PROTA', label: 'PROTA', hint: 'Program Tahunan' },
  { value: 'PROMES', label: 'PROMES', hint: 'Program Semester' },
  { value: 'ACP', label: 'ACP', hint: 'Analisis Capaian Pembelajaran' },
  { value: 'ATP', label: 'ATP', hint: 'Alur Tujuan Pembelajaran' },
  { value: 'MODUL_AJAR', label: 'Modul Ajar', hint: 'Perencanaan pembelajaran lengkap' },
  { value: 'KISI_KISI', label: 'Kisi-kisi', hint: 'Kisi-kisi soal dan level kognitif' },
]

const initialForm = {
  type: 'STS' as DocumentType,
  mode: 'ai' as GenerationMode,
  subject: '', grade: '', topic: '', curriculum: 'Kurikulum Merdeka', semester: 'Ganjil', academicYear: '2026/2027',
  schoolName: '', teacherName: '', printDate: new Date().toISOString().slice(0, 10), timeAllocation: '2 JP', activityType: 'Diskusi dan pemecahan masalah',
  multipleChoiceCount: 20, essayCount: 5,
}

export default function GuruModulAjarPage() {
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const selected = useMemo(() => documentTypes.find(item => item.value === form.type)!, [form.type])
  const assessment = ['STS', 'SAS', 'KISI_KISI'].includes(form.type)

  const loadHistory = () => { api.get('/ai-documents').then(({ data }) => setHistory(data)).catch(() => {}) }
  useEffect(() => { loadHistory() }, [])

  const generate = async () => {
    if (!form.subject || !form.grade || !form.topic) return toast.error('Mata pelajaran, kelas, dan materi wajib diisi')
    setLoading(true)
    try {
      const { data } = await api.post('/ai-documents/generate', form)
      setResult(data.content)
      setDocumentId(data.id)
      loadHistory()
      toast.success(`${selected.label} berhasil dibuat dengan ${form.mode === 'ai' ? 'AI' : 'template siap edit'}`)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal membuat dokumen')
    } finally { setLoading(false) }
  }

  const openHistory = async (id: string) => {
    try {
      const { data } = await api.get(`/ai-documents/${id}`)
      setForm(prev => ({ ...prev, ...data.metadata, type: data.type, mode: data.generation_mode || data.metadata?.mode || 'ai' }))
      setResult(data.content)
      setDocumentId(data.id)
    } catch { toast.error('Gagal membuka dokumen') }
  }

  const exportDocx = async () => {
    if (!result) return
    setExporting(true)
    try {
      const { data, headers } = await api.post('/ai-documents/export-docx', documentId ? { id: documentId } : { ...form, content: result }, { responseType: 'blob' })
      const disposition = String(headers['content-disposition'] || '')
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${form.type}-${form.subject}.docx`
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
      toast.success('DOCX berhasil dibuat')
    } catch { toast.error('Gagal mengekspor DOCX') }
    finally { setExporting(false) }
  }

  const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400'

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Generator Administrasi Guru Hybrid</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Pilih bantuan AI atau bundle template lama yang cepat dan siap diedit.</p>
    </div>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {documentTypes.map(item => <button key={item.value} type="button" onClick={() => { setForm(prev => ({ ...prev, type: item.value })); setResult(''); setDocumentId('') }} className={`min-h-24 rounded-xl border p-3 text-left transition ${form.type === item.value ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-primary/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
        <FileText size={18} /><strong className="mt-2 block text-sm">{item.label}</strong><span className="mt-1 block text-[11px] opacity-70">{item.hint}</span>
      </button>)}
    </div>

    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 font-semibold text-gray-800 dark:text-slate-100">Pilih Mode Generator</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setForm(prev => ({ ...prev, mode: 'ai' }))} className={`rounded-xl border p-4 text-left ${form.mode === 'ai' ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-gray-200 dark:border-slate-700'}`}><Sparkles size={20} className="text-primary" /><strong className="mt-2 block text-sm dark:text-slate-100">Buat dengan AI</strong><span className="mt-1 block text-xs text-gray-500 dark:text-slate-400">AI menyusun konten baru sesuai mapel, kelas, dan materi.</span></button>
            <button type="button" onClick={() => setForm(prev => ({ ...prev, mode: 'template' }))} className={`rounded-xl border p-4 text-left ${form.mode === 'template' ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20 dark:bg-emerald-950/30' : 'border-gray-200 dark:border-slate-700'}`}><FileText size={20} className="text-emerald-600" /><strong className="mt-2 block text-sm dark:text-slate-100">Pakai Bundle Template Lama</strong><span className="mt-1 block text-xs text-gray-500 dark:text-slate-400">Format deterministik siap isi dan edit, tanpa menunggu layanan AI.</span></button>
          </div>
        </section>
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <h2 className="mb-5 flex items-center gap-2 font-semibold text-gray-800 dark:text-slate-100"><BookOpen size={18} className="text-primary" /> Informasi {selected.label}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label><span className={labelClass}>Mata Pelajaran</span><input className={inputClass} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Contoh: Matematika" /></label>
            <label><span className={labelClass}>Kelas / Fase</span><input className={inputClass} value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} placeholder="Contoh: Kelas VIII / Fase D" /></label>
            <label className="sm:col-span-2"><span className={labelClass}>Materi / Topik</span><textarea className={inputClass} rows={3} value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="Tuliskan ruang lingkup materi dengan jelas" /></label>
            <label><span className={labelClass}>Kurikulum</span><select className={inputClass} value={form.curriculum} onChange={e => setForm({ ...form, curriculum: e.target.value })}><option>Kurikulum Merdeka</option><option>Kurikulum 2013</option><option>Kurikulum Berbasis Cinta</option></select></label>
            <label><span className={labelClass}>Semester</span><select className={inputClass} value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })}><option>Ganjil</option><option>Genap</option></select></label>
            <label><span className={labelClass}>Tahun Pelajaran</span><input className={inputClass} value={form.academicYear} onChange={e => setForm({ ...form, academicYear: e.target.value })} /></label>
            <label><span className={labelClass}>Nama Lembaga</span><input className={inputClass} value={form.schoolName} onChange={e => setForm({ ...form, schoolName: e.target.value })} placeholder="Diambil untuk kop dokumen" /></label>
            <label><span className={labelClass}>Nama Pengajar</span><input className={inputClass} value={form.teacherName} onChange={e => setForm({ ...form, teacherName: e.target.value })} /></label>
            <label><span className={labelClass}>Tanggal Cetak</span><input type="date" className={inputClass} value={form.printDate} onChange={e => setForm({ ...form, printDate: e.target.value })} /></label>
          </div>

          {assessment && <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4 dark:bg-slate-800/70">
            <label><span className={labelClass}>Pilihan Ganda</span><input type="number" min="0" max="100" className={inputClass} value={form.multipleChoiceCount} onChange={e => setForm({ ...form, multipleChoiceCount: Number(e.target.value) })} /></label>
            <label><span className={labelClass}>Uraian</span><input type="number" min="0" max="30" className={inputClass} value={form.essayCount} onChange={e => setForm({ ...form, essayCount: Number(e.target.value) })} /></label>
          </div>}

          {form.type === 'LKPD' && <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"><label><span className={labelClass}>Jenis Aktivitas</span><input className={inputClass} value={form.activityType} onChange={e => setForm({ ...form, activityType: e.target.value })} /></label><label><span className={labelClass}>Alokasi Waktu</span><input className={inputClass} value={form.timeAllocation} onChange={e => setForm({ ...form, timeAllocation: e.target.value })} /></label></div>}
        </section>

        <button onClick={generate} disabled={loading} className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50 ${form.mode === 'ai' ? 'bg-gradient-to-r from-primary to-blue-700' : 'bg-emerald-600'}`}>{loading ? <><Loader2 size={18} className="animate-spin" /> {form.mode === 'ai' ? 'AI sedang menyusun...' : 'Menyiapkan template...'}</> : form.mode === 'ai' ? <><Sparkles size={18} /> Buat {selected.label} dengan AI</> : <><FileText size={18} /> Pakai Template {selected.label}</>}</button>

        {result && <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800"><h2 className="font-semibold text-gray-800 dark:text-slate-100">Hasil {selected.label}</h2><button onClick={exportDocx} disabled={exporting} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50">{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export DOCX</button></div>
          <textarea value={result} onChange={e => { setResult(e.target.value); setDocumentId('') }} className="min-h-[520px] w-full resize-y bg-transparent p-5 font-mono text-sm leading-7 text-gray-700 outline-none dark:text-slate-200 sm:p-6" aria-label="Hasil dokumen yang dapat diedit" />
        </section>}
      </div>

      <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-4">
        <h2 className="mb-3 font-semibold text-gray-800 dark:text-slate-100">Riwayat Generate</h2>
        <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">{history.length === 0 && <p className="text-sm text-gray-400">Belum ada dokumen.</p>}{history.map(item => <button key={item.id} onClick={() => openHistory(item.id)} className="w-full rounded-xl border border-gray-100 p-3 text-left hover:border-primary/40 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"><span className="flex items-center justify-between gap-2 text-[10px] font-bold text-primary"><span>{item.type}</span><span className={item.generation_mode === 'template' ? 'text-emerald-600' : 'text-violet-600'}>{item.generation_mode === 'template' ? 'TEMPLATE' : 'AI'}</span></span><strong className="mt-1 block text-sm text-gray-800 dark:text-slate-100">{item.subject} — {item.grade}</strong><span className="mt-1 line-clamp-2 block text-xs text-gray-500">{item.topic}</span></button>)}</div>
      </aside>
    </div>
  </div>
}
