import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck, CheckCircle, Clock, FileEdit, Calendar, Loader2, Plus, Trash2, X,
  FileText, Image as ImageIcon, TrendingUp, Settings2, Save, Eye,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'
import ResponsiveTable from '../../components/ui/ResponsiveTable'

interface Butir { id: string; instrumen_id?: string; urutan: number; pertanyaan: string; indikator: string; max_skor: number }
interface Instrumen { id: string; aspek: string; nama: string; deskripsi: string; aktif: number; butir: Butir[] }
interface Sesi {
  id: string; instrumen_id: string; aspek: string; nama_terperiksa: string; jabatan: string
  supervisor_nama: string; tanggal: string; skor_total: number; skor_maks: number; persen: number
  predikat: string; catatan: string; rekomendasi: string; tindak_lanjut: string; status: string
}

const predikatClient = (persen: number) => persen >= 90 ? 'A (Sangat Baik)' : persen >= 80 ? 'B (Baik)' : persen >= 70 ? 'C (Cukup)' : 'D (Perlu Pembinaan)'
const labelAspek = (a: string) => a === 'akademik' ? 'Akademik' : a === 'manajerial' ? 'Manajerial' : a

export default function SupervisiPage() {
  const [tab, setTab] = useState<'penilaian' | 'instrumen' | 'tren' | 'aktivitas'>('penilaian')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Supervisi</h1>
        <p className="text-gray-500 text-sm mt-1">Penilaian akademik & manajerial, bank instrumen, laporan, dan tren.</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {([['penilaian', 'Penilaian'], ['instrumen', 'Instrumen'], ['tren', 'Tren'], ['aktivitas', 'Aktivitas Mengajar']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>{label}</button>
        ))}
      </div>

      {tab === 'penilaian' && <Penilaian />}
      {tab === 'instrumen' && <InstrumenBank />}
      {tab === 'tren' && <Tren />}
      {tab === 'aktivitas' && <Aktivitas />}
    </div>
  )
}

// ---------------------------------------------------------------- Penilaian

