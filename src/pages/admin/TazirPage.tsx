import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

interface Tazir { id: string; siswa_id: string; nama: string; nis?: string; jenis_pelanggaran: string; keterangan?: string; tindakan?: string; tanggal: string; status: string }
interface Siswa { id: string; nama: string; nis?: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  diproses: { label: 'Diproses', cls: 'bg-amber-100 text-amber-700' },
  selesai: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-700' },
  batal: { label: 'Batal', cls: 'bg-slate-100 text-slate-600' },
}

export default function TazirPage() {
  const [data, setData] = useState<Tazir[]>([])
  const [siswa, setSiswa] = useState<Siswa[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ siswa_id: '', jenis_pelanggaran: '', keterangan: '', tindakan: '', tanggal: todayWib().slice(0, 10) })

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const [t, s] = await Promise.all([
        api.get('/tazir', { params: filter ? { status: filter } : {} }),
        api.get('/siswa').catch(() => ({ data: [] as Siswa[] })),
      ])
      setData(t.data || []); setSiswa(Array.isArray(s.data) ? s.data : [])
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal memuat data') }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { muat() }, [muat])

  const simpan = async () => {
    if (!form.siswa_id || !form.jenis_pelanggaran || !form.tanggal) return toast.error('Lengkapi santri, pelanggaran & tanggal')
    try { await api.post('/tazir', form); toast.success('Pelanggaran tercatat — notifikasi WA wali terkirim'); setModal(false); setForm({ siswa_id: '', jenis_pelanggaran: '', keterangan: '', tindakan: '', tanggal: todayWib().slice(0, 10) }); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const setStatus = async (t: Tazir, status: string) => {
    try { await api.put(`/tazir/${t.id}`, { status }); toast.success('Status diperbarui'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const hapus = async (t: Tazir) => {
    if (!confirm(`Hapus catatan pelanggaran ${t.nama}?`)) return
    try { await api.delete(`/tazir/${t.id}`); toast.success('Dihapus'); muat() } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle size={22} className="text-amber-500" />Ta'zir & Kedisiplinan Santri</h1>
          <p className="text-sm text-slate-500 mt-1">Catat pelanggaran santri, tindakan, dan status penanganannya. Wali menerima notifikasi WhatsApp.</p>
        </div>
        <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          <Plus size={18} /> Catat Pelanggaran
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-5 flex-wrap">
        {['', 'diproses', 'selesai', 'batal'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === s ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}>
            {s === '' ? 'Semua' : (STATUS[s]?.label || s)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-4 py-2.5 font-medium">Santri</th><th className="px-4 py-2.5 font-medium">Pelanggaran</th><th className="px-4 py-2.5 font-medium">Tanggal</th><th className="px-4 py-2.5 font-medium">Tindakan</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody>
            {data.map(t => (
              <tr key={t.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3"><div className="font-medium text-slate-800">{t.nama}</div><div className="text-xs text-slate-400">{t.nis || ''}</div></td>
                <td className="px-4 py-3 text-slate-700 font-medium">{t.jenis_pelanggaran}{t.keterangan && <div className="text-xs text-slate-400 font-normal mt-0.5">{t.keterangan}</div>}</td>
                <td className="px-4 py-3 text-slate-600">{t.tanggal}</td>
                <td className="px-4 py-3 text-slate-600">{t.tindakan || '—'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS[t.status]?.cls || ''}`}>{STATUS[t.status]?.label || t.status}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="inline-flex gap-1.5">
                    {t.status === 'diproses' && <button onClick={() => setStatus(t, 'selesai')} className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1"><CheckCircle size={13} />Selesai</button>}
                    {t.status !== 'batal' && <button onClick={() => setStatus(t, 'batal')} className="text-xs text-slate-500 hover:underline inline-flex items-center gap-1"><XCircle size={13} />Batal</button>}
                    <button onClick={() => hapus(t)} className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1"><Trash2 size={13} />Hapus</button>
                  </span>
                </td>
              </tr>
            ))}
            {!loading && data.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Tidak ada catatan pelanggaran.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Catat Pelanggaran</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Santri</label>
                <select value={form.siswa_id} onChange={e => setForm(f => ({ ...f, siswa_id: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400">
                  <option value="">— pilih santri —</option>
                  {siswa.map(s => <option key={s.id} value={s.id}>{s.nama}{s.nis ? ` (${s.nis})` : ''}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Jenis Pelanggaran</label><input value={form.jenis_pelanggaran} onChange={e => setForm(f => ({ ...f, jenis_pelanggaran: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" placeholder="Berkelahi, telat, dll." /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Tanggal</label><input type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Tindakan</label><input value={form.tindakan} onChange={e => setForm(f => ({ ...f, tindakan: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" placeholder="Peringatan, hafalan, dll." /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Keterangan</label><textarea value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" rows={2} /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={simpan} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-medium">Simpan</button><button onClick={() => setModal(false)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600">Batal</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
