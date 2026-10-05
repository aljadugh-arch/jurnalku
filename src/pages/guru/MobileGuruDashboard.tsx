import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen, Calendar, ChevronRight, DoorOpen, Fingerprint, LogIn, Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import MobileDashboardHeader from '../../components/MobileDashboardHeader'

/* ─── helpers ─── */
function nowMinutes() {
  const wib = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const [h, m] = wib.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function toMinutes(t: string) {
  if (!t) return -1
  const [h, m] = String(t).split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : -1
}

function getJadwalStatus(j: any, cur: number): 'active' | 'done' | 'upcoming' {
  const s = toMinutes(j.jam_mulai)
  const e = toMinutes(j.jam_selesai)
  if (j.sesi_status === 'selesai' || (e >= 0 && cur > e)) return 'done'
  if (s >= 0 && e >= 0 && cur >= s && cur <= e) return 'active'
  return 'upcoming'
}

/* ─── component ─── */
export default function MobileGuruDashboard() {
  const [data, setData] = useState<any>({
    jadwal_hari_ini: [], sesi_kelas_aktif: null,
    rekap_jurnal: { draft: 0, submitted: 0, approved: 0, total: 0 },
    rombel_count: 0, gtk: null, siswa_rombel_count: 0, nilai_siswa_count: 0,
    absensi_hari_ini: 0,
  })
  const [ceklok, setCeklok] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(
    () => api.get('/guru/dashboard').then(res => setData(res.data)).catch(() => {}),
    [],
  )

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get('/guru/absensi-saya').then(r => setCeklok(r.data)).catch(() => setCeklok(null))
  }, [])

  const cur = nowMinutes()

  const sortedJadwal = useMemo(
    () => [...(data.jadwal_hari_ini || [])].sort(
      (a: any, b: any) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai),
    ),
    [data.jadwal_hari_ini],
  )

  const pendingJurnal = useMemo(() => {
    const r = data.rekap_jurnal || {}
    return (r.draft ?? 0) + (r.submitted ?? 0)
  }, [data.rekap_jurnal])

  const enterClass = async (jadwal: any) => {
    if (!jadwal?.id) return toast.error('Tidak ada jadwal mengajar hari ini')
    setBusy(true)
    try {
      await api.post('/guru/sesi-kelas/masuk', { jadwal_id: jadwal.id })
      toast.success(`Masuk kelas ${jadwal.rombel_nama || ''}`.trim())
      await load()
      navigate(`/guru/jurnal?jadwal_id=${encodeURIComponent(jadwal.id)}`)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mencatat masuk kelas')
    } finally { setBusy(false) }
  }

  const finishClass = async () => {
    if (!data.sesi_kelas_aktif?.id) return
    setBusy(true)
    try {
      await api.post('/guru/sesi-kelas/selesai', { sesi_id: data.sesi_kelas_aktif?.id })
      toast.success('Sesi kelas diselesaikan')
      await load()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyelesaikan kelas')
    } finally { setBusy(false) }
  }

  // Peran: GURU, dan ditambah WALI MURID bila guru ini juga wali kelas.
  const peran = `GURU${(data.siswa_rombel_count ?? 0) > 0 ? ' · WALI MURID' : ''}`

  const statusCeklok = (() => {
    const t = ceklok?.today
    if (!t) return 'Belum ceklok hari ini'
    if (t.jam_masuk && !t.jam_pulang) return `Masuk ${t.jam_masuk}`
    if (t.jam_masuk && t.jam_pulang) return `Pulang ${t.jam_pulang}`
    return 'Belum ceklok hari ini'
  })()

  return (
    <div className="lg:hidden min-h-[100dvh] -mx-4 -mt-3 bg-slate-50 pb-6 dark:bg-gray-950 sm:-mx-6">
      <div className="px-4 pt-4 pb-2">
        <MobileDashboardHeader roleOverride={peran} photo={data.gtk?.foto || null} />
      </div>

      <div data-mobile-compact-dashboard="true" className="space-y-4 px-4">
        {/* ── DUA GRID UTAMA: Ceklok Kehadiran & Jadwal Mengajar ── */}
        <div data-guru-main-grid="true" className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-guru-ceklok-card="true"
            onClick={() => navigate('/guru/absensi-guru')}
            className="flex min-w-0 flex-col rounded-2xl bg-emerald-50 p-3 text-left active:scale-[0.97] transition dark:bg-gray-900"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Fingerprint size={20} />
            </span>
            <span className="mt-2.5 break-words text-[13px] font-bold leading-tight text-slate-900 dark:text-white">Ceklok Kehadiran</span>
            <span className="mt-0.5 break-words text-[11px] leading-tight text-slate-500 dark:text-gray-400">{statusCeklok}</span>
          </button>

          <button
            type="button"
            data-guru-jadwal-card="true"
            onClick={() => navigate('/guru/jadwal')}
            className="flex min-w-0 flex-col rounded-2xl bg-blue-50 p-3 text-left active:scale-[0.97] transition dark:bg-gray-900"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <BookOpen size={20} />
            </span>
            <span className="mt-2.5 break-words text-[13px] font-bold leading-tight text-slate-900 dark:text-white">Jadwal Mengajar</span>
            <span className="mt-0.5 break-words text-[11px] leading-tight text-slate-500 dark:text-gray-400">
              Hari ini {sortedJadwal.length} jadwal{pendingJurnal > 0 ? ` · ${pendingJurnal} jurnal` : ''}
            </span>
          </button>
        </div>

        {/* ── JADWAL MENGAJAR HARI INI ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Calendar size={16} className="shrink-0 text-blue-600" />
              <span className="break-words">Jadwal Mengajar Hari Ini</span>
            </h2>
            <button
              type="button"
              onClick={() => navigate('/guru/jadwal')}
              className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-blue-600 active:opacity-70 transition"
            >
              Lihat Semua <ChevronRight size={13} />
            </button>
          </div>

          {sortedJadwal.length === 0 ? (
            <p className="py-5 text-center text-xs text-slate-400">Tidak ada jadwal hari ini</p>
          ) : (
            <div className="space-y-2">
              {sortedJadwal.map((j: any, i: number) => {
                const status = getJadwalStatus(j, cur)
                const isDone = status === 'done'
                const sedangAktif = data.sesi_kelas_aktif?.jadwal_id === j.id
                return (
                  <div
                    key={j.id || i}
                    data-guru-schedule-row="true"
                    className={`flex items-center gap-3 rounded-2xl border p-2.5 transition ${
                      status === 'active'
                        ? 'border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10'
                        : 'border-slate-100 bg-white dark:border-gray-800 dark:bg-gray-900'
                    }`}
                  >
                    <div
                      data-guru-schedule-time="true"
                      className="flex w-[52px] shrink-0 flex-col items-center rounded-xl bg-slate-100 py-1.5 dark:bg-gray-800"
                    >
                      <span className="text-[13px] font-bold leading-none text-slate-800 dark:text-gray-100">{j.jam_mulai}</span>
                      <span className="mt-0.5 text-[10px] leading-none text-slate-400">{j.jam_selesai}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`break-words text-[13px] font-semibold ${isDone ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {j.mapel_nama}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-gray-400">
                        <Users size={11} className="shrink-0" />
                        <span className="break-words">{j.rombel_nama}</span>
                      </p>
                    </div>

                    <div data-guru-schedule-action="true" className="shrink-0">
                      {sedangAktif ? (
                        <button
                          type="button"
                          onClick={() => finishClass()}
                          disabled={busy}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-600 px-2.5 py-1.5 text-[10px] font-bold text-white active:scale-95 transition disabled:opacity-60"
                        >
                          <DoorOpen size={12} /> SELESAI KELAS
                        </button>
                      ) : isDone ? (
                        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-400 dark:bg-gray-800">
                          SELESAI
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => enterClass(j)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white active:scale-95 transition disabled:opacity-60"
                        >
                          <LogIn size={12} /> MASUK KELAS
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
