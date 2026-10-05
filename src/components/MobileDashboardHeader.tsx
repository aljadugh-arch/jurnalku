import { Building2 } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { heroColors } from '../lib/applyTheme'
import { useThemeStore } from '../stores/themeStore'
import NotifBell from './NotifBell'

const ROLE_LABEL: Record<string, string> = {
  admin: 'ADMIN',
  super_admin: 'SUPER ADMIN',
  kepala: 'KEPALA',
  bendahara: 'BENDAHARA',
  operator: 'OPERATOR',
  tata_usaha: 'TATA USAHA',
  tu: 'TATA USAHA',
  guru: 'GURU',
  wali_kelas: 'WALI KELAS',
  siswa: 'SISWA',
  wali_murid: 'WALI MURID',
}

/**
 * Header dashboard mobile: kotak berlatar warna aksen lembaga (diatur di
 * Pengaturan → warna primary) berisi logo + nama lembaga di kiri dan lonceng
 * notifikasi di kanan, lalu identitas pengguna (nama besar + peran) di bawahnya.
 */
export default function MobileDashboardHeader({ roleOverride, photo }: { roleOverride?: string; photo?: string | null }) {
  const user = useAuthStore(s => s.user)
  const settings = useSettingsStore(s => s.settings)
  const dark = useThemeStore(s => s.dark)
  const accent = heroColors(settings, dark)

  const namaLembaga = (settings.nama_lembaga as string) || 'Lembaga'
  const logo = (settings.logo as string) || ''
  const peran = roleOverride || ROLE_LABEL[user?.role || ''] || (user?.role || 'PENGGUNA').toUpperCase()

  return (
    <header data-dashboard-header="true" className="space-y-3">
      <div
        className="relative overflow-hidden rounded-2xl px-4 py-3.5 shadow-sm"
        style={{ background: accent }}
      >
        {/* Lapisan gradasi dibuat terpisah agar warna aksen boleh berupa var(...)
            (heroColors mengembalikan var(--color-primary, …) sebelum setelan termuat). */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/15" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
        </div>
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 shadow-sm">
            {logo
              ? <img src={logo} alt={namaLembaga} className="h-full w-full object-contain p-1" />
              : <Building2 size={22} className="text-slate-500" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-[13px] font-bold leading-tight text-white">{namaLembaga}</p>
            <p className="text-[11px] leading-tight text-white/75">Sistem Informasi Lembaga</p>
          </div>
          <NotifBell light />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {photo ? (
          <img
            src={photo}
            alt={user?.nama || 'Pengguna'}
            className="h-12 w-12 shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white dark:ring-gray-800"
          />
        ) : null}
        <div className="min-w-0">
          <p className="break-words text-2xl font-bold leading-tight text-slate-900 dark:text-white">
            {user?.nama || 'Pengguna'}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">{peran}</p>
        </div>
      </div>
    </header>
  )
}
