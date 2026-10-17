import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, FileText, Image as ImageIcon, Trash2, X, Search, Save, Eye, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ResponsiveTable from '../../components/ui/ResponsiveTable'

interface FieldDef { key: string; label: string; type: string }
interface Jenis { id: string; kode: string; nama: string; kategori: string; fields: FieldDef[]; template: string; aktif: number; urutan: number }
interface Surat { id: string; jenis_id: string; kode: string; nomor: string; perihal: string; kepada: string; data: string; tanggal: string; penandatangan: string; created_at: string }

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function AdministrasiPage() {
  const [tab, setTab] = useState<'surat' | 'template'>('surat')
  const [jenis, setJenis] = useState<Jenis[]>([])
  const [surat, setSurat] = useState<Surat[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKode, setFilterKode] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  const [form, setForm] = useState({ jenis_id: '', perihal: '', kepada: '', tanggal: todayIso(), penandatangan: '', data: {} as Record<string, string> })

  // Template editor
  const [editJenis, setEditJenis] = useState<Jenis | null>(null)
  const [tpl, setTpl] = useState({ nama: '', kategori: '', template: '' })
  // Impor template dari Word/Excel/PDF
  const [impor, setImpor] = useState<{ jenis: string; peringatan: string[]; placeholder: string[] } | null>(null)
  const [mengimpor, setMengimpor] = useState(false)
  const imporRef = useRef<HTMLInputElement>(null)

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const [j, s] = await Promise.all([
        api.get('/administrasi/jenis'),
        api.get('/administrasi/surat', { params: { kode: filterKode || undefined, q: q || undefined } }),
      ])
      setJenis(j.data.jenis || [])
      setSurat(s.data.surat || [])
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memuat data') }
    finally { setLoading(false) }
  }, [filterKode, q])

  useEffect(() => { muat() }, [muat])

  const jenisTerpilih = useMemo(() => jenis.find(j => j.id === form.jenis_id) || null, [jenis, form.jenis_id])

  const bukaBuat = (j?: Jenis) => {
    const pilih = j || jenis[0]
    setForm({ jenis_id: pilih?.id || '', perihal: pilih?.nama || '', kepada: '', tanggal: todayIso(), penandatangan: '', data: {} })
    setOpen(true)
  }

  const pilihJenis = (id: string) => {
    const j = jenis.find(x => x.id === id)
    setForm(f => ({ ...f, jenis_id: id, perihal: j?.nama || f.perihal, data: {} }))
  }

  const buat = async () => {
    if (!form.jenis_id) return toast.error('Pilih jenis surat')
    setSaving(true)
    try {
      const res = await api.post('/administrasi/surat', form)
      toast.success('Surat dibuat: ' + res.data.surat.nomor)
      setOpen(false); muat()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal membuat surat') }
    finally { setSaving(false) }
  }

  const unduh = async (s: Surat, kind: 'pdf' | 'jpeg') => {
    try {
      const res = await api.get(`/administrasi/surat/${s.id}/${kind}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `surat-${s.nomor.replace(/[^a-zA-Z0-9]/g, '-')}.${kind === 'pdf' ? 'pdf' : 'jpg'}`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e: any) { toast.error('Gagal mengunduh ' + kind.toUpperCase()) }
  }

  const lihat = async (s: Surat) => {
    try {
      const res = await api.get('/administrasi/surat/' + s.id)
      setPreviewHtml(res.data.html)
    } catch { toast.error('Gagal memuat pratinjau') }
  }

  const hapus = async (s: Surat) => {
    if (!confirm('Hapus surat ' + s.nomor + '?')) return
    try { await api.delete('/administrasi/surat/' + s.id); toast.success('Dihapus'); muat() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menghapus') }
  }

  const imporTemplate = async (file: File | undefined) => {
    if (!file) return
    setMengimpor(true)
    setImpor(null)
    try {
      const fd = new FormData()
      fd.append('berkas', file)
      const { data } = await api.post('/administrasi/jenis/impor', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setTpl(t => ({ ...t, template: data.html }))
      setImpor({ jenis: data.jenis, peringatan: data.peringatan || [], placeholder: data.placeholder_terdeteksi || [] })
      toast.success(`Template diimpor dari ${data.jenis.toUpperCase()}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal mengimpor template.')
    } finally {
      setMengimpor(false)
      if (imporRef.current) imporRef.current.value = ''
    }
  }

  const simpanTemplate = async () => {
    if (!editJenis) return
    setSaving(true)
    try {
      await api.put('/administrasi/jenis/' + editJenis.id, { nama: tpl.nama, kategori: tpl.kategori, template: tpl.template })
      toast.success('Template disimpan'); setEditJenis(null); muat()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  if (loading && jenis.length === 0) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Administrasi</h1>
          <p className="text-gray-500 text-sm mt-1">Surat-menyurat lembaga: keterangan, tugas, undangan, dan perjalanan dinas.</p>
        </div>
        <button onClick={() => bukaBuat()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex items-center gap-2">
          <Plus size={16} /> Buat Surat
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['surat', 'template'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
            {t === 'surat' ? 'Surat Keluar' : 'Template Surat'}
          </button>
        ))}
      </div>

      {tab === 'surat' && (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
            <select value={filterKode} onChange={e => setFilterKode(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Semua jenis</option>
              {jenis.map(j => <option key={j.id} value={j.kode}>{j.nama}</option>)}
            </select>
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nomor / perihal / tujuan" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <ResponsiveTable<Surat>
              columns={[
                { key: 'nomor', header: 'Nomor', render: r => <span className="font-mono text-xs">{r.nomor}</span> },
                { key: 'perihal', header: 'Perihal', render: r => <span className="font-medium text-gray-800">{r.perihal || r.kode}</span> },
                { key: 'kepada', header: 'Tujuan', hideOnMobile: true, render: r => <span className="text-sm">{r.kepada || '—'}</span> },
                { key: 'tanggal', header: 'Tanggal', hideOnMobile: true, render: r => <span className="text-xs text-gray-500">{r.tanggal}</span> },
              ]}
              rows={surat} rowKey={r => r.id}
              empty="Belum ada surat. Klik 'Buat Surat'."
              actions={r => (
                <div className="flex gap-2">
                  <button onClick={() => lihat(r)} className="px-2 py-1 text-xs rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1"><Eye size={12} /> Lihat</button>
                  <button onClick={() => unduh(r, 'pdf')} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-1"><FileText size={12} /> PDF</button>
                  <button onClick={() => unduh(r, 'jpeg')} className="px-2 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 inline-flex items-center gap-1"><ImageIcon size={12} /> JPEG</button>
                  <button onClick={() => hapus(r)} className="px-2 py-1 text-xs rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100"><Trash2 size={12} /></button>
                </div>
              )}
            />
          </div>
        </>
      )}

      {tab === 'template' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {jenis.map(j => (
            <div key={j.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{j.nama}</p>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{j.kode} · {j.kategori}</p>
                </div>
                <button onClick={() => { setEditJenis(j); setTpl({ nama: j.nama, kategori: j.kategori, template: j.template }) }}
                  className="px-2 py-1 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20">Edit</button>
              </div>
              <p className="text-xs text-gray-400 mt-2">{j.fields.length} field terisi otomatis · template HTML</p>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Buat Surat</h2>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Jenis Surat *</label>
                <select value={form.jenis_id} onChange={e => pilihJenis(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih jenis --</option>
                  {jenis.map(j => <option key={j.id} value={j.id}>{j.nama}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal</label>
                  <input type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Penandatangan (opsional)</label>
                  <input value={form.penandatangan} onChange={e => setForm({ ...form, penandatangan: e.target.value })} placeholder="Kepala madrasah" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Perihal</label>
                <input value={form.perihal} onChange={e => setForm({ ...form, perihal: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              {jenisTerpilih && jenisTerpilih.fields.length > 0 && (
                <div className="border-t pt-3 mt-1">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Isi Surat</p>
                  <div className="space-y-3">
                    {jenisTerpilih.fields.map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                        {f.type === 'textarea' ? (
                          <textarea rows={2} value={form.data[f.key] || ''} onChange={e => setForm({ ...form, data: { ...form.data, [f.key]: e.target.value } })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        ) : (
                          <input type={f.type === 'date' ? 'date' : 'text'} value={form.data[f.key] || ''} onChange={e => setForm({ ...form, data: { ...form.data, [f.key]: e.target.value } })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={buat} disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex justify-center items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Buat & Nomori
              </button>
            </div>
          </div>
        </div>
      )}

      {editJenis && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit Template — {editJenis.kode}</h2>
              <button onClick={() => setEditJenis(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama</label>
                  <input value={tpl.nama} onChange={e => setTpl({ ...tpl, nama: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
                  <input value={tpl.kategori} onChange={e => setTpl({ ...tpl, kategori: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">Template HTML</label>
                  <div className="flex items-center gap-1.5">
                    <input ref={imporRef} type="file" accept=".docx,.xlsx,.xls,.pdf,.txt"
                      onChange={e => imporTemplate(e.target.files?.[0])}
                      className="hidden" />
                    <button type="button" onClick={() => imporRef.current?.click()} disabled={mengimpor}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
                      {mengimpor ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      Impor dari Word/Excel/PDF
                    </button>
                  </div>
                </div>
                <textarea rows={12} value={tpl.template} onChange={e => setTpl({ ...tpl, template: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs font-mono" />
                <p className="text-xs text-gray-400 mt-1">{'Placeholder: ' + editJenis.fields.map(f => '{{' + f.key + '}}').join(' ') + ' {{nomor}} {{tanggal_surat}} {{nama_lembaga}}'}</p>
                {impor && (
                  <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[11px] text-blue-800 space-y-1">
                    <p className="font-semibold">Diimpor dari {impor.jenis.toUpperCase()}</p>
                    {impor.placeholder.length > 0 && <p>Placeholder terdeteksi: {impor.placeholder.map(p => '{{' + p + '}}').join(', ')}</p>}
                    {impor.peringatan.map((w, i) => <p key={i}>• {w}</p>)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditJenis(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={simpanTemplate} disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex justify-center items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {previewHtml && (
        <div className="fixed inset-0 bg-black/50 z-[115] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-bold text-gray-800 text-sm">Pratinjau Surat</h2>
              <button onClick={() => setPreviewHtml(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <iframe title="pratinjau-surat" srcDoc={previewHtml} className="w-full flex-1 min-h-[70vh] bg-white" />
          </div>
        </div>
      )}
    </div>
  )
}