import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Building2, ChevronDown, Lock, LogOut, Moon, Sun, User } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useThemeStore } from '../stores/themeStore'
import { heroColors } from '../lib/applyTheme'
import NotifBell from './NotifBell'
import Avatar from './ui/Avatar'

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
 * notifikasi di kanan, lalu identitas pengguna (avatar + nama besar + peran)
 * di bawahnya. Avatar membuka menu akun: profil, ganti password, tema, keluar.
 */
export default function MobileDashboardHeader({ roleOverride, photo }: { roleOverride?: string; photo?: string | null }) {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const settings = useSettingsStore(s => s.settings)
  const dark = useThemeStore(s => s.dark)
  const toggleDark = useThemeStore(s => s.toggle)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const accent = heroColors(settings, dark)
  const namaLembaga = (settings.nama_lembaga as string) || 'Lembaga'
  const logo = (settings.logo as string) || ''
  const peran = roleOverride || ROLE_LABEL[user?.role || ''] || (user?.role || 'PENGGUNA').toUpperCase()
  const base = pathname.startsWith('/guru') ? '/guru' : '/admin'

  const tutup = () => setMenuOpen(false)

  return (
    <header data-dashboard-header="true" className="space-y-3">
      <div
        className="relative rounded-2xl px-4 py-3.5 shadow-sm"
        style={{ background: accent }}
      >
        {/* Dekorasi dipotong di wadahnya SENDIRI — kotak header sengaja tidak
            memakai overflow-hidden supaya panel dropdown lonceng & menu akun
            bisa keluar dari kotak (sebelumnya terpotong tepat di batas bawah). */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/15" />
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

      {/* Identitas pengguna: avatar (membuka menu akun) + nama besar + peran.
          Dibungkus kartu (padding + rounded + shadow) supaya senada dengan kartu
          lain di dashboard, bukan menempel langsung di latar halaman. */}
      <div
        ref={menuRef}
        data-dashboard-identity="true"
        className="relative flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900"
      >
        <button
          type="button"
          data-akun-trigger="true"
          onClick={() => setMenuOpen(o => !o)}
          className="relative shrink-0 active:scale-95 transition"
          aria-label="Menu akun"
        >
          <Avatar
            src={photo || user?.avatar}
            name={user?.nama}
            size={48}
            className="!border-2 !border-white shadow-sm dark:!border-gray-800"
          />
          <ChevronDown size={13} className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border border-slate-200 bg-white p-[1px] text-slate-500 dark:border-gray-700 dark:bg-gray-800" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="break-words text-2xl font-bold leading-tight text-slate-900 dark:text-white">
            {user?.nama || 'Pengguna'}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">{peran}</p>
        </div>

        {menuOpen && (
          <div
            data-akun-menu="true"
            className="absolute left-0 top-full z-[100] mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              type="button"
              onClick={() => { tutup(); navigate(base + '/profile') }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <User size={16} className="shrink-0 text-slate-400" /> Profil Saya
            </button>
            <button
              type="button"
              onClick={() => { tutup(); navigate(base + '/change-password') }}
              className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Lock size={16} className="shrink-0 text-slate-400" /> Ganti Password
            </button>
            <button
              type="button"
              onClick={() => { tutup(); toggleDark() }}
              className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {dark ? <Sun size={16} className="shrink-0 text-slate-400" /> : <Moon size={16} className="shrink-0 text-slate-400" />}
              {dark ? 'Mode Terang' : 'Mode Gelap'}
            </button>
            <button
              type="button"
              onClick={() => { tutup(); logout() }}
              className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 dark:border-gray-800 dark:hover:bg-red-500/10"
            >
              <LogOut size={16} className="shrink-0" /> Keluar
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
