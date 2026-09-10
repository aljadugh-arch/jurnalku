import { useAuthStore } from '../../stores/authStore'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowUpRight, BookOpen, FileBarChart,
  Landmark, PiggyBank, ReceiptText, UserCheck, WalletCards,
} from 'lucide-react'
import MobileHeader from '../../components/MobileHeader'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { heroColors } from '../../lib/applyTheme'
type BendaharaData = {
  tagihan_belum?: { jumlah?: number; nominal?: number }
  lunas_bulan_ini?: { jumlah?: number; nominal?: number }
  saldo_tabungan?: number
  siswa_aktif?: number
}

const rupiah = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value || 0)

const quickMenus = [
  { label: 'Tagihan', path: '/admin/tagihan', icon: ReceiptText, color: 'bg-emerald-500' },
  { label: 'Tabungan', path: '/admin/tabungan', icon: PiggyBank, color: 'bg-blue-500' },
  { label: 'Buku Kas', path: '/admin/buku-kas', icon: BookOpen, color: 'bg-violet-500' },
  { label: 'Ceklok Saya', path: '/admin/ceklok', icon: UserCheck, color: 'bg-amber-500' },
  { label: 'Laporan', path: '/admin/bendahara#laporan', icon: FileBarChart, color: 'bg-cyan-500' },
  { label: 'Data Siswa', path: '/admin/siswa', icon: Landmark, color: 'bg-rose-500' },
]

export default function MobileBendaharaDashboard({ data }: { data: BendaharaData | null }) {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const settings = useSettingsStore(state => state.settings)
  const dark = useThemeStore(state => state.dark)
  const hero = heroColors(settings, dark)
  const paid = Number(data?.lunas_bulan_ini?.jumlah || 0)
  const unpaid = Number(data?.tagihan_belum?.jumlah || 0)
  const totalBills = paid + unpaid
  const paidPercent = totalBills ? Math.round((paid / totalBills) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 pb-6">
      <section className="relative overflow-hidden px-5 pb-9 pt-12 text-white" style={{ background: `linear-gradient(135deg, ${hero}, #0f172a)` }}>
        <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-emerald-100">Dashboard Bendahara</p>
            <h1 className="mt-1 text-xl font-bold">{user?.nama || 'Bendahara'}</h1>
            <p className="mt-1 text-xs text-emerald-100">Ringkasan keuangan sekolah hari ini</p>
          </div>
          <MobileHeader basePath="/admin" onBell={() => navigate('/admin/posting')} />
        </div>
      </section>

      <div className="-mt-5 space-y-4 px-4">
        <section className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate('/admin/tagihan')} className="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:scale-[.98]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><WalletCards size={18} /></span>
            <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Pendapatan</p>
            <p className="mt-1 truncate text-base font-bold text-slate-800">{rupiah(Number(data?.lunas_bulan_ini?.nominal || 0))}</p>
          </button>
          <button onClick={() => navigate('/admin/tabungan')} className="rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-sm active:scale-[.98]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><PiggyBank size={18} /></span>
            <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Saldo Tabungan</p>
            <p className="mt-1 truncate text-base font-bold text-slate-800">{rupiah(Number(data?.saldo_tabungan || 0))}</p>
          </button>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-sm font-semibold text-slate-800">Status Tagihan</h2><p className="text-xs text-slate-400">Pembayaran seluruh siswa</p></div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{paidPercent}% lunas</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-rose-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPercent}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/admin/tagihan')} className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-left"><ArrowDownLeft className="text-emerald-600" size={20} /><div><p className="text-lg font-bold text-emerald-700">{paid}</p><p className="text-[11px] text-slate-500">Sudah lunas</p></div></button>
            <button onClick={() => navigate('/admin/tagihan')} className="flex items-center gap-3 rounded-xl bg-rose-50 p-3 text-left"><ArrowUpRight className="text-rose-600" size={20} /><div><p className="text-lg font-bold text-rose-700">{unpaid}</p><p className="text-[11px] text-slate-500">Belum bayar</p></div></button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Akses Cepat</h2>
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
            {quickMenus.map(item => {
              const Icon = item.icon
              return <button key={item.label} onClick={() => navigate(item.path)} className="flex flex-col items-center gap-2 rounded-xl py-2 active:bg-slate-50 active:scale-95">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm ${item.color}`}><Icon size={20} /></span>
                <span className="text-center text-[11px] font-medium leading-tight text-slate-600">{item.label}</span>
              </button>
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700"><Landmark size={20} /></span><div><p className="text-xs text-slate-400">Siswa terkelola</p><p className="text-lg font-bold text-slate-800">{Number(data?.siswa_aktif || 0).toLocaleString('id-ID')} siswa</p></div></div>
        </section>
      </div>
    </div>
  )
}
