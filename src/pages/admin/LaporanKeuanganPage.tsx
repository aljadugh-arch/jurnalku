import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import api from '../../services/api'
import FinanceExcelPanel from '../../components/FinanceExcelPanel'
import MonthFilter, { bulanSekarang, labelBulan } from '../../components/MonthFilter'

type Laporan = {
  saldo_awal: number
  debet: number
  kredit: number
  saldo: number
  per_kategori: { nama: string; tipe: string; total: number }[]
  per_akun: { nama: string; debet: number; kredit: number }[]
  periode?: { bulan: string; mulai: string; selesai: string }
  bulan_tersedia?: string[]
}

const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0))

export default function LaporanKeuanganPage() {
  const [data, setData] = useState<Laporan | null>(null)
  // Default bulan berjalan: laporan keuangan hampir selalu dibuka untuk
  // "bulan ini", bukan untuk seluruh riwayat. Tombol "Semua" tetap ada untuk
  // yang butuh total keseluruhan.
  const [bulan, setBulan] = useState(bulanSekarang())
  const [loading, setLoading] = useState(true)

  const load = (b: string) => {
    setLoading(true)
    api.get('/keuangan/laporan', { params: { bulan: b || undefined } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(bulan) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5 pb-24 lg:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Laporan Keuangan</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Rekap uang masuk (debet) dan uang keluar (kredit) — {bulan ? labelBulan(bulan) : 'seluruh periode'}.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 shadow-sm">
        <MonthFilter
          nilai={bulan}
          onUbah={b => { setBulan(b); load(b) }}
          tersedia={data?.bulan_tersedia}
          label="Bulan laporan"
        />
        <span className="text-xs text-gray-400">
          {bulan ? `Data ${labelBulan(bulan)}` : 'Data seluruh periode'}
        </span>
      </div>

      {loading && <p className="py-10 text-center text-sm text-gray-400">Memuat laporan...</p>}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Saldo Awal</p>
              <p className="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">{rupiah(data.saldo_awal)}</p>
            </div>
            <div className="rounded-2xl border bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-900 p-4 shadow-sm">
              <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><ArrowDownLeft size={14} /> Uang Masuk (Debet)</p>
              <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400">{rupiah(data.debet)}</p>
            </div>
            <div className="rounded-2xl border bg-rose-50 dark:bg-rose-500/10 dark:border-rose-900 p-4 shadow-sm">
              <p className="flex items-center gap-1 text-xs text-rose-700 dark:text-rose-400"><ArrowUpRight size={14} /> Uang Keluar (Kredit)</p>
              <p className="mt-1 text-lg font-bold text-rose-700 dark:text-rose-400">{rupiah(data.kredit)}</p>
            </div>
            <div className="rounded-2xl border bg-blue-50 dark:bg-blue-500/10 dark:border-blue-900 p-4 shadow-sm">
              <p className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400"><Wallet size={14} /> Saldo Akhir</p>
              <p className="mt-1 text-lg font-bold text-blue-700 dark:text-blue-400">{rupiah(data.saldo)}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">Rekap per Kategori</h2>
              {data.per_kategori.length === 0 && <p className="py-4 text-center text-xs text-gray-400">Belum ada data.</p>}
              <div className="space-y-2">
                {data.per_kategori.map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate text-gray-600 dark:text-gray-300">{row.nama || '-'}</span>
                    <span className={row.tipe === 'masuk' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-rose-700 dark:text-rose-400'}>{row.tipe === 'masuk' ? '+' : '-'}{rupiah(row.total)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">Rekap per Akun</h2>
              {data.per_akun.length === 0 && <p className="py-4 text-center text-xs text-gray-400">Belum ada data.</p>}
              <div className="space-y-2">
                {data.per_akun.map((row, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium text-gray-700 dark:text-gray-200">{row.nama || '-'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Masuk {rupiah(row.debet)} • Keluar {rupiah(row.kredit)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && !data && <p className="py-10 text-center text-sm text-gray-400">Gagal memuat laporan.</p>}

      <div>
        <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">Ekspor &amp; Impor Data</h2>
        <FinanceExcelPanel />
      </div>
    </div>
  )
}
