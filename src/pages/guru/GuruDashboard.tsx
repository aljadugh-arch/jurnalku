import { useState, useEffect } from 'react'
import { Calendar, ClipboardCheck, ClipboardList, BookOpen, QrCode, MapPin, Users, PenLine, ChevronRight, Clock, DoorOpen, ScrollText, UserCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { Card, StatCard, Badge, Avatar } from '../../components/ui'

function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat Pagi'
  if (h < 15) return 'Selamat Siang'
  if (h < 19) return 'Selamat Sore'
  return 'Selamat Malam'
}

function nowMinutes() {
  // Jadwal disimpan dalam waktu lokal sekolah (WIB), jadi "sekarang" juga harus WIB.
  const wib = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  const [h, m] = wib.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function toMinutes(t: string) {
  if (!t) return -1
  const parts = String(t).split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1] || '0', 10)
  if (isNaN(h)) return -1
  return h * 60 + m
}

function teacherDisplayName(gtk: any) {
  const name = gtk?.nama || 'Guru'
  return `${String(gtk?.jenis_kelamin || '').toUpperCase() === 'P' ? 'Ibu' : 'Pak'} ${name}`
}

export default function GuruDashboard() {
  const [data, setData] = useState<any>({ jadwal_hari_ini: [], sesi_kelas_aktif: null, rekap_jurnal: { draft: 0, submitted: 0, approved: 0, total: 0 }, rombel_count: 0, gtk: null, tugas: [] })
  const [tugasForm, setTugasForm] = useState({ judul: '', deskripsi: '', deadline: '', rombel_id: '', mapel_id: '' })
  const [classBusy, setClassBusy] = useState(false)
  const navigate = useNavigate()

  const loadDashboard = () => api.get('/guru/dashboard').then(res => {
    setData(res.data)
    const j = res.data.jadwal_hari_ini?.[0]
    if (j) setTugasForm(f => ({ ...f, rombel_id: j.rombel_id || '', mapel_id: j.mapel_id || '' }))
  })

  useEffect(() => {
    loadDashboard().catch(() => {})
  }, [])

  const enterClass = async (jadwal: any) => {
    if (!jadwal?.id) return toast.error('Tidak ada jadwal mengajar hari ini')
    setClassBusy(true)
    try {
      await api.post('/guru/sesi-kelas/masuk', { jadwal_id: jadwal.id })
      toast.success(`Masuk kelas ${jadwal.rombel_nama}`)
      await loadDashboard()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mencatat masuk kelas')
    } finally { setClassBusy(false) }
  }

  const finishClass = async () => {
    setClassBusy(true)
    try {
      await api.post('/guru/sesi-kelas/selesai', { sesi_id: data.sesi_kelas_aktif?.id })
      setData((current: any) => ({ ...current, sesi_kelas_aktif: null }))
      toast.success('Sesi kelas diselesaikan')
      await loadDashboard()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyelesaikan kelas')
    } finally { setClassBusy(false) }
  }

  const rekap = data.rekap_jurnal || {}
  const draft = rekap.draft ?? 0
  const submitted = rekap.submitted ?? 0
  const approved = rekap.approved ?? 0
  // API lama hanya return 'total', API baru return draft/submitted/approved
  const totalJurnal = (draft + submitted + approved) || (rekap.total ?? 0)
  const persenApproved = totalJurnal > 0 ? Math.round((approved / totalJurnal) * 100) : 0

  const cur = nowMinutes()
  const isCurrent = (j: any) => {
    const s = toMinutes(j.jam_mulai)
    const e = toMinutes(j.jam_selesai)
    return s >= 0 && e >= 0 && cur >= s && cur <= e
  }
  // Jadwal yang jam selesainya sudah lewat: tidak bisa "Masuk" lagi, tampil "Selesai".
  const isFinished = (j: any) => {
    const e = toMinutes(j.jam_selesai)
    return j.sesi_status === 'selesai' || (e >= 0 && cur > e)
  }

  const tanggal = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-3">
      {/* Greeting header */}
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left gap-2.5 min-w-0">
        <Avatar src={data.gtk?.foto || null} name={data.gtk?.nama} size={64} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-gray-500 text-xs">{tanggal}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 font-display leading-tight">
            {greetingByHour()}, {teacherDisplayName(data.gtk)} 👋
          </h1>
        </div>
      </div>

      {data.sesi_kelas_aktif ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Sedang di kelas sejak {data.sesi_kelas_aktif.waktu_masuk}</p>
              <p className="font-bold text-gray-800 truncate">{data.sesi_kelas_aktif.rombel_nama} • {data.sesi_kelas_aktif.mapel_nama}</p>
            </div>
            <button disabled={classBusy} onClick={finishClass} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              <DoorOpen size={18} /> Selesai Kelas
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="font-bold text-emerald-800">Masuk Kelas</p>
          <p className="text-xs text-emerald-700">Pilih tombol Masuk pada jadwal kelas yang benar di bawah.</p>
        </div>
      )}

      {/* CTA banner */}
      <div className="relative overflow-hidden rounded-2xl bg-primary p-4 text-white shadow-sm shadow-primary/30">
        <div className="absolute -right-8 -top-10 w-40 h-40 bg-white/10 rounded-full"></div>
        <div className="absolute -right-4 -bottom-12 w-32 h-32 bg-white/5 rounded-full"></div>
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-white/80">Jurnal Mengajar</p>
            <h2 className="text-base sm:text-lg font-bold mt-0.5">Input Jurnal Mengajar</h2>
            <p className="text-xs text-white/80 mt-0.5">Catat kegiatan pembelajaran hari ini</p>
          </div>
          <button
            onClick={() => navigate('/guru/jurnal')}
            className="shrink-0 inline-flex items-center gap-2 bg-white text-primary px-3.5 py-2 rounded-xl text-sm font-semibold shadow-sm hover:bg-white/90 active:scale-95 transition"
          >
            <PenLine size={15} />
            Isi Jurnal
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 auto-rows-fr">
        <button onClick={() => navigate('/guru/jadwal')} className="h-full text-left active:scale-95 transition"><StatCard label="Jadwal Guru Hari Ini" value={data.jadwal_hari_ini.length} icon={<Calendar size={18} />} gradient="from-blue-500 to-indigo-600" sub="Jadwal mengajar hari ini" /></button>
        <button onClick={() => navigate('/guru/absensi-siswa')} className="h-full text-left active:scale-95 transition"><StatCard label="Absensi Siswa" value={data.absensi_hari_ini ?? 0} icon={<UserCheck size={18} />} gradient="from-green-500 to-emerald-600" sub="Siswa diabsen hari ini" /></button>
        <button onClick={() => navigate('/guru/catatan-kepribadian')} className="h-full text-left active:scale-95 transition"><StatCard label="Catatan Kepribadian" value={data.catatan_count ?? 0} icon={<ScrollText size={18} />} gradient="from-orange-500 to-amber-600" /></button>
        <button onClick={() => navigate('/guru/penilaian-harian')} className="h-full text-left active:scale-95 transition"><StatCard label="Nilai/Penilaian Siswa" value={data.nilai_siswa_count ?? 0} icon={<Users size={18} />} gradient="from-purple-500 to-fuchsia-600" sub="Sesuai jadwal mengajar" /></button>
      </div>

      {/* Rekap Jurnal + progress */}
      <Card title="Rekap Jurnal" icon={<ClipboardList size={18} className="text-primary" />}>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>{approved} disetujui dari {totalJurnal} jurnal</span>
          <span className="font-semibold text-primary">{persenApproved}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className="bg-primary h-full rounded-full transition-all" style={{ width: persenApproved + '%' }}></div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
          <div className="rounded-lg bg-gray-50 p-1.5">
            <p className="text-base font-bold text-gray-700">{draft}</p>
            <p className="text-[11px] text-gray-500">Draft</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-1.5">
            <p className="text-base font-bold text-amber-600">{submitted}</p>
            <p className="text-[11px] text-gray-500">Terkirim</p>
          </div>
          <div className="rounded-lg bg-green-50 p-1.5">
            <p className="text-base font-bold text-green-600">{approved}</p>
            <p className="text-[11px] text-gray-500">Disetujui</p>
          </div>
        </div>
      </Card>

      {/* Jadwal Hari Ini */}
      <Card title="Jadwal Mengajar Hari Ini" icon={<Calendar size={18} className="text-primary" />}>
        <div className="space-y-1.5">
          {data.jadwal_hari_ini.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">Tidak ada jadwal hari ini</p>
          )}
          {data.jadwal_hari_ini.map((j: any, i: number) => {
            const active = isCurrent(j)
            const rowCls = active
              ? 'flex items-center gap-2.5 p-2.5 rounded-xl border border-primary/30 bg-primary/5 ring-1 ring-primary/20'
              : 'flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition'
            const tileCls = active
              ? 'flex flex-col items-center justify-center min-w-[58px] rounded-lg bg-primary text-white px-2 py-1'
              : 'flex flex-col items-center justify-center min-w-[58px] rounded-lg bg-gray-100 text-gray-700 px-2 py-1'
            return (
              <button
                key={j.id || i}
                onClick={() => navigate(`/guru/jurnal?jadwal_id=${encodeURIComponent(j.id)}`)}
                className={rowCls + ' w-full text-left'}
              >
                <div className={tileCls}>
                  <span className="text-sm font-bold leading-none">{j.jam_mulai}</span>
                  <span className="text-[10px] opacity-80 mt-0.5">{j.jam_selesai}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800 truncate">{j.mapel_nama}</p>
                    {active && <Badge tone="blue">Sekarang</Badge>}
                    {!active && isFinished(j) && <Badge tone="gray">Berakhir</Badge>}
                  </div>
                  <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                    <Clock size={12} /> {j.rombel_nama} • {j.ruangan || '-'}
                  </p>
                </div>
                {data.sesi_kelas_aktif?.jadwal_id === j.id ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={event => { event.stopPropagation(); finishClass() }}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); finishClass() } }}
                    className="shrink-0 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white"
                  >Selesai Kelas</span>
                ) : isFinished(j) ? (
                  <span className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-bold text-gray-500">Selesai</span>
                ) : !data.sesi_kelas_aktif && !isFinished(j) ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={event => { event.stopPropagation(); enterClass(j) }}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); enterClass(j) } }}
                    className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white"
                  >Masuk</span>
                ) : null}
                <ChevronRight size={18} className="text-gray-400 shrink-0" />
              </button>
            )
          })}
        </div>
      </Card>


      <div id="tugas"></div><Card title="Penugasan Siswa" icon={<ClipboardCheck size={18} className="text-primary" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input value={tugasForm.judul} onChange={e => setTugasForm({...tugasForm, judul: e.target.value})} placeholder="Judul tugas" className="px-3 py-2 border rounded-lg text-sm" />
          <input type="datetime-local" value={tugasForm.deadline} onChange={e => setTugasForm({...tugasForm, deadline: e.target.value})} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={tugasForm.rombel_id} onChange={e => setTugasForm({...tugasForm, rombel_id: e.target.value})} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">Pilih rombel</option>
            {data.jadwal_hari_ini.map((j: any) => <option key={j.rombel_id + j.mapel_id} value={j.rombel_id}>{j.rombel_nama}</option>)}
          </select>
          <select value={tugasForm.mapel_id} onChange={e => setTugasForm({...tugasForm, mapel_id: e.target.value})} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">Pilih mapel</option>
            {data.jadwal_hari_ini.map((j: any) => <option key={j.mapel_id + j.rombel_id} value={j.mapel_id}>{j.mapel_nama}</option>)}
          </select>
          <textarea value={tugasForm.deskripsi} onChange={e => setTugasForm({...tugasForm, deskripsi: e.target.value})} placeholder="Instruksi tugas" className="md:col-span-2 px-3 py-2 border rounded-lg text-sm" rows={3} />
        </div>
        <button onClick={async () => { try { await api.post('/guru/tugas', tugasForm); const r = await api.get('/guru/dashboard'); setData(r.data); setTugasForm({...tugasForm, judul: '', deskripsi: ''}); toast.success('Tugas dikirim') } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal kirim tugas') } }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Kirim Tugas</button>
        <div className="mt-3 space-y-1.5">
          {(data.tugas || []).slice(0,5).map((t: any) => <div key={t.id} className="rounded-xl border border-gray-100 p-2.5"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-gray-800 text-sm">{t.judul}</p><p className="text-xs text-gray-500">{t.mapel_nama || '-'} · {t.rombel_nama || '-'} · {t.deadline || '-'}</p></div><button onClick={async () => { await api.delete('/guru/tugas/' + t.id); const r=await api.get('/guru/dashboard'); setData(r.data) }} className="text-xs text-red-600 hover:underline">Hapus</button></div></div>)}
          {(data.tugas || []).length === 0 && <p className="text-gray-400 text-sm text-center py-3">Belum ada tugas</p>}
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button onClick={() => navigate('/guru/absensi-guru')} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white mb-2">
            <MapPin size={16} />
          </div>
          <h4 className="font-medium text-gray-800 text-sm">Ceklok Kehadiran</h4>
          <p className="text-xs text-gray-500 mt-0.5">Absen masuk/pulang via GPS</p>
        </button>
        <button onClick={() => navigate('/guru/absensi-siswa')} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-white mb-2">
            <QrCode size={16} />
          </div>
          <h4 className="font-medium text-gray-800 text-sm">Absensi Siswa</h4>
          <p className="text-xs text-gray-500 mt-0.5">Input absensi kelas</p>
        </button>
        <button onClick={() => navigate('/guru/modul-ajar')} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mb-2">
            <BookOpen size={16} />
          </div>
          <h4 className="font-medium text-gray-800 text-sm">Modul Ajar AI</h4>
          <p className="text-xs text-gray-500 mt-0.5">Generate modul otomatis</p>
        </button>
      </div>
    </div>
  )
}
