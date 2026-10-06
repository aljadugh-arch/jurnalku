import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowUpRight, BookOpen, ChevronRight, FileBarChart,
  Landmark, PiggyBank, ReceiptText, Target, UserCheck, WalletCards,
} from 'lucide-react'
import MobileDashboardHeader from '../../components/MobileDashboardHeader'
import JadwalSholatCard from '../../components/JadwalSholatCard'

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
  { label: 'Laporan', path: '/admin/bendahara/laporan', icon: FileBarChart, tile: 'bg-cyan-500', bg: 'bg-cyan-50' },
  { label: 'Data Siswa', path: '/admin/siswa', icon: Landmark, tile: 'bg-rose-500', bg: 'bg-rose-50' },
]

export default function MobileBendaharaDashboard({ data }: { data: BendaharaData | null }) {
  const navigate = useNavigate()
  const paid = Number(data?.lunas_bulan_ini?.jumlah || 0)
  const unpaid = Number(data?.tagihan_belum?.jumlah || 0)
  const totalBills = paid + unpaid
  const paidPercent = totalBills ? Math.round((paid / totalBills) * 100) : 0

  return (
    <div className="min-h-[100dvh] -mx-4 -mt-3 bg-slate-50 pb-6 dark:bg-gray-950 sm:-mx-6">
      {/* ── HEADER: sama seperti dashboard admin & guru (logo lembaga + identitas) ── */}
      <div className="px-4 pt-4">
        <MobileDashboardHeader />
      </div>

      <div data-mobile-compact-dashboard="true" className="space-y-3 px-4 pt-3">
        {/* ── RINGKASAN KEUANGAN (dulu hero bergradasi; kini kartu senada) ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Target size={16} className="shrink-0 text-emerald-600" />
              Ringkasan Keuangan Hari Ini
            </h2>
            <p className="mt-0.5 break-words text-[11px] text-slate-400">Pantau tagihan, tabungan, dan kas sekolah dari sini.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/admin/tagihan')} className="rounded-2xl bg-emerald-50 p-3 text-left active:scale-[.98] transition dark:bg-emerald-500/10">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15"><WalletCards size={18} /></span>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Pendapatan</p>
              <p className="mt-0.5 break-words text-sm font-bold text-slate-900 dark:text-white">{rupiah(Number(data?.lunas_bulan_ini?.nominal || 0))}</p>
            </button>
            <button onClick={() => navigate('/admin/tabungan')} className="rounded-2xl bg-blue-50 p-3 text-left active:scale-[.98] transition dark:bg-blue-500/10">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15"><PiggyBank size={18} /></span>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Saldo Tabungan</p>
              <p className="mt-0.5 break-words text-sm font-bold text-slate-900 dark:text-white">{rupiah(Number(data?.saldo_tabungan || 0))}</p>
            </button>
          </div>
        </section>

        {/* ── QUICK ACTIONS 2x2 ── */}
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
                <p className="mt-2.5 break-words text-[13px] font-bold leading-tight text-slate-900 dark:text-white">{a.label}</p>
              </button>
            )
          })}
        </div>

        {/* ── STATUS TAGIHAN ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="min-w-0"><h2 className="text-sm font-bold text-slate-900 dark:text-white">Status Tagihan</h2><p className="break-words text-[11px] text-slate-400">Pembayaran seluruh siswa</p></div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15">{paidPercent}% lunas</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-500/20"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPercent}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/admin/tagihan')} className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 text-left dark:bg-emerald-500/10"><ArrowDownLeft className="shrink-0 text-emerald-600" size={20} /><div className="min-w-0"><p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{paid}</p><p className="break-words text-[11px] text-slate-500 dark:text-gray-400">Sudah lunas</p></div></button>
            <button onClick={() => navigate('/admin/tagihan')} className="flex items-center gap-3 rounded-2xl bg-rose-50 p-3 text-left dark:bg-rose-500/10"><ArrowUpRight className="shrink-0 text-rose-600" size={20} /><div className="min-w-0"><p className="text-lg font-bold text-rose-700 dark:text-rose-400">{unpaid}</p><p className="break-words text-[11px] text-slate-500 dark:text-gray-400">Belum bayar</p></div></button>
          </div>
        </section>

        {/* ── JADWAL SHOLAT (komponen bersama, sama dgn admin & guru) ── */}
        <JadwalSholatCard />

        {/* ── AKSES LAINNYA ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Akses Lainnya</h2>
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
            {quickMenus.slice(4).map(item => {
              const Icon = item.icon
              return <button key={item.label} onClick={() => navigate(item.path)} className="flex min-w-0 flex-col items-center gap-2 rounded-xl py-2 active:bg-slate-50 dark:active:bg-gray-800 active:scale-95 transition">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm ${item.tile}`}><Icon size={20} /></span>
                <span className="break-words text-center text-[11px] font-medium leading-tight text-slate-600 dark:text-gray-300">{item.label}</span>
              </button>
            })}
            <button onClick={() => navigate('/admin/siswa')} className="flex min-w-0 flex-col items-center gap-2 rounded-xl py-2 active:bg-slate-50 dark:active:bg-gray-800 active:scale-95 transition">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm bg-teal-500"><UserCheck size={20} /></span>
              <span className="break-words text-center text-[11px] font-medium leading-tight text-slate-600 dark:text-gray-300">{Number(data?.siswa_aktif || 0).toLocaleString('id-ID')} Siswa</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
