import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

type Row = { id:string; tanggal:string; hari:string; uraian:string; debet:number; kredit:number; saldo:number }
const empty = { tanggal: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }), uraian: '', debet: '', kredit: '' }
const money = (value:number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(value || 0))

export default function BukuKasPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(() => api.get('/buku-kas').then(r => setRows(r.data || [])).catch(() => toast.error('Gagal memuat Buku Kas')), [])
  useEffect(() => { void load() }, [load])
  const total = useMemo(() => ({ debet: rows.reduce((n,r)=>n+Number(r.debet||0),0), kredit: rows.reduce((n,r)=>n+Number(r.kredit||0),0), saldo: rows.at(-1)?.saldo || 0 }), [rows])
  const reset = () => { setEditing(null); setForm(empty) }
  const submit = async (event:React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      const payload = { tanggal: form.tanggal, uraian: form.uraian, debet: Number(form.debet || 0), kredit: Number(form.kredit || 0) }
      if (editing) await api.put(`/buku-kas/${editing}`, payload); else await api.post('/buku-kas', payload)
      toast.success(editing ? 'Transaksi diperbarui' : 'Transaksi ditambahkan'); reset(); await load()
    } catch (error:any) { toast.error(error.response?.data?.error || 'Gagal menyimpan transaksi') }
    finally { setSaving(false) }
  }
  const edit = (row:Row) => { setEditing(row.id); setForm({ tanggal: row.tanggal, uraian: row.uraian, debet: row.debet ? String(row.debet) : '', kredit: row.kredit ? String(row.kredit) : '' }) }
  const remove = async (id:string) => { if (!window.confirm('Hapus transaksi Buku Kas ini?')) return; try { await api.delete(`/buku-kas/${id}`); toast.success('Transaksi dihapus'); await load() } catch (error:any) { toast.error(error.response?.data?.error || 'Gagal menghapus transaksi') } }

  return <div className="space-y-5 pb-24 lg:pb-6">
    <div><h1 className="text-2xl font-bold text-gray-800">Buku Kas</h1><p className="text-sm text-gray-500">Input penerimaan dan pengeluaran kas lembaga.</p></div>
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
      <div><label className="text-xs text-gray-500">TGL</label><input required type="date" value={form.tanggal} onChange={e=>setForm({...form,tanggal:e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></div>
      <div className="sm:col-span-2"><label className="text-xs text-gray-500">URAIAN</label><input required value={form.uraian} onChange={e=>setForm({...form,uraian:e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Keterangan transaksi"/></div>
      <div><label className="text-xs text-gray-500">DEBET</label><input min="0" step="1" type="number" value={form.debet} onChange={e=>setForm({...form,debet:e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></div>
      <div><label className="text-xs text-gray-500">KREDIT</label><input min="0" step="1" type="number" value={form.kredit} onChange={e=>setForm({...form,kredit:e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-5"><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{editing?<Save size={16}/>:<Plus size={16}/>} {saving?'Menyimpan...':editing?'Simpan Perubahan':'Tambah Transaksi'}</button>{editing&&<button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"><X size={16}/>Batal</button>}</div>
    </form>
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['NO','TGL','HARI','URAIAN','DEBET','KREDIT','SALDO','AKSI'].map(x=><th key={x} className="px-3 py-3 text-left">{x}</th>)}</tr></thead><tbody>{rows.length===0&&<tr><td colSpan={8} className="p-8 text-center text-gray-400">Belum ada transaksi</td></tr>}{rows.map((row,index)=><tr key={row.id} className="border-t"><td className="px-3 py-3">{index+1}</td><td className="px-3 py-3 whitespace-nowrap">{row.tanggal}</td><td className="px-3 py-3">{row.hari}</td><td className="px-3 py-3">{row.uraian}</td><td className="px-3 py-3 text-emerald-700">{row.debet?money(row.debet):'-'}</td><td className="px-3 py-3 text-rose-700">{row.kredit?money(row.kredit):'-'}</td><td className="px-3 py-3 font-semibold">{money(row.saldo)}</td><td className="px-3 py-3"><div className="flex gap-1"><button onClick={()=>edit(row)} className="rounded p-2 text-blue-600 hover:bg-blue-50" title="Edit"><Pencil size={15}/></button><button onClick={()=>remove(row.id)} className="rounded p-2 text-red-600 hover:bg-red-50" title="Hapus"><Trash2 size={15}/></button></div></td></tr>)}</tbody><tfoot className="border-t-2 bg-slate-50 font-bold"><tr><td colSpan={4} className="px-3 py-3 text-right">TOTAL</td><td className="px-3 py-3 text-emerald-700">{money(total.debet)}</td><td className="px-3 py-3 text-rose-700">{money(total.kredit)}</td><td className="px-3 py-3">{money(total.saldo)}</td><td/></tr></tfoot></table></div>
  </div>
}
