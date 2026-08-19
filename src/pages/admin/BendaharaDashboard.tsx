import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, CreditCard, DollarSign, MapPin, PiggyBank, Users } from 'lucide-react'
import api from '../../services/api'
import FinanceExcelPanel from '../../components/FinanceExcelPanel'

export default function BendaharaDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  useEffect(() => { api.get('/bendahara/dashboard').then(r => setData(r.data)).catch(() => setData(null)) }, [])
  const money = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0))
  const cards = [
    { label: 'Tagihan Belum Bayar', value: money(data?.tagihan_belum?.nominal), sub: `${data?.tagihan_belum?.jumlah || 0} tagihan`, icon: <DollarSign size={20} />, path: '/admin/tagihan' },
    { label: 'Lunas Bulan Ini', value: money(data?.lunas_bulan_ini?.nominal), sub: `${data?.lunas_bulan_ini?.jumlah || 0} pembayaran`, icon: <CreditCard size={20} />, path: '/admin/tagihan' },
    { label: 'Saldo Tabungan', value: money(data?.saldo_tabungan), sub: 'total saldo siswa', icon: <PiggyBank size={20} />, path: '/admin/tabungan' },
    { label: 'Siswa Aktif', value: data?.siswa_aktif?.jumlah || 0, sub: 'data siswa', icon: <Users size={20} />, path: '/admin/siswa' },
  ]
  return <div className="space-y-6 pb-24 lg:pb-6">
    <div className="rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white p-5 sm:p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Dashboard Bendahara</h1>
      <p className="text-emerald-50 text-sm mt-1">Kelola tagihan, pembayaran, tabungan, dan laporan keuangan.</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(c => <button key={c.label} onClick={() => navigate(c.path)} className="bg-white rounded-2xl border border-gray-100 p-4 text-left shadow-sm hover:shadow-md transition">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">{c.icon}</div><div><p className="text-xs text-gray-500">{c.label}</p><p className="font-bold text-gray-800">{c.value}</p><p className="text-xs text-gray-400">{c.sub}</p></div></div>
      </button>)}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <button onClick={() => navigate('/admin/ceklok')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-sm font-semibold text-gray-700"><MapPin size={18}/> Ceklok Saya</button>
      <button onClick={() => navigate('/admin/tagihan')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-sm font-semibold text-gray-700"><DollarSign size={18}/> Tagihan & Pembayaran</button>
      <button onClick={() => navigate('/admin/tabungan')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-sm font-semibold text-gray-700"><BarChart3 size={18}/> Laporan</button>
    </div>
    <div id="laporan"><FinanceExcelPanel /></div>
  </div>
}
