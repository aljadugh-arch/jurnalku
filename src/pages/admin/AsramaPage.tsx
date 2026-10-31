import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, BedDouble, Users, LogOut, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

interface Asrama { id: string; nama: string; kapasitas: number; pengasuh?: string; keterangan?: string; jumlah_kamar: number; jumlah_penghuni: number }
interface Kamar { id: string; asrama_id: string; nama: string; kapasitas: number; jumlah_penghuni: number }
interface Penempatan { id: string; siswa_id: string; nama: string; nis?: string; nisn?: string; jenis_kelamin?: string; kamar: string; asrama: string; tanggal_masuk?: string }
interface Siswa { id: string; nama: string; nis?: string; nisn?: string }

export default function AsramaPage() {
  const [tab, setTab] = useState<'asrama' | 'penempatan'>('asrama')
  const [asrama, setAsrama] = useState<Asrama[]>([])
  const [kamar, setKamar] = useState<Kamar[]>([])
  const [asramaTerpilih, setAsramaTerpilih] = useState<string>('')
  const [penempatan, setPenempatan] = useState<Penempatan[]>([])
  const [siswa, setSiswa] = useState<Siswa[]>([])
  const [loading, setLoading] = useState(false)

  // modal asrama/kamar
  const [modalAsrama, setModalAsrama] = useState(false)
  const [editAsrama, setEditAsrama] = useState<Asrama | null>(null)
  const [formAsrama, setFormAsrama] = useState({ nama: '', kapasitas: 0, pengasuh: '', keterangan: '' })
  const [modalKamar, setModalKamar] = useState(false)
  const [editKamar, setEditKamar] = useState<Kamar | null>(null)
  const [formKamar, setFormKamar] = useState({ nama: '', kapasitas: 0 })
  // modal penempatan
  const [modalTempat, setModalTempat] = useState(false)
  const [formTempat, setFormTempat] = useState({ siswa_id: '', kamar_id: '', tanggal_masuk: '' })

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const [a, k, p, s] = await Promise.all([
        api.get('/asrama'), api.get('/kamar'), api.get('/penempatan'),
        api.get('/siswa').catch(() => ({ data: [] as Siswa[] })),
      ])
      setAsrama(a.data); setKamar(k.data); setPenempatan(p.data); setSiswa(Array.isArray(s.data) ? s.data : [])
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal memuat data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { muat() }, [muat])

  const kirimAsrama = async () => {
    if (!formAsrama.nama.trim()) return toast.error('Nama asrama wajib diisi')
    try {
      if (editAsrama) { await api.put(`/asrama/${editAsrama.id}`, formAsrama); toast.success('Asrama diperbarui') }
      else { await api.post('/asrama', formAsrama); toast.success('Asrama ditambahkan') }
      setModalAsrama(false); setEditAsrama(null); setFormAsrama({ nama: '', kapasitas: 0, pengasuh: '', keterangan: '' }); muat()
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menyimpan') }
  }

  const hapusAsrama = async (a: Asrama) => {
    if (!confirm(`Hapus asrama "${a.nama}" beserta seluruh kamar & penempatannya?`)) return
    try { await api.delete(`/asrama/${a.id}`); toast.success('Asrama dihapus'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menghapus') }
  }

  const kirimKamar = async () => {
    if (!formKamar.nama.trim()) return toast.error('Nama kamar wajib diisi')
    try {
      if (editKamar) { await api.put(`/kamar/${editKamar.id}`, formKamar); toast.success('Kamar diperbarui') }
      else { await api.post('/kamar', { ...formKamar, asrama_id: asramaTerpilih }); toast.success('Kamar ditambahkan') }
      setModalKamar(false); setEditKamar(null); setFormKamar({ nama: '', kapasitas: 0 }); muat()
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menyimpan') }
  }

  const hapusKamar = async (k: Kamar) => {
    if (!confirm(`Hapus kamar "${k.nama}" beserta penempatannya?`)) return
    try { await api.delete(`/kamar/${k.id}`); toast.success('Kamar dihapus'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menghapus') }
  }

  const kirimTempat = async () => {
    if (!formTempat.siswa_id || !formTempat.kamar_id) return toast.error('Pilih santri dan kamar')
    try { await api.post('/penempatan', formTempat); toast.success('Santri ditempatkan'); setModalTempat(false); setFormTempat({ siswa_id: '', kamar_id: '', tanggal_masuk: todayWib().slice(0, 10) }); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menempatkan') }
  }

  const keluarkan = async (p: Penempatan) => {
    if (!confirm(`Keluarkan ${p.nama} dari kamar ${p.kamar}?`)) return
    try { await api.delete(`/penempatan/${p.id}`); toast.success('Santri dikeluarkan dari kamar'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }

  const kamarAsrama = kamar.filter(k => k.asrama_id === asramaTerpilih)
  const aTerpilih = asrama.find(a => a.id === asramaTerpilih)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Asrama & Penempatan Santri</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola asrama, kamar, dan penempatan santri pondok/pesantren.</p>
        </div>
        <button onClick={() => { setEditAsrama(null); setFormAsrama({ nama: '', kapasitas: 0, pengasuh: '', keterangan: '' }); setModalAsrama(true) }} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          <Plus size={18} /> Asrama
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-5">
        {(['asrama', 'penempatan'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}>
            {t === 'asrama' ? 'Asrama & Kamar' : 'Penempatan Santri'}
          </button>
        ))}
      </div>

      {tab === 'asrama' && (
        <div className="grid md:grid-cols-[300px_1fr] gap-5">
          <div className="space-y-3">
            {asrama.map(a => (
              <button key={a.id} onClick={() => setAsramaTerpilih(a.id)} className={`w-full text-left p-4 rounded-xl border transition ${asramaTerpilih === a.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-2"><Building2 size={16} className="text-indigo-500" />{a.nama}</span>
                  <span className="text-xs text-slate-500">{a.jumlah_kamar} kamar</span>
                </div>
                <div className="text-xs text-slate-500 mt-1.5">Penghuni {a.jumlah_penghuni}{a.kapasitas ? `/${a.kapasitas}` : ''} · {a.pengasuh || '—'}</div>
                <div className="flex gap-2 mt-2">
                  <span onClick={(e) => { e.stopPropagation(); setEditAsrama(a); setFormAsrama({ nama: a.nama, kapasitas: a.kapasitas, pengasuh: a.pengasuh || '', keterangan: a.keterangan || '' }); setModalAsrama(true) }} className="text-xs text-indigo-600 hover:underline"><Pencil size={12} className="inline mr-0.5" />Ubah</span>
                  <span onClick={(e) => { e.stopPropagation(); hapusAsrama(a) }} className="text-xs text-rose-600 hover:underline"><Trash2 size={12} className="inline mr-0.5" />Hapus</span>
                </div>
              </button>
            ))}
            {!loading && asrama.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Belum ada asrama. Tambahkan dulu.</p>}
          </div>

          <div>
            {aTerpilih ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-800">Kamar — {aTerpilih.nama}</h2>
                  <button onClick={() => { setEditKamar(null); setFormKamar({ nama: '', kapasitas: 0 }); setModalKamar(true) }} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-slate-200 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
                    <Plus size={16} /> Kamar
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {kamarAsrama.map(k => (
                    <div key={k.id} className="p-4 rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 flex items-center gap-2"><BedDouble size={16} className="text-indigo-500" />{k.nama}</span>
                        <span className="text-xs text-slate-500">{k.jumlah_penghuni}{k.kapasitas ? `/${k.kapasitas}` : ''}</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => { setEditKamar(k); setFormKamar({ nama: k.nama, kapasitas: k.kapasitas }); setModalKamar(true) }} className="text-xs text-indigo-600 hover:underline"><Pencil size={12} className="inline mr-0.5" />Ubah</button>
                        <button onClick={() => hapusKamar(k)} className="text-xs text-rose-600 hover:underline"><Trash2 size={12} className="inline mr-0.5" />Hapus</button>
                      </div>
                    </div>
                  ))}
                  {kamarAsrama.length === 0 && <p className="text-sm text-slate-400 col-span-2 text-center py-8">Belum ada kamar di asrama ini.</p>}
                </div>
              </>
            ) : <p className="text-sm text-slate-400 text-center py-12">Pilih asrama untuk mengelola kamarnya.</p>}
          </div>
        </div>
      )}

      {tab === 'penempatan' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Users size={18} className="text-indigo-500" />Daftar Santri Terpasang</h2>
            <button onClick={() => { setFormTempat({ siswa_id: '', kamar_id: kamar[0]?.id || '', tanggal_masuk: todayWib().slice(0, 10) }); setModalTempat(true) }} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
              <Plus size={16} /> Tempatkan Santri
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="px-4 py-2.5 font-medium">Nama</th><th className="px-4 py-2.5 font-medium">NIS/NISN</th><th className="px-4 py-2.5 font-medium">Asrama</th><th className="px-4 py-2.5 font-medium">Kamar</th><th className="px-4 py-2.5 font-medium">Masuk</th><th className="px-4 py-2.5"></th></tr>
              </thead>
              <tbody>
                {penempatan.map(p => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{p.nama}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.nis || p.nisn || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.asrama}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.kamar}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.tanggal_masuk || '—'}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => keluarkan(p)} className="text-rose-600 hover:underline text-xs inline-flex items-center gap-1"><LogOut size={12} />Keluar</button></td>
                  </tr>
                ))}
                {!loading && penempatan.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Belum ada santri ditempatkan.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalAsrama && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalAsrama(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">{editAsrama ? 'Ubah Asrama' : 'Tambah Asrama'}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Nama Asrama</label><input value={formAsrama.nama} onChange={e => setFormAsrama(f => ({ ...f, nama: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" placeholder="Asrama Putra" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Kapasitas Total (0 = tanpa batas)</label><input type="number" min={0} value={formAsrama.kapasitas} onChange={e => setFormAsrama(f => ({ ...f, kapasitas: Number(e.target.value) }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Pengasuh / Musyrif</label><input value={formAsrama.pengasuh} onChange={e => setFormAsrama(f => ({ ...f, pengasuh: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Keterangan</label><textarea value={formAsrama.keterangan} onChange={e => setFormAsrama(f => ({ ...f, keterangan: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" rows={2} /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={kirimAsrama} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-medium">Simpan</button><button onClick={() => setModalAsrama(false)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600">Batal</button></div>
          </div>
        </div>
      )}

      {modalKamar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalKamar(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">{editKamar ? 'Ubah Kamar' : 'Tambah Kamar'}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Nama Kamar</label><input value={formKamar.nama} onChange={e => setFormKamar(f => ({ ...f, nama: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" placeholder="Kamar 1" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Kapasitas</label><input type="number" min={0} value={formKamar.kapasitas} onChange={e => setFormKamar(f => ({ ...f, kapasitas: Number(e.target.value) }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={kirimKamar} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-medium">Simpan</button><button onClick={() => setModalKamar(false)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600">Batal</button></div>
          </div>
        </div>
      )}

      {modalTempat && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalTempat(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Tempatkan Santri</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Santri</label>
                <select value={formTempat.siswa_id} onChange={e => setFormTempat(f => ({ ...f, siswa_id: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400">
                  <option value="">— pilih santri —</option>
                  {siswa.map(s => <option key={s.id} value={s.id}>{s.nama}{s.nis ? ` (${s.nis})` : ''}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Kamar</label>
                <select value={formTempat.kamar_id} onChange={e => setFormTempat(f => ({ ...f, kamar_id: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400">
                  <option value="">— pilih kamar —</option>
                  {kamar.map(k => { const a = asrama.find(x => x.id === k.asrama_id); return <option key={k.id} value={k.id}>{a?.nama} — {k.nama}</option> })}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Masuk</label><input type="date" value={formTempat.tanggal_masuk} onChange={e => setFormTempat(f => ({ ...f, tanggal_masuk: e.target.value }))} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={kirimTempat} className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-medium">Tempatkan</button><button onClick={() => setModalTempat(false)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600">Batal</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
