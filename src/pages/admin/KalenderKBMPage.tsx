import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface KBMEvent {
  id: string
  tanggal: string
  judul: string
  jenis: string
  keterangan: string
  warna: string
}

const jenisEvent = [
  { value: 'kbm_aktif', label: 'KBM Aktif', warna: '#3b82f6' },
  { value: 'libur', label: 'Libur', warna: '#ef4444' },
  { value: 'ujian', label: 'Ujian/UTS/UAS', warna: '#f59e0b' },
  { value: 'kegiatan', label: 'Kegiatan Sekolah', warna: '#10b981' },
  { value: 'rapat', label: 'Rapat', warna: '#8b5cf6' },
  { value: 'lainnya', label: 'Lainnya', warna: '#6b7280' },
]

export default function KalenderKBMPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<KBMEvent[]>([])
  const [showModal, setShowModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [form, setForm] = useState({ judul: '', jenis: 'kbm_aktif', keterangan: '', warna: '#3b82f6' })

  useEffect(() => { loadEvents() }, [currentDate])

  const loadEvents = async () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    try {
      const res = await api.get('/kalender-kbm', { params: { year, month } })
      setEvents(res.data)
    } catch { /* empty */ }
  }

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: (number | null)[] = []
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)
    return days
  }

  const getDateStr = (day: number) => {
    const y = currentDate.getFullYear()
    const m = String(currentDate.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}-${String(day).padStart(2, '0')}`
  }

  const getEventsForDay = (day: number) => events.filter(e => e.tanggal === getDateStr(day))

  const handleDayClick = (day: number) => {
    setSelectedDate(getDateStr(day))
    setForm({ judul: '', jenis: 'kbm_aktif', keterangan: '', warna: '#3b82f6' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.judul.trim()) { toast.error('Judul wajib diisi'); return }
    try {
      await api.post('/kalender-kbm', { tanggal: selectedDate, ...form })
      toast.success('Event ditambahkan')
      setShowModal(false)
      loadEvents()
    } catch { toast.error('Gagal menyimpan') }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete('/kalender-kbm/' + id)
      toast.success('Event dihapus')
      loadEvents()
    } catch { toast.error('Gagal menghapus') }
  }

  const today = new Date().toISOString().split('T')[0]
  const days = getDaysInMonth()
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Kalender KBM</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola kalender kegiatan belajar mengajar</p>
        </div>
        <div className="flex items-center gap-2">
          {jenisEvent.map(j => (
            <span key={j.value} className="flex items-center gap-1 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: j.warna }}></span> {j.label}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-6">
        {/* Header Navigasi */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <h2 className="text-lg font-bold text-gray-800">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
        </div>

        {/* Header Hari */}
        <div className="grid grid-cols-7 mb-2">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
          ))}
        </div>

        {/* Grid Tanggal */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {days.map((day, i) => {
            if (!day) return <div key={i} className="h-16 sm:h-24" />
            const dateStr = getDateStr(day)
            const dayEvents = getEventsForDay(day)
            const isToday = dateStr === today
            return (
              <div key={i} onClick={() => handleDayClick(day)} className={`h-16 sm:h-24 p-0.5 sm:p-1 border rounded-lg cursor-pointer hover:bg-blue-50 transition overflow-hidden ${isToday ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100'}`}>
                <div className={`text-[11px] sm:text-xs font-medium mb-0.5 sm:mb-1 leading-none ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{day}</div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(ev => (
                    <div key={ev.id} className="text-[9px] sm:text-[10px] px-1 py-0.5 rounded truncate text-white leading-tight" style={{ background: ev.warna || '#3b82f6' }}>
                      {ev.judul}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <div className="text-[9px] sm:text-[10px] text-gray-500">+{dayEvents.length - 3} lagi</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Event List for selected month */}
      {events.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2"><Calendar size={16} /> Event Bulan Ini</h3>
          <div className="space-y-2">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ev.warna }}></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{ev.judul}</p>
                    <p className="text-xs text-gray-500 truncate">{ev.tanggal} &bull; {jenisEvent.find(j => j.value === ev.jenis)?.label || ev.jenis}</p>
                  </div>
                </div>
                <button onClick={() => handleDelete(ev.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg text-xs shrink-0">Hapus</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Tambah Event */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Tambah Event</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Tanggal: <strong>{selectedDate}</strong></p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Judul</label>
                <input value={form.judul} onChange={e => setForm({...form, judul: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Nama event" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Jenis</label>
                <select value={form.jenis} onChange={e => { const j = jenisEvent.find(x => x.value === e.target.value); setForm({...form, jenis: e.target.value, warna: j?.warna || '#3b82f6'}) }} className="w-full px-3 py-2 border rounded-lg text-sm">
                  {jenisEvent.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                <input value={form.keterangan} onChange={e => setForm({...form, keterangan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Opsional" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg text-sm">Batal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
