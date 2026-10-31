import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, ClipboardCheck, Award, X, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'
import { useSettingsStore } from '../../stores/settingsStore'
import { tenantIdentity } from '../../utils/tenantExport'

interface Program { id: string; nama: string; levels: { id: string; nama: string }[] }
interface Peserta { id: string; siswa_id: string; nama: string; nis?: string; program: string; level?: string; kuota_pertemuan: number; terpakai: number; status: string; tanggal_mulai?: string; tanggal_selesai?: string; nomor_sertifikat?: string }
interface Absensi { id: string; peserta_id: string; tanggal: string; status: string; catatan?: string }
interface Siswa { id: string; nama: string; nis?: string }

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  aktif: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-700' },
  selesai: { label: 'Selesai', cls: 'bg-indigo-100 text-indigo-700' },
  berhenti: { label: 'Berhenti', cls: 'bg-slate-100 text-slate-600' },
}

export default function ProgramPesertaPage() {
  const settings = useSettingsStore(s => s.settings)
  const tenant = tenantIdentity(settings)
  const [peserta, setPeserta] = useState<Peserta[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [siswa, setSiswa] = useState<Siswa[]>([])
  const [loading, setLoading] = useState(false)

  const [modalDaftar, setModalDaftar] = useState(false)
  const [formDaftar, setFormDaftar] = useState({ siswa_id: '', program_id: '', level_id: '', kuota_pertemuan: 8, tanggal_mulai: '' })
  const [modalAbsensi, setModalAbsensi] = useState<Peserta | null>(null)
  const [absensi, setAbsensi] = useState<Absensi[]>([])
  const [formAbsensi, setFormAbsensi] = useState({ tanggal: '', status: 'hadir', catatan: '' })

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const [p, pr, s] = await Promise.all([
        api.get('/program-peserta'),
        api.get('/program-belajar').catch(() => ({ data: { program: [] } })),
        api.get('/siswa').catch(() => ({ data: [] as Siswa[] })),
      ])
      setPeserta(p.data?.peserta || [])
      setPrograms(pr.data?.program || [])
      setSiswa(Array.isArray(s.data) ? s.data : [])
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal memuat data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { muat() }, [muat])

  const daftar = async () => {
    if (!formDaftar.siswa_id || !formDaftar.program_id) return toast.error('Pilih siswa dan program')
    try { await api.post('/program-peserta', formDaftar); toast.success('Peserta didaftarkan'); setModalDaftar(false); setFormDaftar({ siswa_id: '', program_id: '', level_id: '', kuota_pertemuan: 8, tanggal_mulai: '' }); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal mendaftarkan') }
  }

  const hapus = async (p: Peserta) => {
    if (!confirm(`Hapus peserta ${p.nama} dari ${p.program}?`)) return
    try { await api.delete(`/program-peserta/${p.id}`); toast.success('Peserta dihapus'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const muatAbsensi = async (p: Peserta) => {
    setModalAbsensi(p)
    try { const r = await api.get('/program-absensi', { params: { peserta_id: p.id } }); setAbsensi(r.data?.absensi || []) }
    catch { setAbsensi([]) }
    setFormAbsensi({ tanggal: todayWib().slice(0, 10), status: 'hadir', catatan: '' })
  }

  const catatAbsensi = async () => {
    if (!modalAbsensi || !formAbsensi.tanggal) return toast.error('Tanggal wajib diisi')
    try { await api.post('/program-absensi', { peserta_id: modalAbsensi.id, ...formAbsensi }); toast.success('Absensi tercatat'); await muatAbsensi(modalAbsensi); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const hapusAbsensi = async (a: Absensi) => {
    try { await api.delete(`/program-absensi/${a.id}`); toast.success('Absensi dihapus'); if (modalAbsensi) await muatAbsensi(modalAbsensi); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const cetakSertifikat = (p: Peserta) => {
    if (!p.nomor_sertifikat) return toast.error('Peserta belum selesai — sertifikat belum terbit')
    const w = window.open('', '_blank', 'width=900,height=640')
    if (!w) return toast.error('Pop-up diblokir browser')
    const namaLembaga = tenant?.name || 'Lembaga'
    w.document.write(`<!doctype html><html><head><title>Sertifikat ${p.nama}</title><style>
      @page{size:landscape;margin:0}*{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}
      .cert{width:1000px;height:620px;border:12px double #b8912f;padding:40px;text-align:center;display:flex;flex-direction:column;justify-content:center}
      .org{font-size:22px;letter-spacing:2px;color:#333;text-transform:uppercase}
      .title{font-size:42px;color:#b8912f;margin:18px 0 6px;letter-spacing:4px}
      .sub{font-size:14px;color:#777}
      .name{font-size:40px;color:#222;margin:22px 0;font-weight:bold}
      .desc{font-size:16px;color:#555;line-height:1.7}
      .foot{margin-top:28px;display:flex;justify-content:space-between;align-items:flex-end;font-size:13px;color:#555}
      .no{font-size:12px;color:#999;margin-top:16px}
      .ttd{width:200px;text-align:center}
      </style></head><body><div class="cert">
        <div class="org">${namaLembaga}</div>
        <div class="title">SERTIFIKAT</div>
        <div class="sub">Diberikan kepada:</div>
        <div class="name">${p.nama}</div>
        <div class="desc">Telah menyelesaikan program <b>${p.program}</b>${p.level ? ` (${p.level})` : ''}${p.tanggal_mulai && p.tanggal_selesai ? ` dari ${p.tanggal_mulai} sampai ${p.tanggal_selesai}` : ''}.</div>
        <div class="foot">
          <div class="ttd">${p.tanggal_selesai || ''}<br><br>Pengelola</div>
          <div>Nomor: ${p.nomor_sertifikat}</div>
        </div>
      </div></body></html>`)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 300)
  }

  const prog = (id: string) => programs.find(x => x.id === id)

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Peserta & Sertifikat</h1>
          <p className="text-sm text-slate-500 mt-1">Daftarkan siswa ke program, catat absensi (memotong kuota pertemuan), dan terbitkan sertifikat saat selesai.</p>
        </div>
        <button onClick={() => { setFormDaftar({ siswa_id: '', program_id: '', level_id: '', kuota_pertemuan: 8, tanggal_mulai: todayWib().slice(0, 10) }); setModalDaftar(true) }} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          <Plus size={18} /> Daftarkan Peserta
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-4 py-2.5 font-medium">Peserta</th><th className="px-4 py-2.5 font-medium">Program</th><th className="px-4 py-2.5 font-medium">Kuota Pertemuan</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody>
            {peserta.map(p => (
              <tr key={p.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3"><div className="font-medium text-slate-800">{p.nama}</div><div className="text-xs text-slate-400">{p.nis || ''}</div></td>
                <td className="px-4 py-3 text-slate-600">{p.program}{p.level ? ` · ${p.level}` : ''}</td>
                <td className="px-4 py-3">
                  <div className="text-slate-700 font-medium">{p.terpakai}{p.kuota_pertemuan ? `/${p.kuota_pertemuan}` : ''}</div>
                  {p.kuota_pertemuan > 0 && <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-1.5"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (p.terpakai / p.kuota_pertemuan) * 100)}%` }} /></div>}
                </td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_LABEL[p.status]?.cls || ''}`}>{STATUS_LABEL[p.status]?.label || p.status}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="inline-flex gap-1.5">
                    <button onClick={() => muatAbsensi(p)} className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"><ClipboardCheck size={13} />Absensi</button>
                    <button onClick={() => cetakSertifikat(p)} disabled={!p.nomor_sertifikat} className="text-xs text-amber-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40 disabled:no-underline"><Award size={13} />Sertifikat</button>
                    <button onClick={() => hapus(p)} className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1"><Trash2 size={13} />Hapus</button>
                  </span>
                </td>
              </tr>
            ))}
            {!loading && peserta.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Belum ada peserta. Daftarkan siswa ke program dulu.</td></tr>}
          </tbody>
        </table>
      </div>

      {modalDaftar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalDaftar(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Daftarkan Peserta</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Siswa</label>
                <select value={formDaftar.siswa_id} onChange={e => setFormDaftar(f => ({ ...f, siswa_id: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400">
                  <option value="">— pilih siswa —</option>
                  {siswa.map(s => <option key={s.id} value={s.id}>{s.nama}{s.nis ? ` (${s.nis})` : ''}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Program</label>
                <select value={formDaftar.program_id} onChange={e => { const p = programs.find(x => x.id === e.target.value); setFormDaftar(f => ({ ...f, program_id: e.target.value, level_id: '' })) }} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400">
                  <option value="">— pilih program —</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                </select>
              </div>
              {prog(formDaftar.program_id)?.levels?.length ? (
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Level</label>
                  <select value={formDaftar.level_id} onChange={e => setFormDaftar(f => ({ ...f, level_id: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400">
                    <option value="">— pilih level —</option>
                    {prog(formDaftar.program_id)!.levels.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
                  </select>
                </div>
              ) : null}
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Kuota Pertemuan (0 = tanpa batas)</label><input type="number" min={0} value={formDaftar.kuota_pertemuan} onChange={e => setFormDaftar(f => ({ ...f, kuota_pertemuan: Number(e.target.value) }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Mulai</label><input type="date" value={formDaftar.tanggal_mulai} onChange={e => setFormDaftar(f => ({ ...f, tanggal_mulai: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={daftar} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-medium">Daftarkan</button><button onClick={() => setModalDaftar(false)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600">Batal</button></div>
          </div>
        </div>
      )}

      {modalAbsensi && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalAbsensi(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Absensi — {modalAbsensi.nama}</h3>
              <button onClick={() => setModalAbsensi(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <input type="date" value={formAbsensi.tanggal} onChange={e => setFormAbsensi(f => ({ ...f, tanggal: e.target.value }))} className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm" />
              <select value={formAbsensi.status} onChange={e => setFormAbsensi(f => ({ ...f, status: e.target.value }))} className="h-10 px-2 rounded-lg border border-slate-200 text-sm">
                <option value="hadir">Hadir</option><option value="izin">Izin</option><option value="sakit">Sakit</option><option value="alpha">Alpha</option>
              </select>
              <button onClick={catatAbsensi} className="h-10 px-3 rounded-lg bg-indigo-600 text-white text-sm font-medium">Catat</button>
            </div>
            <input value={formAbsensi.catatan} onChange={e => setFormAbsensi(f => ({ ...f, catatan: e.target.value }))} placeholder="Catatan (opsional)" className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm mb-3" />
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {absensi.map(a => (
                <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 text-sm">
                  <span className="text-slate-700">{a.tanggal} · <b>{a.status}</b>{a.catatan ? ` — ${a.catatan}` : ''}</span>
                  <button onClick={() => hapusAbsensi(a)} className="text-rose-500 hover:underline text-xs">hapus</button>
                </div>
              ))}
              {absensi.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Belum ada absensi.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
