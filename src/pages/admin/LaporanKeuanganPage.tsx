import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Wallet, FileSpreadsheet, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import FinanceExcelPanel from '../../components/FinanceExcelPanel'
import PeriodeFilter, { rentangPeriode, labelPeriode, type PeriodeNilai } from '../../components/PeriodeFilter'
import { unduhExcel } from '../../utils/excelExport'
import { openFinanceReport } from '../../utils/financeReport'
import { useSettingsStore } from '../../stores/settingsStore'
import { todayWib } from '../../lib/dateFormat'

type Laporan = {
  saldo_awal: number
  debet: number
  kredit: number
  saldo: number
  per_kategori: { nama: string; tipe: string; total: number }[]
  per_akun: { nama: string; debet: number; kredit: number }[]
}

type Transaksi = { id: string; tanggal: string; akun_nama: string; kategori_nama: string; tipe: string; nominal: number; keterangan: string }

const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0))
const fmt = (n: unknown) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

export default function LaporanKeuanganPage() {
  const settings = useSettingsStore(s => s.settings)
  const [periode, setPeriode] = useState<PeriodeNilai>(() => rentangPeriode('bulan', todayWib().slice(0, 7)))
  const [data, setData] = useState<Laporan | null>(null)
  const [transaksi, setTransaksi] = useState<Transaksi[]>([])
  const [loading, setLoading] = useState(true)

  const load = (p: PeriodeNilai) => {
    setLoading(true)
    const paramsLaporan: any = {}
    if (p.mode === 'bulan') paramsLaporan.bulan = p.mulai.slice(0, 7)
    else { paramsLaporan.mulai = p.mulai; paramsLaporan.selesai = p.selesai }
    Promise.all([
      api.get('/keuangan/laporan', { params: paramsLaporan }),
      api.get('/keuangan/transaksi', { params: { mulai: p.mulai, selesai: p.selesai } }),
    ])
      .then(([lr, tr]) => { setData(lr.data); setTransaksi(tr.data || []) })
      .catch(() => { setData(null); setTransaksi([]) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(periode) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const gantiPeriode = (p: PeriodeNilai) => { setPeriode(p); load(p) }
  const labelPer = labelPeriode(periode)

  const handleExcel = () => {
    if (!transaksi.length) { toast.error('Tidak ada transaksi pada periode ini'); return }
    unduhExcel(
      [{ name: 'Laporan Keuangan', rows: transaksi, columns: [
        { header: 'TANGGAL', value: 'tanggal', width: 12 },
        { header: 'AKUN', value: 'akun_nama', width: 22 },
        { header: 'KATEGORI', value: 'kategori_nama', width: 22 },
        { header: 'TIPE', value: (t: any) => t.tipe === 'masuk' ? 'Masuk' : 'Keluar', width: 10 },
        { header: 'NOMINAL', value: (t: any) => Number(t.nominal || 0), width: 16, numFmt: '#,##0' },
        { header: 'KETERANGAN', value: 'keterangan', width: 28 },
      ] }],
      { title: 'Laporan Keuangan', filename: 'Laporan_Keuangan', subtitle: `Periode: ${labelPer}`, settings: settings as Record<string, unknown> },
    )
    toast.success('Excel laporan keuangan diunduh')
  }

  const handlePdf = () => {
    if (!transaksi.length) { toast.error('Tidak ada transaksi pada periode ini'); return }
    const ok = openFinanceReport({
      title: 'Laporan Keuangan',
      periode: labelPer,
      settings: settings as Record<string, unknown>,
      columns: ['NO', 'TANGGAL', 'AKUN', 'KATEGORI', 'TIPE', 'NOMINAL', 'KETERANGAN'],
      rows: transaksi.map((t, i) => [
        String(i + 1),
        t.tanggal,
        { text: t.akun_nama || '-', align: 'left' },
        { text: t.kategori_nama || '-', align: 'left' },
        t.tipe === 'masuk' ? 'Masuk' : 'Keluar',
        fmt(t.nominal),
        { text: t.keterangan || '-', align: 'left' },
      ]),
      totals: ['TOTAL', '', '', '', '', `Masuk ${fmt(data?.debet)} · Keluar ${fmt(data?.kredit)}`, ''],
      summary: [
        { label: 'Saldo Awal', value: fmt(data?.saldo_awal) },
        { label: 'Pemasukan', value: fmt(data?.debet) },
        { label: 'Pengeluaran', value: fmt(data?.kredit) },
        { label: 'Saldo Akhir', value: fmt(data?.saldo) },
      ],
      footnotes: [`Periode: ${labelPer}`, `Jumlah transaksi: ${transaksi.length}`],
    })
    if (!ok) toast.error('Popup diblokir browser')
  }

  return (
    <div className="space-y-5 pb-24 lg:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Laporan Keuangan</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Rekap uang masuk (debet) dan keluar (kredit) — {labelPer}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExcel} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
            <FileSpreadsheet size={16} className="text-emerald-600" /> Excel
          </button>
          <button onClick={handlePdf} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
            <Printer size={16} className="text-rose-600" /> PDF
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PeriodeFilter nilai={periode} onUbah={gantiPeriode} label="Periode laporan" />
          <span className="text-xs text-gray-400">{transaksi.length} transaksi pada periode ini</span>
        </div>
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

          <div className="rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">Transaksi Periode Ini ({transaksi.length})</h2>
            {transaksi.length === 0
              ? <p className="py-4 text-center text-xs text-gray-400">Belum ada transaksi pada periode ini.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-gray-500 dark:text-gray-400">
                        <th className="py-2 pr-3">Tanggal</th>
                        <th className="py-2 pr-3">Akun</th>
                        <th className="py-2 pr-3">Kategori</th>
                        <th className="py-2 pr-3">Tipe</th>
                        <th className="py-2 pr-3 text-right">Nominal</th>
                        <th className="py-2">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transaksi.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 text-gray-700 dark:text-gray-200">
                          <td className="py-2 pr-3 whitespace-nowrap">{row.tanggal}</td>
                          <td className="py-2 pr-3">{row.akun_nama || '-'}</td>
                          <td className="py-2 pr-3">{row.kategori_nama || '-'}</td>
                          <td className="py-2 pr-3">
                            <span className={`rounded px-2 py-0.5 text-xs ${row.tipe === 'masuk' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'}`}>
                              {row.tipe === 'masuk' ? 'Masuk' : 'Keluar'}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap font-medium">{rupiah(row.nominal)}</td>
                          <td className="py-2 text-gray-500 dark:text-gray-400">{row.keterangan || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </>
      )}

      {!loading && !data && <p className="py-10 text-center text-sm text-gray-400">Gagal memuat laporan.</p>}

      <div>
        <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">Ekspor &amp; Impor Data Lengkap</h2>
        <FinanceExcelPanel />
      </div>
    </div>
  )
}
