import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

type Assignment = {
  id?: string
  paket_id?: string
  paketId?: string
  nama?: string
  paket_nama?: string
  mapel_nama?: string
  mulai?: string
  selesai?: string
  rombel_nama?: string
  rombel?: string
  rombels?: string[]
}

type Participant = {
  siswa_id?: string
  id?: string
  nama?: string
  siswa_nama?: string
  nis?: string
  rombel?: string
  rombel_nama?: string
  status?: string
  answered_count?: number
  jumlah_soal?: number
  total_soal?: number
  last_seen_at?: string | null
  extra_time_minutes?: number
}

type MonitorData = {
  paket?: Assignment & { jumlah_soal?: number }
  participants?: Participant[]
  peserta?: Participant[]
  server_time?: string
}

const statusStyles: Record<string, string> = {
  online: 'bg-emerald-100 text-emerald-700',
  stale: 'bg-amber-100 text-amber-700',
  offline: 'bg-red-100 text-red-700',
  selesai: 'bg-blue-100 text-blue-700',
  belum: 'bg-gray-100 text-gray-600',
}

const paketId = (assignment?: Assignment | null) => assignment?.paket_id || assignment?.paketId || assignment?.id || ''
const participantId = (participant: Participant) => participant.siswa_id || participant.id || ''

function formatLastSeen(value?: string | null) {
  if (!value) return 'Belum ada aktivitas'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID')
}

