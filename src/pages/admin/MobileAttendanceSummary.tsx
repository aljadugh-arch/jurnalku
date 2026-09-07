import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Clock3, GraduationCap, QrCode, Thermometer } from 'lucide-react'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

interface Summary {
  tanggal: string
  totals: { hadir: number; sakit: number; izin: number; alpha: number }
  rombel: Array<{ id: string; nama: string; total_siswa: number; hadir: number; persentase: number }>
}

const initial: Summary = { tanggal: todayWib(), totals: { hadir: 0, sakit: 0, izin: 0, alpha: 0 }, rombel: [] }

export default function MobileAttendanceSummary({ tanggal = todayWib() }: { tanggal?: string }) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<Summary>(initial)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    api.get('/absensi-siswa/ringkasan', { params: { tanggal } }).then(res => setSummary(res.data)).catch(() => setSummary({ ...initial, tanggal })).finally(() => setLoading(false))
  }, [tanggal])
  const cards = [
    { label: 'Hadir', value: summary.totals.hadir, icon: <CheckCircle2 size={19} />, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Sakit', value: summary.totals.sakit, icon: <Thermometer size={19} />, tone: 'bg-amber-100 text-amber-700' },
    { label: 'Izin', value: summary.totals.izin, icon: <Clock3 size={19} />, tone: 'bg-sky-100 text-sky-700' },
    { label: 'Alpha', value: summary.totals.alpha, icon: <AlertCircle size={19} />, tone: 'bg-rose-100 text-rose-700' },
  ]
  return <div className="lg:hidden space-y-4" data-attendance-summary="true">
    <div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Presensi Siswa</h2><p className="text-xs text-slate-500">Akumulasi kehadiran {new Date(`${tanggal}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <div className="grid grid-cols-4 gap-2">{cards.map(card => <div key={card.label} className="rounded-2xl bg-white p-2.5 text-center shadow-sm dark:bg-gray-900"><span className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl ${card.tone}`}>{card.icon}</span><p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{loading ? '–' : card.value}</p><p className="text-[10px] text-slate-500">{card.label}</p></div>)}</div>
    <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
      <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Persentase Tiap Kelas/Rombel</h3>
      {loading ? <p className="py-8 text-center text-xs text-slate-400">Memuat rekap...</p> : summary.rombel.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">Belum ada data rombel.</p> : <div className="space-y-3">{summary.rombel.map(row => <button type="button" key={row.id} onClick={() => navigate(`/admin/absensi-siswa/kelas/${row.id}`)} className="block w-full rounded-2xl bg-slate-50 p-3 text-left active:scale-[0.99] dark:bg-gray-800"><div className="mb-2 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><GraduationCap size={17} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900 dark:text-white">{row.nama}</p><p className="text-[10px] text-slate-500">{row.hadir} hadir dari {row.total_siswa} siswa · buka absensi kelas</p></div><strong className="text-sm text-primary">{row.persentase}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, row.persentase)}%` }} /></div></button>)}</div>}
    </section>
    <Link to="/admin/absensi-qr-siswa" className="flex items-center gap-3 rounded-3xl bg-primary p-4 text-white shadow-sm active:scale-[0.99]">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20"><QrCode size={22} /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm">Scan QR Siswa</strong><span className="block text-[11px] text-white/80">Buka scan kamera, scan foto, lihat, dan unduh QR siswa</span></span>
      <span aria-hidden="true">›</span>
    </Link>
  </div>
}
