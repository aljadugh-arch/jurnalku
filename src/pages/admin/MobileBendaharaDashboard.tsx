import { useAuthStore } from '../../stores/authStore'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowUpRight, BookOpen, ChevronRight, FileBarChart,
  Landmark, PiggyBank, ReceiptText, Target, UserCheck, WalletCards,
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
  { label: 'Tagihan', path: '/admin/tagihan', icon: ReceiptText, tile: 'bg-emerald-500', bg: 'bg-emerald-50' },
  { label: 'Tabungan', path: '/admin/tabungan', icon: PiggyBank, tile: 'bg-blue-500', bg: 'bg-blue-50' },
  { label: 'Buku Kas', path: '/admin/buku-kas', icon: BookOpen, tile: 'bg-violet-500', bg: 'bg-violet-50' },
  { label: 'Ceklok Saya', path: '/admin/ceklok', icon: UserCheck, tile: 'bg-amber-500', bg: 'bg-amber-50' },
  { label: 'Laporan', path: '/admin/bendahara#laporan', icon: FileBarChart, tile: 'bg-cyan-500', bg: 'bg-cyan-50' },
  { label: 'Data Siswa', path: '/admin/siswa', icon: Landmark, tile: 'bg-rose-500', bg: 'bg-rose-50' },
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
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-gray-950 pb-6">
      {/* ── HEADER MINIMALIS: sama seperti guru/admin ── */}
      <div className="px-4 pt-4 pb-2">
        <MobileHeader basePath="/admin" onBell={() => navigate('/admin/posting')} />
      </div>

      <div className="px-4 space-y-4">
        {/* ── HERO: Ringkasan Keuangan (gaya sama dgn "Fokus Hari Ini" guru) ── */}
        <section
          className="relative overflow-hidden rounded-3xl p-4 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${hero}, #0f172a)` }}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
            <div className="absolute -right-2 bottom-8 h-20 w-20 rounded-full bg-white/[0.07]" />
          </div>
          <span className="relative z-10 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/80">
            <Target size={14} />
            Ringkasan Keuangan Hari Ini
          </span>
          <h2 className="relative z-10 mt-2 text-2xl font-bold leading-tight">Halo, {user?.nama || 'Bendahara'}</h2>
          <p className="relative z-10 mt-1 max-w-[240px] text-[13px] leading-snug text-white/80">
            Pantau tagihan, tabungan, dan kas sekolah dari sini.
          </p>

          <div className="relative z-10 mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/admin/tagihan')} className="rounded-2xl bg-white p-3 text-left shadow-sm dark:bg-gray-900 active:scale-[.98] transition">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15"><WalletCards size={18} /></span>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Pendapatan</p>
              <p className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-white">{rupiah(Number(data?.lunas_bulan_ini?.nominal || 0))}</p>
            </button>
            <button onClick={() => navigate('/admin/tabungan')} className="rounded-2xl bg-white p-3 text-left shadow-sm dark:bg-gray-900 active:scale-[.98] transition">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15"><PiggyBank size={18} /></span>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Saldo Tabungan</p>
              <p className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-white">{rupiah(Number(data?.saldo_tabungan || 0))}</p>
            </button>
          </div>
        </section>

        {/* ── QUICK ACTIONS 2x2 (gaya sama dgn guru) ── */}
        <div className="grid grid-cols-2 gap-3">
          {quickMenus.slice(0, 4).map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.label}
                onClick={() => navigate(a.path)}
                className={`${a.bg} dark:bg-gray-900 rounded-2xl p-3 text-left active:scale-[0.97] transition`}
              >
                <div className="flex items-start justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.tile} text-white shadow-sm`}>
                    <Icon size={20} />
                  </span>
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
                <p className="mt-2.5 text-[13px] font-bold leading-tight text-slate-900 dark:text-white">{a.label}</p>
              </button>
            )
          })}
        </div>

        {/* ── STATUS TAGIHAN ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Status Tagihan</h2><p className="text-[11px] text-slate-400">Pembayaran seluruh siswa</p></div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15">{paidPercent}% lunas</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-500/20"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPercent}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/admin/tagihan')} className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 text-left dark:bg-emerald-500/10"><ArrowDownLeft className="text-emerald-600" size={20} /><div><p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{paid}</p><p className="text-[11px] text-slate-500 dark:text-gray-400">Sudah lunas</p></div></button>
            <button onClick={() => navigate('/admin/tagihan')} className="flex items-center gap-3 rounded-2xl bg-rose-50 p-3 text-left dark:bg-rose-500/10"><ArrowUpRight className="text-rose-600" size={20} /><div><p className="text-lg font-bold text-rose-700 dark:text-rose-400">{unpaid}</p><p className="text-[11px] text-slate-500 dark:text-gray-400">Belum bayar</p></div></button>
          </div>
        </section>

        {/* ── AKSES LAINNYA ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Akses Lainnya</h2>
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
            {quickMenus.slice(4).map(item => {
              const Icon = item.icon
              return <button key={item.label} onClick={() => navigate(item.path)} className="flex flex-col items-center gap-2 rounded-xl py-2 active:bg-slate-50 dark:active:bg-gray-800 active:scale-95 transition">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm ${item.tile}`}><Icon size={20} /></span>
                <span className="text-center text-[11px] font-medium leading-tight text-slate-600 dark:text-gray-300">{item.label}</span>
              </button>
            })}
            <button onClick={() => navigate('/admin/siswa')} className="flex flex-col items-center gap-2 rounded-xl py-2 active:bg-slate-50 dark:active:bg-gray-800 active:scale-95 transition">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm bg-teal-500"><UserCheck size={20} /></span>
              <span className="text-center text-[11px] font-medium leading-tight text-slate-600 dark:text-gray-300">{Number(data?.siswa_aktif || 0).toLocaleString('id-ID')} Siswa</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
