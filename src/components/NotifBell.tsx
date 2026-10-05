import { useEffect, useState } from 'react'
import { Bell, UserCheck, QrCode, DoorOpen, ClipboardList } from 'lucide-react'
import api from '../services/api'

type NotifItem = { id: string; event_type: string; label: string; metadata: any; created_at: string }

const NOTIF_ICONS: Record<string, any> = {
  teacher_checkin: UserCheck,
  teacher_checkout: UserCheck,
  student_qr_attendance: QrCode,
  class_session_started: DoorOpen,
  class_session_finished: DoorOpen,
  assignment_created: ClipboardList,
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso + 'Z').getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'Baru saja'
  if (min < 60) return `${min} menit lalu`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} jam lalu`
  return `${Math.floor(hour / 24)} hari lalu`
}

/**
 * Tombol lonceng + daftar notifikasi aktivitas terkini (ceklok, absensi QR, sesi
 * kelas, penugasan). Dipakai bersama oleh MobileHeader dan header dashboard.
 * `light` dipakai saat tombol berada di atas latar berwarna.
 */
export default function NotifBell({
  light = false,
  className = '',
}: {
  light?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.get('/notifications/feed', { params: { limit: 20 } })
      .then(res => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={light
          ? 'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 active:scale-95 transition'
          : 'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800 active:scale-95 transition'}
        aria-label="Notifikasi"
      >
        <Bell size={19} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/20 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-[100] w-80 max-w-[86vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-gray-100 bg-slate-50/50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Notifikasi Terkini</p>
              <p className="text-xs text-slate-500 dark:text-gray-400">Ceklok, absensi QR, sesi kelas &amp; penugasan</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading && <p className="px-4 py-6 text-center text-xs text-slate-400">Memuat...</p>}
              {!loading && items.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-slate-400">Belum ada aktivitas terbaru.</p>
              )}
              {!loading && items.map(item => {
                const Icon = NOTIF_ICONS[item.event_type] || Bell
                return (
                  <div key={item.id} className="flex items-start gap-3 border-b border-gray-50 px-4 py-3 last:border-0 dark:border-gray-800">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs font-medium text-gray-800 dark:text-gray-100">{item.label}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(item.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