export default function ProktorDashboardPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [monitor, setMonitor] = useState<MonitorData | null>(null)
  const [loadingAssignments, setLoadingAssignments] = useState(true)
  const [loadingMonitor, setLoadingMonitor] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  const [monitorError, setMonitorError] = useState('')
  const [acting, setActing] = useState('')

  const loadAssignments = useCallback(async () => {
    setLoadingAssignments(true)
    setAssignmentError('')
    try {
      const { data } = await api.get('/ujian/proktor/assignments')
      const rawRows: Assignment[] = Array.isArray(data) ? data : data.assignments || data.data || []
      const grouped = new Map<string, Assignment>()
      rawRows.forEach(row => {
        const id = paketId(row)
        if (!id) return
        const rombel = row.rombel_nama || row.rombel
        const current = grouped.get(id)
        grouped.set(id, {
          ...current,
          ...row,
          rombels: Array.from(new Set([...(current?.rombels || []), ...(rombel ? [rombel] : [])])),
        })
      })
      const rows = Array.from(grouped.values())
      setAssignments(rows)
      setSelectedId(current => current && rows.some((row: Assignment) => paketId(row) === current) ? current : paketId(rows[0]))
    } catch (error: any) {
      setAssignmentError(error.response?.data?.error || 'Gagal memuat penugasan proktor.')
    } finally {
      setLoadingAssignments(false)
    }
  }, [])

  const loadMonitor = useCallback(async (quiet = false) => {
    if (!selectedId) return
    if (!quiet) setLoadingMonitor(true)
    setMonitorError('')
    try {
      const { data } = await api.get(`/ujian/${selectedId}/monitor`)
      setMonitor(data)
    } catch (error: any) {
      setMonitorError(error.response?.data?.error || 'Gagal memuat data monitoring.')
    } finally {
      if (!quiet) setLoadingMonitor(false)
    }
  }, [selectedId])

  useEffect(() => { void loadAssignments() }, [loadAssignments])
  useEffect(() => {
    setMonitor(null)
    if (!selectedId) return
    void loadMonitor()
    const timer = window.setInterval(() => void loadMonitor(true), 7000)
    return () => window.clearInterval(timer)
  }, [selectedId, loadMonitor])

  const participants = useMemo(() => monitor?.participants || monitor?.peserta || [], [monitor])
  const monitoredQuestionCount = monitor?.paket?.jumlah_soal || 0
  const counts = useMemo(() => participants.reduce<Record<string, number>>((result, participant) => {
    const status = participant.status || 'belum'
    result[status] = (result[status] || 0) + 1
    return result
  }, {}), [participants])

  const runAction = async (participant: Participant, action: 'force-submit' | 'tambah-waktu') => {
    const id = participantId(participant)
    if (!id || !selectedId) return
    const name = participant.nama || participant.siswa_nama || 'peserta'
    let minutes: number | undefined
    if (action === 'tambah-waktu') {
      const raw = window.prompt(`Tambahan waktu untuk ${name} (menit):`, '10')
      if (raw === null) return
      minutes = Number(raw)
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
        return void toast.error('Tambahan waktu harus berupa angka 1-180 menit.')
      }
    }
    const reason = window.prompt(`Alasan ${action === 'force-submit' ? 'paksa kumpul' : 'tambah waktu'} untuk ${name}:`)
    if (!reason?.trim()) return void toast.error('Alasan wajib diisi.')
    const confirmed = window.confirm(action === 'force-submit'
      ? `Paksa kumpulkan ujian ${name}? Tindakan ini tidak dapat dibatalkan.`
      : `Tambahkan ${minutes} menit untuk ${name}?`)
    if (!confirmed) return

    const actionKey = `${action}:${id}`
    setActing(actionKey)
    try {
      await api.post(`/ujian/${selectedId}/proktor/${id}/${action}`, {
        reason: reason.trim(),
        ...(minutes ? { minutes, tambahan_menit: minutes } : {}),
      })
      toast.success(action === 'force-submit' ? 'Ujian berhasil dikumpulkan.' : 'Waktu berhasil ditambahkan.')
      await loadMonitor(true)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Tindakan proktor gagal.')
    } finally {
      setActing('')
    }
  }

  const selected = assignments.find(item => paketId(item) === selectedId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Monitor Ujian</h1>
          <p className="mt-1 text-sm text-gray-500">Pantau peserta pada paket ujian yang ditugaskan kepada Anda.</p>
        </div>
        <button onClick={() => { void loadAssignments(); void loadMonitor() }} disabled={loadingAssignments || loadingMonitor} className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
          <RefreshCw size={16} className={loadingAssignments || loadingMonitor ? 'animate-spin' : ''} /> Segarkan
        </button>
      </div>

      {loadingAssignments ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-12 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900"><Loader2 size={20} className="animate-spin" /> Memuat penugasan...</div>
      ) : assignmentError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><div className="flex items-center gap-2 font-medium"><AlertCircle size={18} /> {assignmentError}</div><button onClick={() => void loadAssignments()} className="mt-3 underline">Coba lagi</button></div>
      ) : assignments.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center dark:border-gray-800 dark:bg-gray-900"><Users className="mx-auto mb-3 text-gray-300" size={36} /><p className="font-medium text-gray-700 dark:text-gray-200">Belum ada paket ujian yang ditugaskan</p><p className="mt-1 text-sm text-gray-500">Hubungi admin untuk mendapatkan penugasan.</p></div>
      ) : (
        <>
          <section className="rounded-xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Paket ujian</label>
            <select value={selectedId} onChange={event => setSelectedId(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              {assignments.map(item => <option key={paketId(item)} value={paketId(item)}>{item.nama || item.paket_nama || 'Paket ujian'}{item.rombels?.length || item.rombel_nama || item.rombel ? ` — ${item.rombels?.join(', ') || item.rombel_nama || item.rombel}` : ''}</option>)}
            </select>
            {selected && <p className="mt-2 text-xs text-gray-500">{selected.mapel_nama || 'Mata pelajaran'}{selected.mulai ? ` • ${new Date(selected.mulai).toLocaleString('id-ID')}` : ''}</p>}
          </section>

          {loadingMonitor && !monitor ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500"><Loader2 size={20} className="animate-spin" /> Memuat monitor...</div>
          ) : monitorError && !monitor ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{monitorError}</div>
          ) : (
            <>
              {monitorError && <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">Data terakhir ditampilkan. Pembaruan otomatis gagal: {monitorError}</div>}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><Users size={19} className="text-gray-700" /><p className="mt-3 text-2xl font-bold text-gray-800 dark:text-gray-100">{participants.length}</p><p className="text-xs text-gray-500">Total</p></div>
                <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><Activity size={19} className="text-emerald-600" /><p className="mt-3 text-2xl font-bold text-gray-800 dark:text-gray-100">{counts.online || 0}</p><p className="text-xs text-gray-500">Online</p></div>
                <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><Clock3 size={19} className="text-amber-600" /><p className="mt-3 text-2xl font-bold text-gray-800 dark:text-gray-100">{counts.stale || 0}</p><p className="text-xs text-gray-500">Terlambat</p></div>
                <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><AlertCircle size={19} className="text-red-600" /><p className="mt-3 text-2xl font-bold text-gray-800 dark:text-gray-100">{counts.offline || 0}</p><p className="text-xs text-gray-500">Offline</p></div>
                <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><CheckCircle2 size={19} className="text-blue-600" /><p className="mt-3 text-2xl font-bold text-gray-800 dark:text-gray-100">{counts.selesai || 0}</p><p className="text-xs text-gray-500">Selesai</p></div>
              </div>

              <div className="overflow-hidden rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b px-5 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-gray-100">Peserta</h2><p className="text-xs text-gray-500">Diperbarui otomatis setiap 7 detik</p></div>
                {participants.length === 0 ? <p className="p-10 text-center text-sm text-gray-500">Belum ada peserta pada paket ini.</p> : (
                  <div className="divide-y dark:divide-gray-800">
                    {participants.map(participant => {
                      const status = participant.status || 'belum'
                      const answered = participant.answered_count || 0
                      const total = participant.total_soal || participant.jumlah_soal || monitoredQuestionCount
                      const progress = total ? Math.min(100, Math.round(answered / total * 100)) : 0
                      const id = participantId(participant)
                      return <article key={id} className="p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-800 dark:text-gray-100">{participant.nama || participant.siswa_nama || 'Peserta'}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status] || statusStyles.belum}`}>{status}</span>{participant.extra_time_minutes ? <span className="text-xs text-indigo-600">+{participant.extra_time_minutes} menit</span> : null}</div>
                            <p className="mt-1 text-xs text-gray-500">{participant.nis || '-'} • {participant.rombel_nama || participant.rombel || 'Tanpa rombel'}</p>
                            <div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><span className="w-24 text-right text-xs text-gray-500">{answered}/{total || '-'} ({progress}%)</span></div>
                            <p className="mt-2 text-xs text-gray-400">Terakhir terlihat: {formatLastSeen(participant.last_seen_at)}</p>
                          </div>
                          {status !== 'selesai' && <div className="flex flex-wrap gap-2">
                            <button disabled={!!acting} onClick={() => void runAction(participant, 'tambah-waktu')} className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{acting === `tambah-waktu:${id}` ? 'Memproses...' : 'Tambah waktu'}</button>
                            <button disabled={!!acting} onClick={() => void runAction(participant, 'force-submit')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">{acting === `force-submit:${id}` ? 'Memproses...' : 'Paksa kumpul'}</button>
                          </div>}
                        </div>
                      </article>
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
