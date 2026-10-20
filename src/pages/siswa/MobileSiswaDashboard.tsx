import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  ClipboardCheck,
  Award,
  FileText,
  Wallet,
  BookOpen,
  LayoutGrid,
  ChevronRight,
  CheckCircle2,
  QrCode,
  Clock,
  PiggyBank,
  MessagesSquare,
  GraduationCap,
} from 'lucide-react'
import api from '../../services/api'
import MobileDashboardHeader from '../../components/MobileDashboardHeader'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { heroColors } from '../../lib/applyTheme'

// ─── helpers ───────────────────────────────────────────────────────────────────

function greetingByHour() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 19) return 'Selamat sore'
  return 'Selamat malam'
}

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function toMinutes(t: string) {
  if (!t) return -1
  const parts = String(t).split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1] || '0', 10)
  if (isNaN(h)) return -1
  return h * 60 + m
}

const rupiah = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

function rupiahSingkat(n: number) {
  const v = Number(n || 0)
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1).replace('.', ',')} jt`
  if (v >= 1_000) return `Rp ${Math.round(v / 1_000)} rb`
  return rupiah(v)
}

// Nama panggilan: ambil kata pertama, buang gelar/tanda baca.
function namaPanggilan(nama?: string) {
  const bersih = String(nama || '').replace(/[,.]/g, ' ').trim()
  if (!bersih) return 'Siswa'
  const kata = bersih.split(/\s+/)[0]
  return kata.charAt(0).toUpperCase() + kata.slice(1).toLowerCase()
}

// ─── 8 tile menu: warna pastel + ikon berwarna (bentuk ikon tetap) ─────────────

const MENU_ITEMS = [
  { label: 'Nilai', icon: Award, path: '/siswa/nilai', bg: 'bg-rose-50', fg: 'text-rose-500' },
  { label: 'Keuangan', icon: Wallet, path: '/siswa/tagihan', bg: 'bg-emerald-50', fg: 'text-emerald-500' },
  { label: 'Tabungan', icon: PiggyBank, path: '/siswa/tabungan', bg: 'bg-orange-50', fg: 'text-orange-500' },
  { label: 'Perpus', icon: BookOpen, path: '/siswa/perpustakaan', bg: 'bg-sky-50', fg: 'text-sky-500' },
  { label: 'Kalender', icon: Calendar, path: '/siswa/jadwal', bg: 'bg-violet-50', fg: 'text-violet-500' },
  { label: 'Ujian', icon: FileText, path: '/siswa/ujian', bg: 'bg-amber-50', fg: 'text-amber-500' },
  { label: 'Konseling', icon: MessagesSquare, path: '/siswa/menu', bg: 'bg-teal-50', fg: 'text-teal-500' },
  { label: 'Lainnya', icon: LayoutGrid, path: '/siswa/menu', bg: 'bg-slate-100', fg: 'text-slate-500' },
]

export default function MobileSiswaDashboard() {
  const [data, setData] = useState<any>({
    siswa: null,
    jadwal_hari_ini: [],
    rekap: { hadir: 0, sakit: 0, izin: 0, alpha: 0 },
  })
  const navigate = useNavigate()
  const settings = useSettingsStore(s => s.settings)
  const { dark } = useThemeStore()

  useEffect(() => {
    api.get('/siswa/dashboard').then((res) => setData(res.data)).catch(() => {})
  }, [])

  const cur = nowMinutes()
  const isCurrent = (j: any) => {
    const s = toMinutes(j.jam_mulai)
    const e = toMinutes(j.jam_selesai)
    return s >= 0 && e >= 0 && cur >= s && cur <= e
  }

  const { siswa, jadwal_hari_ini, rekap } = data
  const totalHari = (rekap.hadir || 0) + (rekap.sakit || 0) + (rekap.izin || 0) + (rekap.alpha || 0)
  const attendancePct = totalHari > 0 ? Math.round(((rekap.hadir || 0) / totalHari) * 100) : 100
  const hero = heroColors(settings, dark)

  // Pelajaran berikutnya = jadwal terdekat yang belum selesai. Kalau sedang
  // berlangsung, tampilkan yang sedang berjalan supaya kartu tidak kosong.
  const jadwalList = Array.isArray(jadwal_hari_ini) ? jadwal_hari_ini : []
  const sedang = jadwalList.find(isCurrent)
  const berikutnya = sedang
    || jadwalList.filter((j: any) => toMinutes(j.jam_mulai) >= cur).sort((a: any, b: any) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai))[0]
    || jadwalList[jadwalList.length - 1]
  const tugas = (data?.tugas_detail || data?.tugas || []).slice(0, 3)

  return (
    <div className="min-h-screen -mx-4 -mt-3 bg-[#F7F8FC] pb-10 text-slate-800 dark:bg-gray-950 dark:text-gray-100 sm:-mx-6">
      {/* Header lembaga bersama (kontrak dashboard mobile): logo + nama
          lembaga + lonceng, lalu identitas pengguna dengan menu akun. */}
      <div className="px-4 pt-4"><MobileDashboardHeader photo={siswa?.foto || null} /></div>

      <div data-mobile-compact-dashboard="true" className="space-y-3 px-4 pt-3">

        {/* ─── 1. SAPAAN + PELAJARAN BERIKUTNYA ────────────────────── */}
        <div
          className="relative overflow-hidden rounded-[22px] p-4 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${hero}, #4c1d95)` }}
        >
          <div className="absolute right-0 top-0 translate-x-6 -translate-y-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white/90">
                Halo, {namaPanggilan(siswa?.nama)}!
                <span className="font-normal text-white/65">
                  {[siswa?.rombel_nama, siswa?.nama_lembaga].filter(Boolean).length
                    ? ` • ${[siswa?.rombel_nama, siswa?.nama_lembaga].filter(Boolean).join(' • ')}`
                    : ''}
                </span>
              </p>
              <p className="text-[10px] uppercase tracking-wide text-white/60 font-medium mt-1">
                {sedang ? 'Sedang berlangsung' : 'Pelajaran berikutnya'}
              </p>
              <h2 className="text-[17px] font-bold leading-tight mt-0.5 truncate">
                {berikutnya?.mapel_nama || berikutnya?.mapel || 'Belum ada jadwal'}
              </h2>
              {berikutnya && (
                <p className="text-[11px] text-white/80 mt-1 inline-flex items-center gap-1">
                  <Clock size={11} />
                  {berikutnya.jam_mulai} – {berikutnya.jam_selesai}
                  {berikutnya.rombel_nama ? ` • ${berikutnya.rombel_nama}` : ''}
                </p>
              )}
            </div>
            <button
              onClick={() => navigate('/siswa/absensi')}
              className="shrink-0 bg-white rounded-2xl px-3 py-2.5 flex flex-col items-center gap-1 active:scale-95 transition shadow-sm"
            >
              <QrCode size={22} className="text-indigo-700" />
              <span className="text-[10px] font-bold text-slate-800 leading-none">Scan</span>
              <span className="text-[9px] text-slate-500 leading-none">Kehadiran</span>
            </button>
          </div>
        </div>

        {/* ─── 3. KARTU KEHADIRAN ──────────────────────────────────── */}
        <div className="rounded-[20px] bg-[#EEF2FF] dark:bg-indigo-950/40 p-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-slate-900 dark:text-white">Kehadiran</p>
            <p className="text-[11px] text-slate-500 dark:text-indigo-300 mt-0.5">
              Kehadiran Anda: <b className="text-slate-800 dark:text-white">{attendancePct}%</b>
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/70 dark:bg-indigo-900/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, attendancePct))}%` }}
              />
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} />
          </div>
        </div>

        {/* ─── 4. GRID 8 MENU (2 baris × 4 kolom) ──────────────────── */}
        <div className="grid grid-cols-4 gap-y-4 gap-x-2">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition"
              >
                <div className={`w-[52px] h-[52px] rounded-[16px] ${item.bg} dark:bg-gray-800 flex items-center justify-center shadow-sm`}>
                  <Icon size={22} className={item.fg} strokeWidth={1.9} />
                </div>
                <span className="text-[10.5px] font-medium text-slate-600 dark:text-gray-300 truncate w-full text-center">
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* ─── 5. TUGAS MENDATANG ──────────────────────────────────── */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] font-bold text-slate-900 dark:text-white">Tugas Mendatang</h2>
            <button
              onClick={() => navigate('/siswa/tugas')}
              className="text-[11px] font-semibold text-indigo-600 flex items-center gap-0.5 active:opacity-70 transition"
            >
              Lihat Semua
              <ChevronRight size={13} />
            </button>
          </div>

          {tugas.length === 0 ? (
            <div className="rounded-[18px] bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 px-3.5 py-4 text-center">
              <p className="text-[11px] text-slate-400">Belum ada tugas mendatang.</p>
            </div>
          ) : (
            <div className="rounded-[18px] bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 divide-y divide-slate-100 dark:divide-gray-800 overflow-hidden">
              {tugas.map((t: any, i: number) => (
                <button
                  key={t.id || i}
                  onClick={() => navigate('/siswa/tugas')}
                  className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 dark:active:bg-gray-800 transition"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate">
                      {[t.mapel_nama, t.judul].filter(Boolean).join(' - ') || 'Tugas'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">{t.deskripsi || t.keterangan || 'Tugas sekolah'}</p>
                  </div>
                  <span className="shrink-0 px-2 py-1 rounded-lg bg-orange-50 text-orange-600 text-[9.5px] font-semibold">
                    {t.deadline || t.tenggat || 'Mendatang'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── 6. NILAI TERBARU ─────────────────────────────────────── */}
        {(data?.nilai_detail || []).length > 0 && (
          <div className="rounded-[18px] bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-bold text-slate-900 dark:text-white">Nilai Terbaru</h2>
              <button
                onClick={() => navigate('/siswa/nilai')}
                className="text-[11px] font-semibold text-indigo-600 flex items-center gap-0.5 active:opacity-70 transition"
              >
                Lihat Semua
                <ChevronRight size={13} />
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-gray-800">
              {(data.nilai_detail || []).slice(0, 4).map((n: any, idx: number) => (
                <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate">{n.mapel_nama || 'Mata Pelajaran'}</p>
                    <p className="text-[10px] text-slate-400">{n.tanggal || '-'}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 text-[9.5px]">
                    <span className="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 font-semibold">P {n.pengetahuan ?? '-'}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">K {n.keaktifan ?? '-'}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold">S {n.nilai_sikap ?? n.sikap ?? '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── 7. RINGKASAN SINGKAT (nilai/tagihan/tabungan) ────────── */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={() => navigate('/siswa/nilai')}
            className="rounded-[16px] bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 p-3 text-left active:scale-95 transition"
          >
            <GraduationCap size={16} className="text-violet-500 mb-1.5" />
            <p className="text-[9.5px] text-slate-400 font-medium">Nilai</p>
            <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate">
              {(data?.nilai_detail || []).length || '—'}
            </p>
          </button>
          <button
            onClick={() => navigate('/siswa/tagihan')}
            className="rounded-[16px] bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 p-3 text-left active:scale-95 transition"
          >
            <Wallet size={16} className="text-rose-500 mb-1.5" />
            <p className="text-[9.5px] text-slate-400 font-medium">Belum bayar</p>
            <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate">
              {rupiahSingkat(data?.tagihan?.belum_bayar)}
            </p>
          </button>
          <button
            onClick={() => navigate('/siswa/tabungan')}
            className="rounded-[16px] bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 p-3 text-left active:scale-95 transition"
          >
            <PiggyBank size={16} className="text-orange-500 mb-1.5" />
            <p className="text-[9.5px] text-slate-400 font-medium">Tabungan</p>
            <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate">
              {rupiahSingkat(data?.tabungan?.saldo)}
            </p>
          </button>
        </div>

      </div>
    </div>
  )
}
