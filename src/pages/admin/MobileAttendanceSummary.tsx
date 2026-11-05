import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, BookOpen, CheckCircle2, Clock3, GraduationCap, QrCode, Thermometer } from 'lucide-react'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

interface Summary {
  tanggal: string
  tertutup?: boolean
  totals: { hadir: number; sakit: number; izin: number; alpha: number; belum_tercatat?: number }
  rombel: Array<{ id: string; nama: string; total_siswa: number; hadir: number; persentase: number }>
}

interface MapelSummary {
  tanggal: string
  totals: { catatan: number; hadir: number; sakit: number; izin: number; alpha: number; persentase: number }
  belum_diabsen?: number
  per_mapel: Array<{
    mapel_id: string; rombel_id: string; mapel_nama: string; rombel_nama: string
    catatan: number; hadir: number; sakit: number; izin: number; alpha: number
    persentase: number; sesi: number; siswa: number; diharapkan: number | null
    tercatat?: boolean; mulai?: string; selesai?: string
  }>
}

const initial: Summary = { tanggal: todayWib(), totals: { hadir: 0, sakit: 0, izin: 0, alpha: 0, belum_tercatat: 0 }, rombel: [] }
const initialMapel: MapelSummary = { tanggal: todayWib(), totals: { catatan: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0, persentase: 0 }, per_mapel: [], belum_diabsen: 0 }

