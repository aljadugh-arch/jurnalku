import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity, ArrowRight, CalendarCheck, ChevronRight, ClipboardCheck, LayoutGrid, Moon, Sun, Sunrise, Users,
} from 'lucide-react'
import api from '../../services/api'
import { adminDashboardShortcuts, parseAdminDashboardShortcutKeys } from '../../lib/adminDashboardShortcuts'
import { bisaBukaHalaman } from '../../lib/halamanTindakan'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import MobileDashboardHeader from '../../components/MobileDashboardHeader'
import MobileMenuSheet from '../../components/MobileMenuSheet'

interface Props { stats: any; loading?: boolean }

// Urutan waktu sholat untuk kartu jadwal.
const SHOLAT: Array<[string, string]> = [
  ['subuh', 'Subuh'], ['syuruq', 'Terbit'], ['dzuhur', 'Dzuhur'],
  ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya'],
]
const IKON_SHOLAT: Record<string, any> = {
  subuh: Sunrise, syuruq: Sun, dzuhur: Sun, ashar: Sun, maghrib: Moon, isya: Moon,
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

function Bar({ nilai, maks, tone = 'bg-emerald-500' }: { nilai: number; maks: number; tone?: string }) {
  const persen = maks > 0 ? Math.min(100, Math.round((nilai / maks) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
      <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${persen}%` }} />
    </div>
  )
}

export default function MobileAdminDashboard({ stats }: Props) {
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

  /* ── Angka kartu Statistik Monitoring Live ── */
  const rombel = monitoring?.rombel_attendance || []
  const totalSiswa = rombel.reduce((n: number, r: any) => n + Number(r.total || 0), 0) || Number(stats?.total_siswa || 0)
  const siswaHadir = rombel.reduce((n: number, r: any) => n + Number(r.masuk || 0), 0)
  const rombelBelumAbsen = rombel.filter((r: any) => Number(r.masuk || 0) < Number(r.total || 0))
  const ceklok = Number(monitoring?.teacher_checkins?.total || 0)
  const totalGtk = Number(monitoring?.gtk_aktif || 0)
  const jadwal = monitoring?.jadwal_hari_ini || { total: 0, guru: 0, rows: [] }

  return (
    <div className="lg:hidden min-h-screen -mx-4 -mt-3 bg-slate-50 pb-8 dark:bg-gray-950">
      <div className="px-4 pb-2 pt-4">
        <MobileDashboardHeader />
      </div>

      <main data-mobile-compact-dashboard="true" className="space-y-4 px-4 pt-3">
        {/* ── MENU GRID 4x2 (ubin terakhir: Lainnya) ── */}
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Menu Layanan</h2>
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
              <p className="mt-0.5 break-words text-[11px] text-slate-400">Aktivitas hari ini{monitoring?.date ? ` · ${monitoring.date}` : ''}</p>
            </div>
          </div>

          {/* 1. Absensi siswa hari ini + rombel yang belum absen */}
          <div data-monitoring-absensi="true" className="rounded-xl bg-slate-50 p-3 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-gray-200">
                  <ClipboardCheck size={14} className="shrink-0 text-emerald-600" /> Absensi Siswa Hari Ini
                </p>
                <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-gray-400">
                  {siswaHadir} dari {totalSiswa} siswa tercatat
                </p>
              </div>
              <span className="shrink-0 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{siswaHadir}</span>
            </div>
            <div className="mt-2"><Bar nilai={siswaHadir} maks={totalSiswa} /></div>
            <div className="mt-2.5">
              {rombelBelumAbsen.length === 0 ? (
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  {totalSiswa > 0 ? 'Semua rombel sudah absen lengkap' : 'Belum ada rombel dengan siswa aktif'}
                </p>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    Belum absen ({rombelBelumAbsen.length} rombel)
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {rombelBelumAbsen.slice(0, 6).map((r: any) => (
                      <span key={r.rombel_id} className="max-w-full break-words rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                        {r.rombel_nama} · {Number(r.masuk || 0)}/{Number(r.total || 0)}
                      </span>
                    ))}
                    {rombelBelumAbsen.length > 6 && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-gray-700 dark:text-gray-300">
                        +{rombelBelumAbsen.length - 6} lagi
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 2. Ceklok GTK hari ini */}
          <div data-monitoring-ceklok="true" className="mt-2 rounded-xl bg-slate-50 p-3 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-gray-200">
                  <Users size={14} className="shrink-0 text-cyan-600" /> Ceklok GTK Hari Ini
                </p>
                <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-gray-400">
                  {totalGtk > 0 ? `${ceklok} dari ${totalGtk} GTK sudah ceklok` : `${ceklok} GTK sudah ceklok`}
                </p>
              </div>
              <span className="shrink-0 text-lg font-bold tabular-nums text-cyan-700 dark:text-cyan-300">{ceklok}</span>
            </div>
            <div className="mt-2"><Bar nilai={ceklok} maks={totalGtk || ceklok} tone="bg-cyan-500" /></div>
          </div>

          {/* 3. Jadwal guru hari ini */}
          <div data-monitoring-jadwal="true" className="mt-2 rounded-xl bg-slate-50 p-3 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-gray-200">
                  <CalendarCheck size={14} className="shrink-0 text-indigo-600" /> Jadwal Guru Hari Ini
                </p>
                <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-gray-400">
                  {jadwal.total || 0} jadwal · {jadwal.guru || 0} guru mengajar
                </p>
              </div>
              <span className="shrink-0 text-lg font-bold tabular-nums text-indigo-700 dark:text-indigo-300">{jadwal.total || 0}</span>
            </div>
            {(jadwal.rows || []).length > 0 && (
              <div className="mt-2 space-y-1">
                {(jadwal.rows || []).slice(0, 3).map((j: any) => (
                  <p key={j.id} className="break-words text-[10px] text-slate-500 dark:text-gray-400">
                    {j.jam_mulai}–{j.jam_selesai} · {j.mapel_nama || '-'} · {j.guru_nama || '-'}
                  </p>
                ))}
                {(jadwal.rows || []).length > 3 && (
                  <p className="text-[10px] text-slate-400">+{jadwal.rows.length - 3} jadwal lagi</p>
                )}
              </div>
            )}
          </div>

          <Link
            to="/admin/monitoring"
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white active:scale-95"
          >
            Buka Monitoring Lengkap <ArrowRight size={14} />
          </Link>
        </section>
      </main>
      <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
