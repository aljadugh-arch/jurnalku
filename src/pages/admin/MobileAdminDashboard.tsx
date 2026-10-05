import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity, ArrowRight, ChevronRight, LayoutGrid, Moon, Sun, Sunrise, Sunset,
} from 'lucide-react'
import api from '../../services/api'
import { adminDashboardShortcuts, parseAdminDashboardShortcutKeys } from '../../lib/adminDashboardShortcuts'
import { bisaBukaHalaman } from '../../lib/halamanTindakan'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import MobileDashboardHeader from '../../components/MobileDashboardHeader'
import MobileMenuSheet from '../../components/MobileMenuSheet'

interface Props { stats: any; loading?: boolean; kelengkapan?: any }

// Urutan waktu sholat untuk kartu jadwal.
const SHOLAT: Array<[string, string]> = [
  ['subuh', 'Subuh'], ['syuruq', 'Terbit'], ['dzuhur', 'Dzuhur'],
  ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya'],
]
const IKON_SHOLAT: Record<string, any> = {
  subuh: Sunrise, syuruq: Sun, dzuhur: Sun, ashar: Sunset, maghrib: Moon, isya: Moon,
}

function menitSekarang(): number {
  const wib = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const [h, m] = wib.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function keMenit(t?: string | null): number {
  if (!t) return -1
  const [h, m] = String(t).split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : -1
}

export default function MobileAdminDashboard({ stats, kelengkapan }: Props) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sholat, setSholat] = useState<any>(null)
  const [monitoring, setMonitoring] = useState<any>(null)
  const settings = useSettingsStore(s => s.settings)
  const user = useAuthStore(s => s.user)

  // Pintasan yang tidak boleh dibuka peran ini disembunyikan (mis. halaman khusus admin).
  const menuTerbuka = useMemo(
    () => parseAdminDashboardShortcutKeys(settings.dashboard_quick_menus)
      .map(key => adminDashboardShortcuts.find(item => item.key === key))
      .filter((item): item is typeof adminDashboardShortcuts[number] => !!item && bisaBukaHalaman(user?.role, item.path)),
    [settings.dashboard_quick_menus, user?.role],
  )

  useEffect(() => {
    api.get('/jadwal-sholat').then(r => setSholat(r.data)).catch(() => setSholat(null))
    api.get('/admin/monitoring').then(r => setMonitoring(r.data)).catch(() => setMonitoring(null))
  }, [])

  // Grid 4x2: tujuh pintasan pertama + ubin "Lainnya" yang membuka menu lengkap.
  const gridItems = menuTerbuka.slice(0, 7)
  const sholatBerikutnya = useMemo(() => {
    if (!sholat) return null
    const cur = menitSekarang()
    for (const [key] of SHOLAT) {
      if (keMenit(sholat[key]) >= cur) return key
    }
    return null
  }, [sholat])

  const metrik = [
    { label: 'Guru Ceklok', value: monitoring?.teacher_checkins?.total ?? 0, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Masuk Kelas', value: monitoring?.class_sessions?.total ?? 0, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Siswa QR', value: monitoring?.student_qr?.total ?? 0, tone: 'bg-cyan-50 text-cyan-700' },
    { label: 'Penugasan', value: monitoring?.assignments?.total ?? 0, tone: 'bg-indigo-50 text-indigo-700' },
  ]

  return (
    <div className="lg:hidden min-h-screen -mx-4 -mt-3 bg-slate-50 pb-8 dark:bg-gray-950">
      <div className="px-4 pb-2 pt-4">
        <MobileDashboardHeader />
      </div>

      <main data-mobile-compact-dashboard="true" className="space-y-4 px-4 pt-3">
        {/* ── MENU GRID 4x2 (ubin terakhir: Lainnya) ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Menu Layanan</h2>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary"
            >
              Semua Menu <ChevronRight size={14} />
            </button>
          </div>
          <div
            data-admin-menu-grid="true"
            data-dashboard-quick-menus="dashboard_quick_menus"
            className="grid grid-cols-4 gap-x-2 gap-y-4"
          >
            {gridItems.map(item => (
              <Link key={item.key} to={item.path} className="flex min-w-0 flex-col items-center text-center active:scale-95">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm ${item.tile}`}>{item.icon}</span>
                <span className="mt-1.5 w-full break-words text-[10px] font-medium leading-3 text-slate-600 dark:text-gray-300">{item.label}</span>
              </Link>
            ))}
            <button
              type="button"
              data-admin-menu-more="true"
              onClick={() => setMenuOpen(true)}
              className="flex min-w-0 flex-col items-center text-center active:scale-95"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-200 text-slate-600 shadow-sm dark:bg-gray-700 dark:text-gray-200">
                <LayoutGrid size={20} />
              </span>
              <span className="mt-1.5 w-full break-words text-[10px] font-medium leading-3 text-slate-600 dark:text-gray-300">Lainnya</span>
            </button>
          </div>
        </section>

        {/* ── JADWAL SHOLAT ── */}
        <section data-admin-sholat-card="true" className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Sunrise size={16} className="shrink-0 text-emerald-600" /> Jadwal Sholat
              </h2>
              <p className="mt-0.5 break-words text-[11px] text-slate-400">
                {sholat ? `${sholat.kota}${sholat.provinsi ? `, ${sholat.provinsi}` : ''} · ${sholat.hari}, ${sholat.tanggal}` : 'Memuat jadwal…'}
              </p>
            </div>
            {sholatBerikutnya && sholat?.[sholatBerikutnya] && (
              <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                Berikutnya {String(sholat[sholatBerikutnya])}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SHOLAT.map(([key, label]) => {
              const Icon = IKON_SHOLAT[key] || Sun
              const aktif = sholatBerikutnya === key
              return (
                <div
                  key={key}
                  className={`rounded-xl border px-2 py-2 text-center ${aktif ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-100 dark:border-gray-800'}`}
                >
                  <Icon size={14} className={`mx-auto ${aktif ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <p className="mt-1 break-words text-[10px] font-medium uppercase text-slate-500">{label}</p>
                  <p className={`text-sm font-bold tabular-nums ${aktif ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>
                    {sholat?.[key] || '--:--'}
                  </p>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] text-slate-400">{sholat?.sumber ? 'Dihitung dari koordinat lembaga (atur kota di Pengaturan)' : 'Atur kota lembaga di Pengaturan untuk jadwal yang akurat'}</p>
        </section>

        {/* ── STATISTIK MONITORING LIVE ── */}
        <section data-admin-monitoring-card="true" className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Activity size={16} className="shrink-0 text-indigo-600" /> Statistik Monitoring Live
              </h2>
              <p className="mt-0.5 break-words text-[11px] text-slate-400">Aktivitas hari ini · {stats?.total_siswa ?? 0} siswa terdaftar</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {metrik.map(m => (
              <div key={m.label} className={`rounded-xl px-3 py-2.5 ${m.tone}`}>
                <p className="text-xl font-bold tabular-nums">{m.value}</p>
                <p className="break-words text-[11px] opacity-80">{m.label}</p>
              </div>
            ))}
          </div>
          <Link
            to="/admin/monitoring"
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white active:scale-95"
          >
            Buka Monitoring Lengkap <ArrowRight size={14} />
          </Link>
        </section>

        {/* ── KELENGKAPAN DATA (bila tersedia) ── */}
        {kelengkapan && (
          <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Kelengkapan Data Lembaga</h2>
                <p className="break-words text-[11px] text-slate-400">{kelengkapan.jumlah_lengkap ?? 0} dari {kelengkapan.jumlah_item ?? 0} kategori lengkap</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${kelengkapan.skor_keseluruhan >= 75 ? 'bg-emerald-50 text-emerald-700' : kelengkapan.skor_keseluruhan >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{kelengkapan.skor_keseluruhan ?? 0}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-gray-800">
              <div
                className={`h-1.5 rounded-full ${kelengkapan.skor_keseluruhan >= 75 ? 'bg-emerald-500' : kelengkapan.skor_keseluruhan >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(kelengkapan.skor_keseluruhan ?? 0, 100)}%` }}
              />
            </div>
            {/* Yang paling tertinggal saja — rincian penuh ada di menu Monitoring Data */}
            {(kelengkapan.prioritas || [])
              .filter((p: any) => bisaBukaHalaman(user?.role, p.tautan))
              .slice(0, 3)
              .map((p: any) => (
                <Link
                  key={p.key}
                  to={p.tautan || '/admin/monitoring'}
                  className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 active:scale-[0.99] dark:bg-gray-800"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-[11px] font-medium text-slate-700 dark:text-gray-200">{p.label}</span>
                    {p.detail && <span className="block break-words text-[10px] text-slate-400">{p.detail}</span>}
                  </span>
                  <span className={`shrink-0 text-[11px] font-bold ${p.persen === 0 ? 'text-red-600' : 'text-amber-600'}`}>{p.persen}%</span>
                </Link>
              ))}
            <Link
              to="/admin/monitoring"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white active:scale-95"
            >
              Lihat semua di Monitoring Data
            </Link>
          </section>
        )}
      </main>
      <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
