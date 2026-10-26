import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Receipt, PiggyBank, ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

type Mode = 'harian' | 'mingguan' | 'bulanan'

const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function RekapKeuanganPanel() {
  const [mode, setMode] = useState<Mode>('harian')
  const [tanggal, setTanggal] = useState(() => todayWib())
  const [bulan, setBulan] = useState(() => todayWib().slice(0, 7))
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    const params: any = { mode }
    if (mode === 'bulanan') params.bulan = bulan
    else params.tanggal = tanggal
    api.get('/bendahara/rekap', { params }).then(r => setData(r.data)).catch(() => setData(null))
  }, [mode, tanggal, bulan])

  const cards = [
    { label: 'Kas Masuk', value: data?.kas_masuk?.total, sub: `${data?.kas_masuk?.jumlah || 0} transaksi`, icon: <TrendingUp size={18} />, warna: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Kas Keluar', value: data?.kas_keluar?.total, sub: `${data?.kas_keluar?.jumlah || 0} transaksi`, icon: <TrendingDown size={18} />, warna: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Pembayaran Tagihan', value: data?.pembayaran?.total, sub: `${data?.pembayaran?.jumlah || 0} tagihan lunas`, icon: <Receipt size={18} />, warna: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Setoran Tabungan', value: data?.tabungan_setor?.total, sub: `${data?.tabungan_setor?.jumlah || 0} setoran`, icon: <ArrowDownLeft size={18} />, warna: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Penarikan Tabungan', value: data?.tabungan_tarik?.total, sub: `${data?.tabungan_tarik?.jumlah || 0} penarikan`, icon: <ArrowUpRight size={18} />, warna: 'text-rose-600', bg: 'bg-rose-50' },
  ]

  const rincian = (data?.rincian || []).filter((r: any) =>
    r.kas_masuk || r.kas_keluar || r.tabungan_setor || r.tabungan_tarik || r.pembayaran
  )

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-emerald-600" />
          <h2 className="text-sm font-bold text-gray-700">Rekap Keuangan {data ? `— ${data.label}` : ''}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['harian', 'mingguan', 'bulanan'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${mode === m ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}>{cap(m)}</button>
            ))}
          </div>
          {mode === 'bulanan'
            ? <input type="month" value={bulan} onChange={e => setBulan(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
            : <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl border border-gray-100 p-3 min-w-0">
            <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${c.bg} ${c.warna}`}>{c.icon}</div>
            <p className="text-xs text-gray-500 truncate" title={c.label}>{c.label}</p>
            <p className={`font-bold truncate ${c.warna}`} title={rupiah(c.value)}>{rupiah(c.value)}</p>
            <p className="text-xs text-gray-400 truncate">{c.sub}</p>
          </div>
        ))}
      </div>

      {mode !== 'harian' && rincian.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Tanggal</th>
                <th className="text-right px-3 py-2 font-medium text-emerald-600">Kas Masuk</th>
                <th className="text-right px-3 py-2 font-medium text-rose-600">Kas Keluar</th>
                <th className="text-right px-3 py-2 font-medium text-blue-600">Setor Tabungan</th>
                <th className="text-right px-3 py-2 font-medium text-rose-600">Tarik Tabungan</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Pembayaran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rincian.map((r: any) => (
                <tr key={r.tanggal} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(r.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{r.kas_masuk ? rupiah(r.kas_masuk) : '-'}</td>
                  <td className="px-3 py-2 text-right text-rose-700">{r.kas_keluar ? rupiah(r.kas_keluar) : '-'}</td>
                  <td className="px-3 py-2 text-right text-blue-700">{r.tabungan_setor ? rupiah(r.tabungan_setor) : '-'}</td>
                  <td className="px-3 py-2 text-right text-rose-700">{r.tabungan_tarik ? rupiah(r.tabungan_tarik) : '-'}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.pembayaran ? rupiah(r.pembayaran) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