function Penilaian() {
  const today = todayWib()
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(today)
  const [aspek, setAspek] = useState('')
  const [sesi, setSesi] = useState<Sesi[]>([])
  const [instrumen, setInstrumen] = useState<Instrumen[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<{ sesi: Sesi; butir: Butir[]; skor: any[] } | null>(null)

  const [form, setForm] = useState({
    instrumen_id: '', nama_terperiksa: '', jabatan: '', tanggal: today, supervisor_nama: '',
    catatan: '', rekomendasi: '', tindak_lanjut: '', status: 'final' as 'draft' | 'final',
    skor: {} as Record<string, { skor: number; catatan: string }>,
  })

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const [s, ins] = await Promise.all([
        api.get('/supervisi/sesi', { params: { from, to, aspek: aspek || undefined } }),
        api.get('/supervisi/instrumen', { params: { aspek: aspek || undefined } }),
      ])
      setSesi(s.data.sesi || [])
      setInstrumen(ins.data.instrumen || [])
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memuat') }
    finally { setLoading(false) }
  }, [from, to, aspek])

  useEffect(() => { muat() }, [muat])

  const insTerpilih = useMemo(() => instrumen.find(i => i.id === form.instrumen_id) || null, [instrumen, form.instrumen_id])

  const nilai = useMemo(() => {
    if (!insTerpilih) return { total: 0, maks: 0, persen: 0 }
    const maks = insTerpilih.butir.reduce((a, b) => a + (b.max_skor || 4), 0)
    const total = insTerpilih.butir.reduce((a, b) => a + Math.min(Number(form.skor[b.id]?.skor) || 0, b.max_skor || 4), 0)
    return { total, maks, persen: maks > 0 ? Math.round((total / maks) * 1000) / 10 : 0 }
  }, [insTerpilih, form.skor])

  const bukaBuat = () => {
    const pilih = instrumen[0]
    setForm({
      instrumen_id: pilih?.id || '', nama_terperiksa: '', jabatan: '', tanggal: today, supervisor_nama: '',
      catatan: '', rekomendasi: '', tindak_lanjut: '', status: 'final', skor: {},
    })
    setOpen(true)
  }

  const buat = async () => {
    if (!form.instrumen_id) return toast.error('Pilih instrumen')
    if (!form.nama_terperiksa.trim()) return toast.error('Nama terperiksa wajib')
    setSaving(true)
    try {
      const skor = Object.entries(form.skor).map(([butir_id, v]) => ({ butir_id, skor: v.skor, catatan: v.catatan }))
      const res = await api.post('/supervisi/sesi', { ...form, skor })
      toast.success('Penilaian tersimpan — ' + res.data.sesi.predikat)
      setOpen(false); muat()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const lihat = async (s: Sesi) => {
    try { const res = await api.get('/supervisi/sesi/' + s.id); setDetail(res.data) }
    catch { toast.error('Gagal memuat detail') }
  }

  const unduh = async (s: Sesi, kind: 'pdf' | 'jpeg') => {
    try {
      const res = await api.get(`/supervisi/sesi/${s.id}/${kind}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = `supervisi-${s.aspek}-${s.tanggal}.${kind === 'pdf' ? 'pdf' : 'jpg'}`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch { toast.error('Gagal mengunduh ' + kind.toUpperCase()) }
  }

  const hapus = async (s: Sesi) => {
    if (!confirm('Hapus penilaian ' + s.nama_terperiksa + '?')) return
    try { await api.delete('/supervisi/sesi/' + s.id); toast.success('Dihapus'); muat() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menghapus') }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dari</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sampai</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Aspek</label>
          <select value={aspek} onChange={e => setAspek(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Semua</option>
            <option value="akademik">Akademik</option>
            <option value="manajerial">Manajerial</option>
          </select>
        </div>
        <button onClick={bukaBuat} className="sm:ml-auto px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex items-center gap-2">
          <Plus size={16} /> Penilaian Baru
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <ResponsiveTable<Sesi>
          columns={[
            { key: 'nama_terperiksa', header: 'Terperiksa', render: r => <div><span className="font-medium text-gray-800">{r.nama_terperiksa}</span><div className="text-xs text-gray-400">{r.jabatan || '—'}</div></div> },
            { key: 'aspek', header: 'Aspek', render: r => <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{labelAspek(r.aspek)}</span> },
            { key: 'persen', header: 'Capaian', render: r => <span className="font-semibold">{r.persen}%</span> },
            { key: 'predikat', header: 'Predikat', hideOnMobile: true, render: r => <span className="text-sm">{r.predikat}</span> },
            { key: 'tanggal', header: 'Tanggal', hideOnMobile: true, render: r => <span className="text-xs text-gray-500">{r.tanggal}</span> },
            { key: 'status', header: 'Status', hideOnMobile: true, render: r => <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'final' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.status === 'final' ? 'Final' : 'Draft'}</span> },
          ]}
          rows={sesi} rowKey={r => r.id}
          empty="Belum ada penilaian pada rentang ini."
          actions={r => (
            <div className="flex gap-2">
              <button onClick={() => lihat(r)} className="px-2 py-1 text-xs rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1"><Eye size={12} /> Detail</button>
              <button onClick={() => unduh(r, 'pdf')} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-1"><FileText size={12} /> PDF</button>
              <button onClick={() => unduh(r, 'jpeg')} className="px-2 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 inline-flex items-center gap-1"><ImageIcon size={12} /> JPEG</button>
              <button onClick={() => hapus(r)} className="px-2 py-1 text-xs rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100"><Trash2 size={12} /></button>
            </div>
          )}
        />
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Penilaian Supervisi Baru</h2>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Instrumen *</label>
                  <select value={form.instrumen_id} onChange={e => setForm({ ...form, instrumen_id: e.target.value, skor: {} })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {instrumen.map(i => <option key={i.id} value={i.id}>{labelAspek(i.aspek)} — {i.nama}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Terperiksa *</label>
                  <input value={form.nama_terperiksa} onChange={e => setForm({ ...form, nama_terperiksa: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jabatan</label>
                  <input value={form.jabatan} onChange={e => setForm({ ...form, jabatan: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal</label>
                  <input type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supervisor</label>
                  <input value={form.supervisor_nama} onChange={e => setForm({ ...form, supervisor_nama: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>

              {insTerpilih && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">Butir Penilaian ({insTerpilih.butir.length})</div>
                  <div className="divide-y">
                    {insTerpilih.butir.map((b, i) => (
                      <div key={b.id} className="p-3">
                        <p className="text-sm text-gray-800">{i + 1}. {b.pertanyaan}</p>
                        {b.indikator && <p className="text-xs text-gray-400 mt-0.5">{b.indikator}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Array.from({ length: b.max_skor || 4 }, (_, k) => k + 1).map(v => (
                            <button key={v} onClick={() => setForm(f => ({ ...f, skor: { ...f.skor, [b.id]: { skor: v, catatan: f.skor[b.id]?.catatan || '' } } }))}
                              className={`w-8 h-8 rounded-lg text-sm font-medium border ${form.skor[b.id]?.skor === v ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300'}`}>{v}</button>
                          ))}
                          <input value={form.skor[b.id]?.catatan || ''} onChange={e => setForm(f => ({ ...f, skor: { ...f.skor, [b.id]: { skor: f.skor[b.id]?.skor || 0, catatan: e.target.value } } }))}
                            placeholder="Catatan butir (opsional)" className="flex-1 min-w-[160px] px-2 py-1 border rounded-lg text-xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-gray-50 px-3 py-2 flex items-center gap-3 text-sm">
                    <span className="text-gray-500">Nilai sementara:</span>
                    <span className="font-semibold">{nilai.total}/{nilai.maks} ({nilai.persen}%)</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{predikatClient(nilai.persen)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Catatan Umum</label>
                  <textarea rows={3} value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rekomendasi</label>
                  <textarea rows={3} value={form.rekomendasi} onChange={e => setForm({ ...form, rekomendasi: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tindak Lanjut</label>
                  <textarea rows={3} value={form.tindak_lanjut} onChange={e => setForm({ ...form, tindak_lanjut: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })} className="px-3 py-2 border rounded-lg text-sm">
                  <option value="final">Final</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={buat} disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex justify-center items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan Penilaian
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Detail Penilaian</h2>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50 text-gray-600"><th className="border p-2 text-left">Butir</th><th className="border p-2 w-16">Skor</th><th className="border p-2 w-16">Maks</th><th className="border p-2 text-left">Catatan</th></tr></thead>
              <tbody>
                {detail.butir.map(b => {
                  const s = detail.skor.find((x: any) => x.butir_id === b.id)
                  return <tr key={b.id}><td className="border p-2">{b.pertanyaan}</td><td className="border p-2 text-center">{s ? s.skor : '-'}</td><td className="border p-2 text-center">{b.max_skor}</td><td className="border p-2 text-xs text-gray-500">{s?.catatan || ''}</td></tr>
                })}
              </tbody>
            </table>
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="font-semibold">{detail.sesi.skor_total}/{detail.sesi.skor_maks} ({detail.sesi.persen}%)</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{detail.sesi.predikat}</span>
            </div>
            {detail.sesi.rekomendasi && <p className="mt-3 text-sm text-gray-700"><strong>Rekomendasi:</strong> {detail.sesi.rekomendasi}</p>}
            {detail.sesi.tindak_lanjut && <p className="mt-1 text-sm text-gray-700"><strong>Tindak lanjut:</strong> {detail.sesi.tindak_lanjut}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={() => unduh(detail.sesi, 'pdf')} className="px-3 py-2 text-xs rounded-lg bg-red-50 text-red-600 inline-flex items-center gap-1"><FileText size={12} /> PDF</button>
              <button onClick={() => unduh(detail.sesi, 'jpeg')} className="px-3 py-2 text-xs rounded-lg bg-indigo-50 text-indigo-600 inline-flex items-center gap-1"><ImageIcon size={12} /> JPEG</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Instrumen

function InstrumenBank() {
  const [list, setList] = useState<Instrumen[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openIns, setOpenIns] = useState(false)
  const [formIns, setFormIns] = useState({ aspek: 'akademik', nama: '', deskripsi: '' })
  const [butirBaru, setButirBaru] = useState<Record<string, { pertanyaan: string; indikator: string; max_skor: number }>>({})

  const muat = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/supervisi/instrumen'); setList(r.data.instrumen || []) }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memuat instrumen') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { muat() }, [muat])

  const simpanInstrumen = async () => {
    if (!formIns.nama.trim()) return toast.error('Nama instrumen wajib')
    setSaving(true)
    try { await api.post('/supervisi/instrumen', formIns); toast.success('Instrumen dibuat'); setOpenIns(false); setFormIns({ aspek: 'akademik', nama: '', deskripsi: '' }); muat() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
    finally { setSaving(false) }
  }

  const hapusInstrumen = async (i: Instrumen) => {
    if (!confirm('Hapus instrumen "' + i.nama + '" beserta butirnya?')) return
    try { await api.delete('/supervisi/instrumen/' + i.id); toast.success('Dihapus'); muat() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  const tambahButir = async (id: string) => {
    const b = butirBaru[id]
    if (!b || !b.pertanyaan.trim()) return toast.error('Tulis pertanyaan butir')
    try {
      await api.post(`/supervisi/instrumen/${id}/butir`, b)
      setButirBaru(s => ({ ...s, [id]: { pertanyaan: '', indikator: '', max_skor: 4 } })); muat(); toast.success('Butir ditambahkan')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  const hapusButir = async (bid: string) => {
    if (!confirm('Hapus butir ini?')) return
    try { await api.delete('/supervisi/butir/' + bid); muat() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  if (loading) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setOpenIns(true)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex items-center gap-2"><Plus size={16} /> Instrumen Baru</button>
      </div>

      {list.map(ins => (
        <div key={ins.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-800 text-sm">{ins.nama}</p>
              <p className="text-xs text-gray-500">{labelAspek(ins.aspek)} · {ins.butir.length} butir</p>
            </div>
            <button onClick={() => hapusInstrumen(ins)} className="px-2 py-1 text-xs rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100"><Trash2 size={12} /></button>
          </div>
          <div className="divide-y">
            {ins.butir.map((b, i) => (
              <div key={b.id} className="px-4 py-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-800">{i + 1}. {b.pertanyaan}</p>
                  {b.indikator && <p className="text-xs text-gray-400">{b.indikator}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400">maks {b.max_skor}</span>
                  <button onClick={() => hapusButir(b.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            {ins.butir.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">Belum ada butir.</p>}
          </div>
          <div className="p-3 bg-gray-50/50 flex flex-col sm:flex-row gap-2">
            <input value={butirBaru[ins.id]?.pertanyaan || ''} onChange={e => setButirBaru(s => ({ ...s, [ins.id]: { ...(s[ins.id] || { indikator: '', max_skor: 4 }), pertanyaan: e.target.value } }))}
              placeholder="Pertanyaan butir baru" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
            <input value={butirBaru[ins.id]?.indikator || ''} onChange={e => setButirBaru(s => ({ ...s, [ins.id]: { ...(s[ins.id] || { pertanyaan: '', max_skor: 4 }), indikator: e.target.value } }))}
              placeholder="Indikator" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
            <input type="number" min={1} max={10} value={butirBaru[ins.id]?.max_skor || 4} onChange={e => setButirBaru(s => ({ ...s, [ins.id]: { ...(s[ins.id] || { pertanyaan: '', indikator: '' }), max_skor: Number(e.target.value) } }))}
              className="w-20 px-2 py-2 border rounded-lg text-sm" />
            <button onClick={() => tambahButir(ins.id)} className="px-3 py-2 bg-primary text-white rounded-lg text-sm inline-flex items-center gap-1"><Plus size={14} /> Butir</button>
          </div>
        </div>
      ))}

      {openIns && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Instrumen Baru</h2>
              <button onClick={() => setOpenIns(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Aspek</label>
                <select value={formIns.aspek} onChange={e => setFormIns({ ...formIns, aspek: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="akademik">Akademik</option>
                  <option value="manajerial">Manajerial</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama *</label>
                <input value={formIns.nama} onChange={e => setFormIns({ ...formIns, nama: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
                <textarea rows={2} value={formIns.deskripsi} onChange={e => setFormIns({ ...formIns, deskripsi: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpenIns(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={simpanInstrumen} disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex justify-center items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Tren

function Tren() {
  const today = todayWib()
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`)
  const [to, setTo] = useState(today)
  const [tren, setTren] = useState<{ per_bulan: any[]; per_aspek: any[] }>({ per_bulan: [], per_aspek: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/supervisi/tren', { params: { from, to } })
      .then(r => setTren(r.data.tren || { per_bulan: [], per_aspek: [] }))
      .catch(() => setTren({ per_bulan: [], per_aspek: [] }))
      .finally(() => setLoading(false))
  }, [from, to])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex gap-3 sm:items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dari</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sampai</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      {loading ? <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3 text-gray-700"><TrendingUp size={16} /><h2 className="font-semibold text-sm">Tren per Bulan</h2></div>
            {tren.per_bulan.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">Belum ada data.</p> : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 border-b"><th className="text-left py-2">Bulan</th><th className="text-center py-2">Jumlah</th><th className="text-center py-2">Rata-rata</th><th className="text-center py-2">≥80</th></tr></thead>
                <tbody className="divide-y">
                  {tren.per_bulan.map(b => (
                    <tr key={b.bulan}><td className="py-2">{b.bulan}</td><td className="text-center">{b.jumlah}</td><td className="text-center font-medium">{b.rata_persen}%</td><td className="text-center text-green-600">{b.baik}</td></tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3 text-gray-700"><Settings2 size={16} /><h2 className="font-semibold text-sm">Per Aspek</h2></div>
            {tren.per_aspek.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">Belum ada data.</p> : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 border-b"><th className="text-left py-2">Aspek</th><th className="text-center py-2">Jumlah</th><th className="text-center py-2">Rata-rata</th></tr></thead>
                <tbody className="divide-y">
                  {tren.per_aspek.map((a, i) => (
                    <tr key={i}><td className="py-2">{a.label || labelAspek(a.aspek)}</td><td className="text-center">{a.jumlah}</td><td className="text-center font-medium">{a.rata_persen}%</td></tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Aktivitas (rekap jurnal)

function Aktivitas() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const today = todayWib()
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(today)

  useEffect(() => {
    setLoading(true)
    api.get('/supervisi/rekap', { params: { from, to } })
      .then(res => setData(Array.isArray(res.data) ? res.data : (res.data.rekap || [])))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [from, to])

  const totalJurnal = data.reduce((a, g) => a + (g.total_jurnal || 0), 0)
  const totalApproved = data.reduce((a, g) => a + (g.approved || 0), 0)
  const totalPending = data.reduce((a, g) => a + (g.submitted || 0), 0)
  const aktif = data.filter(g => (g.total_jurnal || 0) > 0).length

  const stats = [
    { label: 'Guru Aktif Mengajar', value: `${aktif}/${data.length}`, icon: <ClipboardCheck size={20} />, color: 'text-blue-600 bg-blue-100' },
    { label: 'Total Jurnal', value: totalJurnal, icon: <FileEdit size={20} />, color: 'text-purple-600 bg-purple-100' },
    { label: 'Disetujui', value: totalApproved, icon: <CheckCircle size={20} />, color: 'text-green-600 bg-green-100' },
    { label: 'Menunggu Approval', value: totalPending, icon: <Clock size={20} />, color: 'text-amber-600 bg-amber-100' },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dari Tanggal</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sampai Tanggal</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
            <p className="text-2xl font-bold text-gray-800 mt-3">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50"><h2 className="font-semibold text-gray-800 text-sm">Rekap Aktivitas per Guru</h2></div>
        <ResponsiveTable<any>
          columns={[
            { key: 'guru_nama', header: 'Nama Guru', render: g => <span className="font-medium text-gray-800">{g.guru_nama}</span> },
            { key: 'nip', header: 'NIP', hideOnMobile: true, render: g => <span className="font-mono text-xs text-gray-500">{g.nip || '-'}</span> },
            { key: 'total_jurnal', header: 'Total', render: g => <span className="font-semibold">{g.total_jurnal}</span> },
            { key: 'approved', header: 'Disetujui', render: g => <span className="text-green-600">{g.approved}</span> },
            { key: 'submitted', header: 'Pending', render: g => <span className="text-amber-600">{g.submitted}</span> },
            { key: 'draft', header: 'Draft', hideOnMobile: true, render: g => <span className="text-gray-400">{g.draft}</span> },
            { key: 'terakhir_mengajar', header: 'Terakhir', hideOnMobile: true, render: g => g.terakhir_mengajar ? <span className="text-gray-600 inline-flex items-center gap-1"><Calendar size={12} />{g.terakhir_mengajar}</span> : <span className="text-red-400">Belum mengajar</span> },
          ]}
          rows={data} rowKey={g => g.guru_id || g.guru_nama}
          empty="Belum ada data"
        />
      </div>
    </div>
  )
}