export default function MobileAttendanceSummary({ tanggal = todayWib() }: { tanggal?: string }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'harian' | 'mapel'>('harian')
  const [summary, setSummary] = useState<Summary>(initial)
  const [mapel, setMapel] = useState<MapelSummary>(initialMapel)
  const [loading, setLoading] = useState(true)
  const [loadingMapel, setLoadingMapel] = useState(false)
  // Tanggal yang rekapnya sudah benar-benar dimuat. Sebelumnya penjaga memakai
  // mapel.tanggal yang sudah terisi tanggal hari ini sejak awal, sehingga
  // tab Per Mapel tidak pernah memanggil API dan selalu tampak kosong.
  const [mapelDimuat, setMapelDimuat] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.get('/absensi-siswa/ringkasan', { params: { tanggal } })
      .then(res => setSummary(res.data))
      .catch(() => setSummary({ ...initial, tanggal }))
      .finally(() => setLoading(false))
  }, [tanggal])

  useEffect(() => {
    if (tab !== 'mapel' || mapelDimuat === tanggal) return
    setLoadingMapel(true)
    api.get('/absensi-mapel/ringkasan', { params: { tanggal } })
      .then(res => { setMapel(res.data); setMapelDimuat(tanggal) })
      .catch(() => { setMapel({ ...initialMapel, tanggal }); setMapelDimuat(tanggal) })
      .finally(() => setLoadingMapel(false))
  }, [tab, tanggal, mapelDimuat])

  const belum = Number(summary.totals.belum_tercatat || 0)
  const cards = [
    { label: 'Hadir', value: summary.totals.hadir, icon: <CheckCircle2 size={19} />, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Sakit', value: summary.totals.sakit, icon: <Thermometer size={19} />, tone: 'bg-amber-100 text-amber-700' },
    { label: 'Izin', value: summary.totals.izin, icon: <Clock3 size={19} />, tone: 'bg-sky-100 text-sky-700' },
    { label: 'Alpha', value: summary.totals.alpha, icon: <AlertCircle size={19} />, tone: 'bg-rose-100 text-rose-700' },
  ]
  const tanggalTampil = new Date(`${tanggal}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return <div className="lg:hidden space-y-4" data-attendance-summary="true">
    <div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Presensi Siswa</h2>
      <p className="text-xs text-slate-500">Akumulasi kehadiran {tanggalTampil}</p>
    </div>

    {/* Dua sumber berbeda penyebut: harian (per siswa) dan per mapel (per catatan
        jam pelajaran). Digabung jadi satu persentase akan menyesatkan. */}
    <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-gray-800" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'harian'} onClick={() => setTab('harian')}
        className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${tab === 'harian' ? 'bg-white text-primary shadow-sm dark:bg-gray-900' : 'text-slate-500'}`}>
        Harian (Gerbang)
      </button>
      <button type="button" role="tab" aria-selected={tab === 'mapel'} onClick={() => setTab('mapel')}
        className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ${tab === 'mapel' ? 'bg-white text-primary shadow-sm dark:bg-gray-900' : 'text-slate-500'}`}>
        Per Mapel
      </button>
    </div>

    {tab === 'harian' ? <>
      <div className="grid grid-cols-4 gap-2">{cards.map(card => <div key={card.label} className="rounded-2xl bg-white p-2.5 text-center shadow-sm dark:bg-gray-900"><span className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl ${card.tone}`}>{card.icon}</span><p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{loading ? '–' : card.value}</p><p className="text-[10px] text-slate-500">{card.label}</p></div>)}</div>

      {!loading && belum > 0 && <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
        <Clock3 size={14} className="mt-0.5 shrink-0" />
        <span><strong>{belum} siswa belum tercatat.</strong> Angka ini belum dihitung alpha — alpha baru ditambahkan setelah hari berakhir, supaya pemindaian yang belum lengkap tidak terlihat seperti membolos massal.</span>
      </div>}

      <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
        <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Persentase Tiap Kelas/Rombel</h3>
        {loading ? <p className="py-8 text-center text-xs text-slate-400">Memuat rekap...</p> : summary.rombel.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">Belum ada data rombel.</p> : <div className="space-y-3">{summary.rombel.map(row => <button type="button" key={row.id} onClick={() => navigate(`/admin/absensi-siswa/kelas/${row.id}`)} className="block w-full rounded-2xl bg-slate-50 p-3 text-left active:scale-[0.99] dark:bg-gray-800"><div className="mb-2 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><GraduationCap size={17} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900 dark:text-white">{row.nama}</p><p className="text-[10px] text-slate-500">{row.hadir} hadir dari {row.total_siswa} siswa · buka absensi kelas</p></div><strong className="text-sm text-primary">{row.persentase}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, row.persentase)}%` }} /></div></button>)}</div>}
      </section>
    </> : <>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white p-2.5 text-center shadow-sm dark:bg-gray-900"><p className="text-xl font-bold text-slate-900 dark:text-white">{loadingMapel ? '–' : mapel.totals.catatan}</p><p className="text-[10px] text-slate-500">Catatan</p></div>
        <div className="rounded-2xl bg-white p-2.5 text-center shadow-sm dark:bg-gray-900"><p className="text-xl font-bold text-emerald-600">{loadingMapel ? '–' : mapel.totals.hadir}</p><p className="text-[10px] text-slate-500">Hadir</p></div>
        <div className="rounded-2xl bg-white p-2.5 text-center shadow-sm dark:bg-gray-900"><p className="text-xl font-bold text-primary">{loadingMapel ? '–' : mapel.totals.persentase + '%'}</p><p className="text-[10px] text-slate-500">Kehadiran</p></div>
      </div>

      <p className="px-1 text-[10px] leading-4 text-slate-400">Per mapel dihitung dari catatan jam pelajaran (siswa × jam), bukan dari presensi gerbang. Keduanya sengaja dipisah.</p>

      {!loadingMapel && Number(mapel.belum_diabsen || 0) > 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <Clock3 size={14} className="mt-0.5 shrink-0" />
          <span><strong>{mapel.belum_diabsen} kelas belum diabsen.</strong> Baris bertanda "Belum diabsen" adalah jadwal hari ini yang absensinya belum diisi guru.</span>
        </div>
      )}

      <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
        <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Rekap per Mapel &amp; Rombel</h3>
        {loadingMapel ? <p className="py-8 text-center text-xs text-slate-400">Memuat rekap mapel...</p> : mapel.per_mapel.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">Belum ada absensi mapel pada tanggal ini.</p> : <div className="space-y-3">{mapel.per_mapel.map(row => <div key={`${row.mapel_id}-${row.rombel_id}`} className={`rounded-2xl p-3 dark:bg-gray-800 ${row.tercatat === false ? 'border border-dashed border-amber-300 bg-amber-50/40' : 'bg-slate-50'}`}>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{row.mapel_nama || 'Mapel'} · {row.rombel_nama || '-'}</p>
              <p className="text-[10px] text-slate-500">
                {row.tercatat === false
                  ? `Belum diabsen · ${row.sesi} jam pelajaran${row.mulai ? ` (${String(row.mulai).slice(0,5)}–${String(row.selesai || '').slice(0,5)})` : ''}`
                  : <>{row.hadir} hadir dari {row.catatan} catatan{row.sesi ? ` · ${row.sesi} sesi${row.diharapkan ? ` · ideal ${row.diharapkan}` : ''}` : ''}</>}
              </p>
            </div>
            {row.tercatat === false
              ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Belum</span>
              : <strong className="text-sm text-primary">{row.persentase}%</strong>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, row.persentase)}%` }} /></div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">H {row.hadir}</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">S {row.sakit}</span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">I {row.izin}</span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">A {row.alpha}</span>
          </div>
        </div>)}</div>}
      </section>
    </>}

    <Link to="/admin/absensi-qr-siswa" className="flex items-center gap-3 rounded-3xl bg-primary p-4 text-white shadow-sm active:scale-[0.99]">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20"><QrCode size={22} /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm">Scan QR Siswa</strong><span className="block text-[11px] text-white/80">Buka scan kamera, scan foto, lihat, dan unduh QR siswa</span></span>
      <span aria-hidden="true">›</span>
    </Link>
  </div>
}
