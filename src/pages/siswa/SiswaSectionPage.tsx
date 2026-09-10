import { useEffect, useState } from 'react'
import { BookOpen, ClipboardCheck, Receipt, Wallet } from 'lucide-react'
import api from '../../services/api'

export type SiswaSection = 'tugas' | 'tagihan' | 'tabungan'

const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))

export default function SiswaSectionPage({ section }: { section: SiswaSection }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get('/siswa/dashboard').then(response => setData(response.data || {})).catch(() => setData({})).finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="py-10 text-center text-sm text-gray-400">Memuat...</div>

  if (section === 'tugas') return <div className="space-y-4"><h1 className="flex items-center gap-2 text-xl font-bold text-gray-800"><ClipboardCheck/>Tugas</h1><div className="space-y-3">{(data?.tugas || []).length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm text-gray-400">Belum ada tugas</p>}{(data?.tugas || []).map((item:any) => <article key={item.id} className="rounded-xl border bg-white p-4"><h2 className="font-semibold text-gray-800">{item.judul}</h2><p className="text-xs text-gray-500">{item.mapel_nama || '-'} · Deadline {item.deadline || '-'}</p>{item.deskripsi && <p className="mt-2 text-sm text-gray-600">{item.deskripsi}</p>}</article>)}</div></div>

  if (section === 'tagihan') return <div className="space-y-4"><h1 className="flex items-center gap-2 text-xl font-bold text-gray-800"><Receipt/>Tagihan</h1><div className="space-y-3">{(data?.tagihan_detail || []).length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm text-gray-400">Belum ada tagihan</p>}{(data?.tagihan_detail || []).map((item:any) => <article key={item.id} className="flex items-center justify-between rounded-xl border bg-white p-4"><div><h2 className="font-semibold text-gray-800">{item.jenis_nama || 'Tagihan'}</h2><p className="text-xs text-gray-500">{item.bulan || '-'} {item.tahun || ''}</p></div><div className="text-right"><p className="font-semibold">{rupiah(item.nominal)}</p><p className={item.status === 'lunas' ? 'text-xs text-emerald-600' : 'text-xs text-rose-600'}>{item.status === 'lunas' ? 'Lunas' : 'Belum bayar'}</p></div></article>)}</div></div>

  return <div className="space-y-4"><h1 className="flex items-center gap-2 text-xl font-bold text-gray-800"><Wallet/>Tabungan</h1><div className="rounded-xl bg-primary p-5 text-white"><p className="text-sm opacity-80">Saldo</p><p className="text-2xl font-bold">{rupiah(data?.tabungan?.saldo)}</p></div><div className="space-y-3">{(data?.tabungan_detail || []).length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm text-gray-400">Belum ada mutasi tabungan</p>}{(data?.tabungan_detail || []).map((item:any, index:number) => <article key={item.id || index} className="flex items-center justify-between rounded-xl border bg-white p-4"><div><p className={item.tipe === 'setor' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>{item.tipe === 'setor' ? 'Setoran' : 'Penarikan'} {rupiah(item.nominal)}</p><p className="text-xs text-gray-500">{item.tanggal} {item.keterangan ? `· ${item.keterangan}` : ''}</p></div><p className="text-sm font-medium">{rupiah(item.saldo_akhir)}</p></article>)}</div></div>
}
