import { useCallback, useEffect, useState } from 'react'
import { Plus, CheckCircle, XCircle, Clock, RefreshCw, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

interface Izin { id: string; siswa_id: string; nama: string; nis?: string; kamar?: string; no_hp_wali?: string; nama_ortu?: string; tanggal_pulang: string; tanggal_kembali: string; alasan?: string; status: string; catatan_admin?: string; created_at: string }
interface Siswa { id: string; nama: string; nis?: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  diajukan: { label: 'Diajukan', cls: 'bg-amber-100 text-amber-700' },
  disetujui: { label: 'Disetujui', cls: 'bg-emerald-100 text-emerald-700' },
  ditolak: { label: 'Ditolak', cls: 'bg-rose-100 text-rose-700' },
  selesai: { label: 'Selesai', cls: 'bg-slate-100 text-slate-600' },
}

export default function PerizinanPage() {
  const [izin, setIzin] = useState<Izin[]>([])
  const [siswa, setSiswa] = useState<Siswa[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ siswa_id: '', tanggal_pulang: '', tanggal_kembali: '', alasan: '' })

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const [i, s] = await Promise.all([
        api.get('/izin-pulang', { params: filter ? { status: filter } : {} }),
        api.get('/siswa').catch(() => ({ data: [] as Siswa[] })),
      ])
      setIzin(i.data); setSiswa(Array.isArray(s.data) ? s.data : [])
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal memuat data') }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { muat() }, [muat])

  const ajukan = async () => {
    if (!form.siswa_id || !form.tanggal_pulang || !form.tanggal_kembali) return toast.error('Lengkapi santri, tanggal pulang & kembali')
    try { await api.post('/izin-pulang', form); toast.success('Izin pulang diajukan'); setModal(false); setForm({ siswa_id: '', tanggal_pulang: '', tanggal_kembali: '', alasan: '' }); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal mengajukan') }
  }

  const putuskan = async (iz: Izin, status: 'disetujui' | 'ditolak') => {
    if (status === 'ditolak') {
      const cat = prompt('Alasan penolakan (opsional):') || ''
      try { await api.put(`/izin-pulang/${iz.id}`, { status, catatan_admin: cat }); toast.success('Keputusan tersimpan'); muat() }
      catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
    } else {
      try { await api.put(`/izin-pulang/${iz.id}`, { status }); toast.success('Izin disetujui — notifikasi WA wali terkirim'); muat() }
      catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
    }
  }

  const tandaiSelesai = async (iz: Izin) => {
    try { await api.put(`/izin-pulang/${iz.id}`, { status: 'selesai' }); toast.success('Ditandai selesai'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Perizinan Pulang Santri</h1>
          <p className="text-sm text-slate-500 mt-1">Ajukan, setujui, dan pantau izin pulang santri pondok. Keputusan terkirim via WhatsApp ke wali.</p>
        </div>
        <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          <Plus size={18} /> Ajukan Izin
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-5 flex-wrap">
        {['', 'diajukan', 'disetujui', 'ditolak', 'selesai'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === s ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}>
            {s === '' ? 'Semua' : (STATUS[s]?.label || s)}
          </button>
        ))}
        <button onClick={muat} className="px-3 py-1.5 text-slate-500 hover:text-slate-700"><RefreshCw size={15} /></button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-4 py-2.5 font-medium">Santri</th><th className="px-4 py-2.5 font-medium">Kamar</th><th className="px-4 py-2.5 font-medium">Pulang</th><th className="px-4 py-2.5 font-medium">Kembali</th><th className="px-4 py-2.5 font-medium">Alasan</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody>
            {izin.map(iz => (
              <tr key={iz.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3"><div className="font-medium text-slate-800">{iz.nama}</div><div className="text-xs text-slate-400">{iz.nis || ''}</div></td>
                <td className="px-4 py-3 text-slate-600">{iz.kamar || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{iz.tanggal_pulang}</td>
                <td className="px-4 py-3 text-slate-600">{iz.tanggal_kembali}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[220px]">{iz.alasan || '—'}</td>
                <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS[iz.status]?.cls || ''}`}>{STATUS[iz.status]?.label || iz.status}</span>{iz.catatan_admin && <div className="text-xs text-slate-400 mt-1">{iz.catatan_admin}</div>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {iz.status === 'diajukan' && (
                    <span className="inline-flex gap-1.5">
                      <button onClick={() => putuskan(iz, 'disetujui')} className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"><CheckCircle size={14} />Setujui</button>
                      <button onClick={() => putuskan(iz, 'ditolak')} className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"><XCircle size={14} />Tolak</button>
                    </span>
                  )}
                  {iz.status === 'disetujui' && <button onClick={() => tandaiSelesai(iz)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:underline"><LogOut size={14} />Selesai</button>}
                  {(iz.status === 'ditolak' || iz.status === 'selesai') && <span className="text-xs text-slate-300"><Clock size={14} className="inline" /></span>}
                </td>
              </tr>
            ))}
            {!loading && izin.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Tidak ada data izin pulang.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Ajukan Izin Pulang</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Santri</label>
                <select value={form.siswa_id} onChange={e => setForm(f => ({ ...f, siswa_id: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400">
                  <option value="">— pilih santri —</option>
                  {siswa.map(s => <option key={s.id} value={s.id}>{s.nama}{s.nis ? ` (${s.nis})` : ''}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Pulang</label><input type="date" value={form.tanggal_pulang} onChange={e => setForm(f => ({ ...f, tanggal_pulang: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Kembali</label><input type="date" value={form.tanggal_kembali} onChange={e => setForm(f => ({ ...f, tanggal_kembali: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Alasan</label><textarea value={form.alasan} onChange={e => setForm(f => ({ ...f, alasan: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" rows={2} placeholder="Menjenguk orang tua, dll." /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={ajukan} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-medium">Ajukan</button><button onClick={() => setModal(false)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600">Batal</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
