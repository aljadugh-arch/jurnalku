import { useEffect, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

interface KBMEvent { id: string; tanggal: string; judul: string; jenis: string; keterangan: string; warna: string }
interface Schedule { id: string; jam_mulai?: string; jam_selesai?: string; mapel_nama?: string; rombel_nama?: string; guru_nama?: string; nama_kegiatan?: string }

const jenisEvent = [
  { value: 'kbm_aktif', label: 'KBM Aktif', warna: '#3b82f6' },
  { value: 'libur', label: 'Libur', warna: '#ef4444' },
  { value: 'ujian', label: 'Ujian/UTS/UAS', warna: '#f59e0b' },
  { value: 'kegiatan', label: 'Kegiatan Sekolah', warna: '#10b981' },
  { value: 'rapat', label: 'Rapat', warna: '#8b5cf6' },
  { value: 'lainnya', label: 'Lainnya', warna: '#6b7280' },
]

export default function KalenderKBMPage() {
  const today = todayWib()
  const [currentDate, setCurrentDate] = useState(() => new Date(`${today}T12:00:00`))
  const [events, setEvents] = useState<KBMEvent[]>([])
  const [selectedDate, setSelectedDate] = useState(today)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ judul: '', jenis: 'kbm_aktif', keterangan: '', warna: '#3b82f6' })

  const loadEvents = async () => {
    try { const res = await api.get('/kalender-kbm', { params: { year: currentDate.getFullYear(), month: currentDate.getMonth() + 1 } }); setEvents(res.data || []) }
    catch { setEvents([]) }
  }
  const loadSchedules = async (tanggal: string) => {
    setScheduleLoading(true)
    try { const res = await api.get('/jadwal/tanggal', { params: { tanggal } }); setSchedules(res.data?.rows || []) }
    catch { setSchedules([]) }
    finally { setScheduleLoading(false) }
  }
  useEffect(() => { loadEvents() }, [currentDate])
  useEffect(() => { loadSchedules(selectedDate) }, [selectedDate])

  const getDateStr = (day: number) => `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
  const days: (number | null)[] = [...Array(firstDay === 0 ? 6 : firstDay - 1).fill(null), ...Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() }, (_, i) => i + 1)]
  const selectedEvents = events.filter(e => e.tanggal === selectedDate)
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

  const selectDay = (day: number) => setSelectedDate(getDateStr(day))
  const openAddEvent = () => { setForm({ judul: '', jenis: 'kbm_aktif', keterangan: '', warna: '#3b82f6' }); setShowModal(true) }
  const handleSave = async () => {
    if (!form.judul.trim()) return toast.error('Judul wajib diisi')
    try { await api.post('/kalender-kbm', { tanggal: selectedDate, ...form }); toast.success('Event ditambahkan'); setShowModal(false); loadEvents() }
    catch { toast.error('Gagal menyimpan') }
  }
  const handleDelete = async (id: string) => {
    try { await api.delete(`/kalender-kbm/${id}`); toast.success('Event dihapus'); loadEvents() }
    catch { toast.error('Gagal menghapus') }
  }

  return <div className="space-y-4 sm:space-y-6" data-calendar-schedule="true">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">Kalender Akademik</h1><p className="text-xs text-slate-500 sm:text-sm">Pilih tanggal untuk melihat jadwal mengajar</p></div>
      <button type="button" onClick={openAddEvent} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"><Plus size={16} /> Event</button>
    </div>

    <section className="rounded-3xl bg-white p-3 shadow-sm dark:bg-gray-900 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-gray-800"><ChevronLeft size={20} /></button>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white sm:text-lg">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-gray-800"><ChevronRight size={20} /></button>
      </div>
      <div className="mb-1 grid grid-cols-7">{['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-400 sm:text-xs">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) return <div key={index} className="aspect-square" />
          const dateStr = getDateStr(day); const dayEvents = events.filter(e => e.tanggal === dateStr); const active = dateStr === selectedDate
          return <button type="button" key={dateStr} onClick={() => selectDay(day)} aria-label={`Pilih ${dateStr}`} className={`relative aspect-square rounded-xl text-xs font-semibold transition sm:min-h-20 sm:rounded-2xl ${active ? 'bg-primary text-white shadow-md' : dateStr === today ? 'bg-primary/10 text-primary' : 'bg-slate-50 text-slate-700 dark:bg-gray-800 dark:text-gray-200'}`}><span>{day}</span>{dayEvents.length > 0 && <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${active ? 'bg-white' : 'bg-amber-500'}`} />}</button>
        })}
      </div>
    </section>

    <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900" data-selected-date={selectedDate}>
      <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Jadwal Hari Ini</h2><p className="text-[11px] text-slate-500">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div><Calendar size={20} className="text-primary" /></div>
      {scheduleLoading ? <p className="py-5 text-center text-xs text-slate-400">Memuat jadwal...</p> : schedules.length === 0 ? <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 dark:bg-gray-800">Tidak ada jadwal mengajar pada tanggal ini.</p> : <div className="space-y-2">{schedules.map(s => <div key={s.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-gray-800"><span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary"><Clock3 size={17} /></span><div className="min-w-0"><p className="text-xs font-bold text-slate-900 dark:text-white">{s.mapel_nama || s.nama_kegiatan || 'Kegiatan Pembelajaran'}</p><p className="mt-0.5 text-[11px] text-slate-500">{s.jam_mulai || '--:--'}–{s.jam_selesai || '--:--'} · {s.guru_nama || 'Guru'}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><MapPin size={11} /> {s.rombel_nama || '-'}</p></div></div>)}</div>}
      {selectedEvents.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3 dark:border-gray-800"><p className="mb-2 text-xs font-bold text-slate-700 dark:text-gray-200">Agenda Akademik</p>{selectedEvents.map(ev => <div key={ev.id} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-2 dark:bg-gray-800"><span className="flex min-w-0 items-center gap-2 text-xs"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ev.warna }} />{ev.judul}</span><button onClick={() => handleDelete(ev.id)} className="text-[10px] text-red-500">Hapus</button></div>)}</div>}
    </section>

    {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}><div className="w-full max-w-sm rounded-3xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="font-bold dark:text-white">Tambah Event</h2><button onClick={() => setShowModal(false)}><X size={20} /></button></div><p className="mb-3 text-xs text-slate-500">Tanggal: <strong>{selectedDate}</strong></p><div className="space-y-3"><input value={form.judul} onChange={e => setForm({ ...form, judul: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm dark:bg-gray-800" placeholder="Nama event" /><select value={form.jenis} onChange={e => { const item = jenisEvent.find(x => x.value === e.target.value); setForm({ ...form, jenis: e.target.value, warna: item?.warna || '#3b82f6' }) }} className="w-full rounded-xl border px-3 py-2 text-sm dark:bg-gray-800">{jenisEvent.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}</select><input value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm dark:bg-gray-800" placeholder="Keterangan (opsional)" /></div><button onClick={handleSave} className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white">Simpan Event</button></div></div>}
  </div>
}
