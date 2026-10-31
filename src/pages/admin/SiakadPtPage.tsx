import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Calculator, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Siswa { id: string; nama: string; nis?: string }
interface Mapel { id: string; nama: string }
interface KrsItem { id: string; mapel_id: string; nama_mapel?: string; sks: number }
interface Krs { id: string; siswa_id: string; semester: string; tahun_ajaran?: string; nama_mahasiswa?: string; items: KrsItem[] }
interface NilaiRow { id: string; mapel_id: string; nama_mapel?: string; semester: string; sks: number; nilai_angka?: number; nilai_huruf?: string }
interface Khs { khs: { semester: string; sks: number; ip: number | null }[]; ipk: number | null; total_sks: number }

export default function SiakadPtPage() {
  const [tab, setTab] = useState<'krs' | 'nilai'>('krs')
  const [mahasiswa, setMahasiswa] = useState<Siswa[]>([])
  const [mapel, setMapel] = useState<Mapel[]>([])
  const [pilihSiswa, setPilihSiswa] = useState('')
  const [krs, setKrs] = useState<Krs[]>([])
  const [nilai, setNilai] = useState<NilaiRow[]>([])
  const [khs, setKhs] = useState<Khs | null>(null)

  const [modalKrs, setModalKrs] = useState(false)
  const [formKrs, setFormKrs] = useState({ semester: 'Ganjil', tahun_ajaran: '', items: [{ mapel_id: '', sks: 3 }] })
  const [modalNilai, setModalNilai] = useState(false)
  const [formNilai, setFormNilai] = useState({ mapel_id: '', semester: 'Ganjil', sks: 3, nilai_huruf: 'A', nilai_angka: '' })

  const muat = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([api.get('/siswa').catch(() => ({ data: [] as Siswa[] })), api.get('/mapel').catch(() => ({ data: [] as Mapel[] }))])
      setMahasiswa(Array.isArray(s.data) ? s.data : [])
      setMapel(Array.isArray(m.data) ? m.data : [])
    } catch {}
  }, [])

  useEffect(() => { muat() }, [muat])

  const muatKrs = useCallback(async () => {
    if (!pilihSiswa) { setKrs([]); return }
    try { const r = await api.get('/krs', { params: { siswa_id: pilihSiswa } }); setKrs(r.data?.krs || []) } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal memuat KRS') }
  }, [pilihSiswa])

  const muatNilai = useCallback(async () => {
    if (!pilihSiswa) { setNilai([]); setKhs(null); return }
    try {
      const [n, k] = await Promise.all([
        api.get('/krs-nilai', { params: { siswa_id: pilihSiswa } }),
        api.get('/krs-khs', { params: { siswa_id: pilihSiswa } }),
      ])
      setNilai(n.data?.nilai || []); setKhs(k.data || null)
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal memuat nilai') }
  }, [pilihSiswa])

  useEffect(() => { muatKrs(); muatNilai() }, [muatKrs, muatNilai])

  const buatKrs = async () => {
    const items = formKrs.items.filter(i => i.mapel_id)
    if (!pilihSiswa || !items.length) return toast.error('Pilih mahasiswa & minimal 1 mata kuliah')
    try { await api.post('/krs', { siswa_id: pilihSiswa, semester: formKrs.semester, tahun_ajaran: formKrs.tahun_ajaran, items }); toast.success('KRS disimpan'); setModalKrs(false); setFormKrs({ semester: 'Ganjil', tahun_ajaran: '', items: [{ mapel_id: '', sks: 3 }] }); muatKrs() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const hapusKrs = async (k: Krs) => {
    if (!confirm(`Hapus KRS ${k.nama_mahasiswa} semester ${k.semester}?`)) return
    try { await api.delete(`/krs/${k.id}`); toast.success('KRS dihapus'); muatKrs() } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const simpanNilai = async () => {
    if (!pilihSiswa || !formNilai.mapel_id) return toast.error('Pilih mahasiswa & mata kuliah')
    try { await api.post('/krs-nilai', { siswa_id: pilihSiswa, ...formNilai, nilai_angka: formNilai.nilai_angka === '' ? null : Number(formNilai.nilai_angka) }); toast.success('Nilai tersimpan'); setModalNilai(false); muatNilai() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const mhs = mahasiswa.find(s => s.id === pilihSiswa)

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">SIAKAD — KRS, KHS & IPK</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola Kartu Rencana Studi, nilai per mata kuliah, dan indeks prestasi mahasiswa.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={pilihSiswa} onChange={e => setPilihSiswa(e.target.value)} className="h-11 px-3 rounded-xl border border-slate-200 text-sm bg-white min-w-[220px]">
            <option value="">— pilih mahasiswa —</option>
            {mahasiswa.map(s => <option key={s.id} value={s.id}>{s.nama}{s.nis ? ` (${s.nis})` : ''}</option>)}
          </select>
          {tab === 'krs' && <button onClick={() => setModalKrs(true)} disabled={!pilihSiswa} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"><Plus size={18} />KRS</button>}
          {tab === 'nilai' && <button onClick={() => setModalNilai(true)} disabled={!pilihSiswa} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"><Plus size={18} />Nilai</button>}
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-5">
        {(['krs', 'nilai'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}>
            {t === 'krs' ? 'KRS' : 'Nilai & KHS/IPK'}
          </button>
        ))}
      </div>

      {tab === 'krs' && (
        <div className="space-y-3">
          {krs.map(k => (
            <div key={k.id} className="p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">Semester {k.semester}{k.tahun_ajaran ? ` · ${k.tahun_ajaran}` : ''} <span className="text-slate-400 font-normal">({k.items.length} MK)</span></div>
                <button onClick={() => hapusKrs(k)} className="text-rose-600 hover:underline text-xs"><Trash2 size={13} className="inline mr-1" />Hapus</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {k.items.map(it => <span key={it.id} className="px-2 py-1 rounded-lg bg-slate-100 text-xs text-slate-600">{it.nama_mapel || it.mapel_id} <b className="text-slate-500">({it.sks} sks)</b></span>)}
              </div>
            </div>
          ))}
          {!pilihSiswa && <p className="text-sm text-slate-400 text-center py-10">Pilih mahasiswa untuk melihat KRS-nya.</p>}
          {pilihSiswa && krs.length === 0 && <p className="text-sm text-slate-400 text-center py-10">Belum ada KRS untuk mahasiswa ini.</p>}
        </div>
      )}

      {tab === 'nilai' && (
        <div className="grid md:grid-cols-[1fr_280px] gap-5">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="px-4 py-2.5 font-medium">Mata Kuliah</th><th className="px-4 py-2.5 font-medium">Semester</th><th className="px-4 py-2.5 font-medium">SKS</th><th className="px-4 py-2.5 font-medium">Nilai</th></tr>
              </thead>
              <tbody>
                {nilai.map(n => (
                  <tr key={n.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-800">{n.nama_mapel || n.mapel_id}</td>
                    <td className="px-4 py-2.5 text-slate-600">{n.semester}</td>
                    <td className="px-4 py-2.5 text-slate-600">{n.sks}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{n.nilai_huruf || (n.nilai_angka ?? '—')}</td>
                  </tr>
                ))}
                {!pilihSiswa && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Pilih mahasiswa dulu.</td></tr>}
                {pilihSiswa && nilai.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Belum ada nilai.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 text-center">
              <div className="text-xs text-slate-500 flex items-center justify-center gap-1"><Calculator size={14} />IPK {mhs?.nama || ''}</div>
              <div className="text-4xl font-bold text-indigo-700 mt-1">{khs?.ipk ?? '—'}</div>
              <div className="text-xs text-slate-500 mt-1">Total {khs?.total_sks ?? 0} SKS</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {khs?.khs.map(k => (
                <div key={k.semester} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-600">Semester {k.semester}</span>
                  <span className="font-semibold text-slate-800">{k.ip ?? '—'} <span className="text-xs text-slate-400">({k.sks} sks)</span></span>
                </div>
              ))}
              {(!khs?.khs?.length) && <div className="px-4 py-3 text-sm text-slate-400 text-center">Belum ada data KHS.</div>}
            </div>
          </div>
        </div>
      )}

      {modalKrs && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalKrs(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Buat KRS — {mhs?.nama}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Semester</label>
                  <select value={formKrs.semester} onChange={e => setFormKrs(f => ({ ...f, semester: e.target.value }))} className="w-full h-10 px-2 rounded-lg border border-slate-200 text-sm">
                    <option>Ganjil</option><option>Genap</option>
                  </select>
                </div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Tahun Ajaran</label><input value={formKrs.tahun_ajaran} onChange={e => setFormKrs(f => ({ ...f, tahun_ajaran: e.target.value }))} placeholder="2025/2026" className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" /></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Mata Kuliah (MK + SKS)</label>
                <div className="space-y-2">
                  {formKrs.items.map((it, i) => (
                    <div key={i} className="flex gap-2">
                      <select value={it.mapel_id} onChange={e => setFormKrs(f => ({ ...f, items: f.items.map((x, j) => j === i ? { ...x, mapel_id: e.target.value } : x) }))} className="flex-1 h-10 px-2 rounded-lg border border-slate-200 text-sm">
                        <option value="">— pilih MK —</option>
                        {mapel.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                      </select>
                      <input type="number" min={1} value={it.sks} onChange={e => setFormKrs(f => ({ ...f, items: f.items.map((x, j) => j === i ? { ...x, sks: Number(e.target.value) } : x) }))} className="w-16 h-10 px-2 rounded-lg border border-slate-200 text-sm" title="SKS" />
                      <button onClick={() => setFormKrs(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="text-rose-500"><X size={16} /></button>
                    </div>
                  ))}
                  <button onClick={() => setFormKrs(f => ({ ...f, items: [...f.items, { mapel_id: '', sks: 3 }] }))} className="text-xs text-indigo-600 hover:underline">+ tambah MK</button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={buatKrs} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-medium">Simpan KRS</button><button onClick={() => setModalKrs(false)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600">Batal</button></div>
          </div>
        </div>
      )}

      {modalNilai && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalNilai(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Input Nilai — {mhs?.nama}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Mata Kuliah</label>
                <select value={formNilai.mapel_id} onChange={e => setFormNilai(f => ({ ...f, mapel_id: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm">
                  <option value="">— pilih MK —</option>
                  {mapel.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Semester</label>
                  <select value={formNilai.semester} onChange={e => setFormNilai(f => ({ ...f, semester: e.target.value }))} className="w-full h-10 px-2 rounded-lg border border-slate-200 text-sm"><option>Ganjil</option><option>Genap</option></select>
                </div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">SKS</label><input type="number" min={1} value={formNilai.sks} onChange={e => setFormNilai(f => ({ ...f, sks: Number(e.target.value) }))} className="w-full h-10 px-2 rounded-lg border border-slate-200 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Nilai Huruf</label>
                  <select value={formNilai.nilai_huruf} onChange={e => setFormNilai(f => ({ ...f, nilai_huruf: e.target.value, nilai_angka: '' }))} className="w-full h-10 px-2 rounded-lg border border-slate-200 text-sm">
                    {['A', 'B', 'C', 'D', 'E'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Nilai Angka (0–4)</label><input type="number" step="0.01" min={0} max={4} value={formNilai.nilai_angka} onChange={e => setFormNilai(f => ({ ...f, nilai_angka: e.target.value, nilai_huruf: '' }))} className="w-full h-10 px-2 rounded-lg border border-slate-200 text-sm" /></div>
              </div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={simpanNilai} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-medium">Simpan Nilai</button><button onClick={() => setModalNilai(false)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600">Batal</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
