import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, BookOpen, CreditCard, DollarSign, MapPin, PiggyBank, Users, TrendingUp, TrendingDown, Receipt } from 'lucide-react'
import api from '../../services/api'
import MobileBendaharaDashboard from './MobileBendaharaDashboard'
import RekapKeuanganPanel from './RekapKeuanganPanel'
import MonthFilter, { bulanSekarang, labelBulan } from '../../components/MonthFilter'

export default function BendaharaDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  // Dashboard keuangan tanpa periode selalu menyesatkan: angka "lunas" tanpa
  // keterangan bulan dibaca sebagai total keseluruhan. Default bulan berjalan,
  // dan setiap kartu mengikuti bulan yang dipilih.
  const [bulan, setBulan] = useState(bulanSekarang())

  const muat = (b: string) => {
    api.get('/bendahara/dashboard', { params: { bulan: b || undefined } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
  }
  useEffect(() => { muat(bulan) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0))
  const judulPeriode = bulan ? labelBulan(bulan) : 'Semua periode'

  const cards = [
    { label: 'Tagihan Belum Bayar', value: money(data?.tagihan_belum?.nominal || 0), sub: `${data?.tagihan_belum?.jumlah || 0} tagihan (semua periode)`, icon: <DollarSign size={20} />, path: '/admin/tagihan' },
    { label: `Lunas ${judulPeriode}`, value: money(data?.lunas_bulan_ini?.nominal || 0), sub: `${data?.lunas_bulan_ini?.jumlah || 0} pembayaran diterima`, icon: <CreditCard size={20} />, path: '/admin/tagihan' },
    { label: 'Saldo Tabungan', value: money(data?.saldo_tabungan || 0), sub: 'posisi terkini, semua periode', icon: <PiggyBank size={20} />, path: '/admin/tabungan' },
    { label: 'Siswa Aktif', value: data?.siswa_aktif || 0, sub: 'data siswa', icon: <Users size={20} />, path: '/admin/siswa' },
  ]

  // Kartu arus kas periode terpilih. Dipisah dari kartu pokok karena
  // sifatnya mutasi bulan itu, bukan posisi saldo.
  const kartuPeriode = [
    { label: 'Tabungan Masuk', value: money(data?.tabungan_setor?.total || 0), sub: `${data?.tabungan_setor?.jumlah || 0} setoran`, icon: <TrendingUp size={18} />, warna: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Tabungan Keluar', value: money(data?.tabungan_tarik?.total || 0), sub: `${data?.tabungan_tarik?.jumlah || 0} penarikan`, icon: <TrendingDown size={18} />, warna: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Kas Masuk', value: money(data?.kas_masuk || 0), sub: 'buku kas, debet', icon: <ArrowDownIcon />, warna: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Kas Keluar', value: money(data?.kas_keluar || 0), sub: 'buku kas, kredit', icon: <TrendingDown size={18} />, warna: 'text-rose-600', bg: 'bg-rose-50' },
    { label: `Tagihan ${judulPeriode}`, value: money(data?.tagihan_bulan_ini?.nominal || 0), sub: `${data?.tagihan_bulan_ini?.jumlah || 0} tagihan · terbayar ${money(data?.tagihan_bulan_ini?.terbayar || 0)}`, icon: <Receipt size={18} />, warna: 'text-blue-600', bg: 'bg-blue-50' },
  ]

  return <>
    <div className="lg:hidden">
      <MobileBendaharaDashboard data={data} bulan={bulan} onUbahBulan={b => { setBulan(b); muat(b) }} />
    </div>
    <div className="hidden space-y-6 pb-24 lg:block lg:pb-6">
    <div className="rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Bendahara</h1>
          <p className="text-emerald-50 text-sm mt-1">Kelola tagihan, pembayaran, tabungan, dan laporan keuangan.</p>
        </div>
        <MonthFilter
          nilai={bulan}
          onUbah={b => { setBulan(b); muat(b) }}
          tersedia={data?.bulan_tersedia}
          label="Bulan dashboard"
          className="[&_label]:border-white/30 [&_label]:bg-white/15 [&_label]:text-white [&_select]:text-white [&_button]:border-white/30 [&_button]:bg-white/15 [&_button]:text-white"
        />
      </div>
      <p className="mt-3 text-xs text-emerald-50/90">Periode: {judulPeriode}</p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(c => <button key={c.label} onClick={() => navigate(c.path)} className="bg-white rounded-2xl border border-gray-100 p-4 text-left shadow-sm hover:shadow-md transition min-w-0">
        <div className="flex items-center gap-3 min-w-0"><div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">{c.icon}</div><div className="min-w-0"><p className="text-xs text-gray-500 truncate" title={c.label}>{c.label}</p><p className="font-bold text-gray-800 truncate" title={c.value}>{c.value}</p><p className="text-xs text-gray-400 truncate">{c.sub}</p></div></div>
      </button>)}
    </div>

    {/* Mutasi periode terpilih */}
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">Mutasi {judulPeriode}</h2>
        <button onClick={() => navigate('/admin/bendahara/laporan')} className="text-xs font-semibold text-emerald-600 hover:underline">Lihat laporan lengkap</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {kartuPeriode.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm min-w-0">
            <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${c.bg} ${c.warna}`}>{c.icon}</div>
            <p className="text-xs text-gray-500 truncate" title={c.label}>{c.label}</p>
            <p className={`font-bold truncate ${c.warna}`} title={c.value}>{c.value}</p>
            <p className="text-xs text-gray-400 truncate" title={c.sub}>{c.sub}</p>
          </div>
        ))}
      </div>
    </div>

    {/* Rekap keuangan harian / mingguan / bulanan */}
    <RekapKeuanganPanel />

    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <button onClick={() => navigate('/admin/buku-kas')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 p-4 text-sm font-semibold text-white"><BookOpen size={18}/> Buku Kas</button>
      <button onClick={() => navigate('/admin/ceklok')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-sm font-semibold text-gray-700"><MapPin size={18}/> Ceklok Saya</button>
      <button onClick={() => navigate('/admin/tagihan')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-sm font-semibold text-gray-700"><DollarSign size={18}/> Tagihan & Pembayaran</button>
      <button onClick={() => navigate('/admin/tabungan')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-sm font-semibold text-gray-700"><BarChart3 size={18}/> Tabungan</button>
      <button onClick={() => navigate('/admin/bendahara/laporan')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-gray-100 p-4 text-sm font-semibold text-gray-700"><BarChart3 size={18}/> Laporan</button>
    </div>
    </div>
  </>
}

// Ikon panah masuk kecil — dipakai kartu "Kas Masuk" agar sepasang dengan
// TrendingDown di kartu sebelahnya tanpa menambah impor lucide lain.
function ArrowDownIcon() {
  return <TrendingUp size={18} className="rotate-180" />
}
