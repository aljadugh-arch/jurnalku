import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, LogIn, LogOut, MapPin } from 'lucide-react'

interface RecordRow { id?: string; tanggal?: string; waktu_masuk?: string | null; waktu_pulang?: string | null; status?: string }
interface Props { today: RecordRow | null; history: RecordRow[]; loading: boolean; busy: boolean; onCeklok: (type: 'masuk' | 'pulang') => void }

export default function MobileCeklok({ today, history, loading, busy, onCeklok }: Props) {
  const [tab, setTab] = useState<'masuk' | 'pulang'>('masuk')
  const [now, setNow] = useState(new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer) }, [])
  const todayKey = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
  const start = new Date(`${todayKey}T00:00:00+07:00`); start.setDate(start.getDate() - 6)
  const weekly = useMemo(() => history.filter(row => row.tanggal && new Date(`${row.tanggal}T00:00:00+07:00`) >= start).slice(0, 7), [history, todayKey])
  const done = tab === 'masuk' ? !!today?.waktu_masuk : !!today?.waktu_pulang
  return <div className="lg:hidden space-y-4" data-mobile-ceklok="true">
    <div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Ceklok GTK</h1><p className="text-xs text-slate-500">Presensi berbasis waktu dan lokasi lembaga</p></div>
    <section className="overflow-hidden rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
      <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-gray-800">
        {(['masuk', 'pulang'] as const).map(item => <button key={item} onClick={() => setTab(item)} className={`rounded-xl py-2.5 text-xs font-bold capitalize transition ${tab === item ? 'bg-white text-primary shadow-sm dark:bg-gray-700' : 'text-slate-500'}`}>{item === 'masuk' ? 'Masuk' : 'Pulang'}</button>)}
      </div>
      <div className="py-7 text-center"><Clock3 size={28} className="mx-auto mb-2 text-primary" /><p className="font-mono text-4xl font-bold tracking-tight text-slate-950 dark:text-white">{now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false })}</p><p className="mt-1 text-xs text-slate-500">{now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
      <button type="button" disabled={busy || loading || done} onClick={() => onCeklok(tab)} className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-50 ${tab === 'masuk' ? 'bg-emerald-600' : 'bg-sky-600'}`}>{tab === 'masuk' ? <LogIn size={18} /> : <LogOut size={18} />}{done ? `Sudah Absen ${tab === 'masuk' ? 'Masuk' : 'Pulang'}` : `Absen ${tab === 'masuk' ? 'Masuk' : 'Pulang'}`}</button>
      <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-slate-400"><MapPin size={11} /> Lokasi akan diverifikasi saat tombol ditekan</p>
    </section>
    <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900"><h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Riwayat Ceklok Hari Ini</h2>{today ? <div className="grid grid-cols-2 gap-3"><HistoryTime label="Masuk" value={today.waktu_masuk} color="text-emerald-600" /><HistoryTime label="Pulang" value={today.waktu_pulang} color="text-sky-600" /></div> : <p className="rounded-2xl bg-slate-50 py-5 text-center text-xs text-slate-400 dark:bg-gray-800">Belum ada ceklok hari ini.</p>}</section>
    <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900"><h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><CalendarDays size={16} className="text-primary" /> Riwayat Ceklok Pekan Ini</h2>{weekly.length === 0 ? <p className="py-5 text-center text-xs text-slate-400">Belum ada riwayat pekan ini.</p> : <div className="divide-y divide-slate-100 dark:divide-gray-800">{weekly.map((row, i) => <div key={row.id || `${row.tanggal}-${i}`} className="flex items-center justify-between py-3"><div><p className="text-xs font-bold text-slate-800 dark:text-white">{row.tanggal ? new Date(`${row.tanggal}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }) : '-'}</p><p className="text-[10px] capitalize text-slate-400">{row.status || 'belum tercatat'}</p></div><p className="text-[11px] text-slate-600 dark:text-gray-300"><b>{row.waktu_masuk || '--:--'}</b> – <b>{row.waktu_pulang || '--:--'}</b></p></div>)}</div>}</section>
  </div>
}

function HistoryTime({ label, value, color }: { label: string; value?: string | null; color: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3 text-center dark:bg-gray-800"><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-1 font-mono text-lg font-bold ${color}`}>{value || '--:--'}</p></div>
}
