import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, BookOpen, Activity, ChevronRight, Clock, ClipboardCheck, Wallet, Receipt, NotebookPen, Users } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { Card, StatCard, Badge, Avatar } from '../../components/ui'

function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat Pagi'
  if (h < 15) return 'Selamat Siang'
  if (h < 19) return 'Selamat Sore'
  return 'Selamat Malam'
}

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

const fmt = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

function toMinutes(t: string) {
  if (!t) return -1
  const parts = String(t).split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1] || '0', 10)
  if (isNaN(h)) return -1
  return h * 60 + m
}

export default function SiswaDashboard() {
  const [data, setData] = useState<any>({ siswa: null, jadwal_hari_ini: [], rekap: { hadir: 0, sakit: 0, izin: 0, alpha: 0 } })
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    api.get('/siswa/dashboard').then(res => setData(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!location.hash) return
    setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }, [location.hash])

  const goSection = (id: string) => {
    history.replaceState(null, '', '#'+id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const totalAbsensi = data.rekap.hadir + data.rekap.sakit + data.rekap.izin + data.rekap.alpha
  const persenHadir = totalAbsensi > 0 ? Math.round((data.rekap.hadir / totalAbsensi) * 100) : 0

  const cur = nowMinutes()
  const isCurrent = (j: any) => {
    const s = toMinutes(j.jam_mulai)
    const e = toMinutes(j.jam_selesai)
    return s >= 0 && e >= 0 && cur >= s && cur <= e
  }

  const tanggal = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-4">
      {/* Greeting header */}
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left gap-3 min-w-0">
        <Avatar src={data.siswa?.foto || null} name={data.siswa?.nama} size={76} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-gray-500 text-sm">{tanggal}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 font-display">
            {greetingByHour()}, {data.siswa?.nama || 'Siswa'} 👋
          </h1>
        </div>
      </div>

      {/* CTA banner */}
      <div className="relative overflow-hidden rounded-2xl bg-primary p-5 text-white shadow-sm shadow-primary/30">
        <div className="absolute -right-8 -top-10 w-40 h-40 bg-white/10 rounded-full"></div>
        <div className="absolute -right-4 -bottom-12 w-32 h-32 bg-white/5 rounded-full"></div>
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-white/80">Kehadiran</p>
            <h2 className="text-lg sm:text-xl font-bold mt-0.5">Riwayat Absensi</h2>
            <p className="text-sm text-white/80 mt-1">Pantau catatan kehadiranmu</p>
          </div>
          <button
            onClick={() => navigate('/siswa/absensi')}
            className="shrink-0 inline-flex items-center gap-2 bg-white text-primary px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-white/90 active:scale-95 transition"
          >
            <ClipboardCheck size={16} />
            Lihat
          </button>
        </div>
      </div>

      {/* Rekap Absensi Bulan Ini */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Hadir" value={data.rekap.hadir} icon={<CheckCircle size={18} />} gradient="from-green-500 to-emerald-600" onClick={() => navigate('/siswa/absensi')} />
        <StatCard label="Sakit" value={data.rekap.sakit} icon={<Activity size={18} />} gradient="from-yellow-500 to-amber-600" onClick={() => navigate('/siswa/absensi')} />
        <StatCard label="Izin" value={data.rekap.izin} icon={<Calendar size={18} />} gradient="from-blue-500 to-indigo-600" onClick={() => navigate('/siswa/absensi')} />
        <StatCard label="Alpha" value={data.rekap.alpha} icon={<Activity size={18} />} gradient="from-red-500 to-rose-600" onClick={() => navigate('/siswa/absensi')} />
      </div>


      <div className="lg:hidden grid grid-cols-3 gap-3">
        {[
          ['Kehadiran', '#kehadiran', <Activity size={18} />],
          ['Tabungan', '#tabungan', <Wallet size={18} />],
          ['Tagihan', '#tagihan', <Receipt size={18} />],
          ['Nilai', '#nilai', <BookOpen size={18} />],
          ['Jadwal', '#jadwal', <Calendar size={18} />],
          ['Tugas', '#tugas', <ClipboardCheck size={18} />],
          ['Catatan', '#catatan', <NotebookPen size={18} />],
        ].map(([label, hash, icon]: any) => (
          <button key={label} type="button" onClick={() => goSection(String(hash).slice(1))} className="rounded-2xl bg-white border border-gray-100 p-3 text-center shadow-sm active:scale-95 transition">
            <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">{icon}</span>
            <span className="text-xs font-semibold text-gray-700">{label}</span>
          </button>
        ))}
      </div>


      {/* Persentase Kehadiran */}
      <Card title="Kehadiran Bulan Ini" icon={<CheckCircle size={18} className="text-primary" />}>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>{data.rekap.hadir} hadir dari {totalAbsensi} hari</span>
          <span className="text-lg font-bold text-primary">{persenHadir}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div className="bg-primary h-full rounded-full transition-all" style={{ width: persenHadir + '%' }}></div>
        </div>
      </Card>


      <div id="kehadiran"></div><Card title="Rekap Kehadiran Lengkap" icon={<Activity size={18} className="text-primary" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            ['KBM', data.absensi_detail || []],
            ['Jamaah', data.jamaah_detail || []],
            ['Ekstrakurikuler', data.ekskul_detail || []],
            ['Kokurikuler', data.kokurikuler_detail || []],
            ['Kegiatan', data.kegiatan_detail || []],
            ['Kegiatan Lain', data.kegiatan_lain_detail || []],
          ].filter(([,rows]: any) => rows.length > 0 || ['KBM','Jamaah'].includes(String(''))).map(([label, rows]: any) => (
            <div key={label} className="rounded-xl border border-gray-100 p-3">
              <div className="flex justify-between mb-2"><b>{label}</b><span className="text-gray-400">{rows.length} data</span></div>
              {rows.slice(0,4).map((r: any, i: number) => <div key={i} className="flex justify-between py-1 border-t border-gray-50"><span>{r.tanggal}</span><span className="capitalize">{r.status || '-'}</span></div>)}
              {rows.length === 0 && <p className="text-gray-400">Belum ada data</p>}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section id="tagihan" className="scroll-mt-24 min-w-0"><Card title="Tagihan" icon={<Receipt size={18} className="text-primary" />}>
          <div className="text-xs text-gray-500 mb-3">Belum bayar {fmt(data.tagihan?.belum_bayar)} · Lunas {fmt(data.tagihan?.lunas)}</div>
          <div className="space-y-2">
            {(data.tagihan_detail || []).length === 0 && <p className="text-gray-400 text-sm text-center py-4">Belum ada tagihan</p>}
            {(data.tagihan_detail || []).slice(0, 5).map((t: any) => (
              <div key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-gray-100 p-3">
                <div className="min-w-0"><p className="font-medium text-sm text-gray-800 truncate">{t.jenis_nama || 'Tagihan'}</p><p className="text-xs text-gray-400 truncate">{t.bulan || '-'} {t.tahun || ''}</p></div>
                <div className="text-right shrink-0"><p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{fmt(t.nominal)}</p><Badge tone={t.status === 'lunas' ? 'green' : 'red'}>{t.status === 'lunas' ? 'Lunas' : 'Belum'}</Badge></div>
              </div>
            ))}
          </div>
        </Card></section>
        <section id="tabungan" className="scroll-mt-24 min-w-0"><Card title="Tabungan" icon={<Wallet size={18} className="text-primary" />}>
          <div className="text-lg font-bold text-primary mb-3">Saldo {fmt(data.tabungan?.saldo)}</div>
          <div className="space-y-2">
            {(data.tabungan_detail || []).length === 0 && <p className="text-gray-400 text-sm text-center py-4">Belum ada mutasi tabungan</p>}
            {(data.tabungan_detail || []).slice(0, 5).map((t: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-gray-100 p-3">
                <div className="min-w-0"><p className={"text-sm font-medium whitespace-nowrap " + (t.tipe === 'setor' ? 'text-green-700' : 'text-red-700')}>{t.tipe === 'setor' ? '+' : '-'} {fmt(t.nominal)}</p><p className="text-xs text-gray-400 truncate">{t.tanggal} {t.keterangan ? '· ' + t.keterangan : ''}</p></div>
                <p className="text-xs text-gray-500 whitespace-nowrap">{fmt(t.saldo_akhir)}</p>
              </div>
            ))}
          </div>
        </Card></section>
      </div>

      <div id="nilai" className="scroll-mt-24"></div><Card title="Nilai Terbaru" icon={<BookOpen size={18} className="text-primary" />}>
        <div className="space-y-2">
          {(data.nilai_detail || []).length === 0 && <p className="text-gray-400 text-sm text-center py-4">Belum ada nilai</p>}
          {(data.nilai_detail || []).slice(0, 6).map((n: any, i: number) => (
            <div key={i} className="grid grid-cols-4 gap-2 rounded-xl border border-gray-100 p-3 text-sm">
              <div className="col-span-1 font-medium text-gray-800 truncate">{n.mapel_nama || '-'}</div>
              <div className="text-center">P: <b>{n.pengetahuan ?? '-'}</b></div>
              <div className="text-center">K: <b>{n.keaktifan ?? '-'}</b></div>
              <div className="text-center">S: <b>{n.sikap ?? '-'}</b></div>
            </div>
          ))}
        </div>
      </Card>

      <div id="tugas"></div><Card title="Tugas dari Guru" icon={<ClipboardCheck size={18} className="text-primary" />}>
        <div className="space-y-2">
          {(data.tugas || []).length === 0 && <p className="text-gray-400 text-sm text-center py-6">Belum ada tugas</p>}
          {(data.tugas || []).slice(0, 6).map((t: any) => (
            <div key={t.id} className="rounded-xl border border-gray-100 p-3">
              <p className="font-semibold text-gray-800">{t.judul}</p>
              <p className="text-xs text-gray-500">{t.mapel_nama || '-'} · {t.guru_nama || '-'} · Deadline {t.deadline || '-'}</p>
              {t.deskripsi && <p className="text-sm text-gray-600 mt-2">{t.deskripsi}</p>}
            </div>
          ))}
        </div>
      </Card>

      {/* Catatan Kepribadian */}
      <div id="catatan"><Card title="Catatan Kepribadian" icon={<NotebookPen size={18} className="text-primary" />}>
          <div className="space-y-3">
            {(data.catatan_kepribadian || []).length === 0 && <p className="text-gray-400 text-sm text-center py-4">Belum ada catatan kepribadian dari guru</p>}
            {(data.catatan_kepribadian || []).map((c: any, i: number) => (
              <div key={i} className="rounded-xl border border-gray-100 p-3 space-y-1">
                <p className="text-xs font-semibold text-gray-500">{c.tahun_ajaran} — Semester {c.semester}</p>
                {c.catatan_umum && <p className="text-sm text-gray-700"><b>Umum:</b> {c.catatan_umum}</p>}
                {c.catatan_akademik && <p className="text-sm text-gray-700"><b>Akademik:</b> {c.catatan_akademik}</p>}
                {c.catatan_sosial && <p className="text-sm text-gray-700"><b>Sosial:</b> {c.catatan_sosial}</p>}
                {c.catatan_spiritual && <p className="text-sm text-gray-700"><b>Spiritual:</b> {c.catatan_spiritual}</p>}
                {c.saran && <p className="text-sm text-primary"><b>Saran:</b> {c.saran}</p>}
              </div>
            ))}
          </div>
        </Card></div>

      {/* Jadwal Hari Ini */}
      <div id="jadwal"></div><Card title="Jadwal Hari Ini" icon={<Calendar size={18} className="text-primary" />}>
        <div className="space-y-2">
          {data.jadwal_hari_ini.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">Tidak ada jadwal hari ini</p>
          )}
          {data.jadwal_hari_ini.map((j: any, i: number) => {
            const active = isCurrent(j)
            const rowCls = active
              ? 'flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 ring-1 ring-primary/20'
              : 'flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white'
            const tileCls = active
              ? 'flex flex-col items-center justify-center min-w-[64px] rounded-lg bg-primary text-white px-2 py-1.5'
              : 'flex flex-col items-center justify-center min-w-[64px] rounded-lg bg-gray-100 text-gray-700 px-2 py-1.5'
            return (
              <div key={j.id || i} className={rowCls}>
                <div className={tileCls}>
                  <span className="text-sm font-bold leading-none">{j.jam_mulai}</span>
                  <span className="text-[10px] opacity-80 mt-0.5">{j.jam_selesai}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800 truncate">{j.mapel_nama}</p>
                    {active && <Badge tone="blue">Sekarang</Badge>}
                  </div>
                  <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                    <Clock size={12} /> {j.guru_nama}
                  </p>
                </div>
                {active && <ChevronRight size={18} className="text-primary shrink-0" />}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
