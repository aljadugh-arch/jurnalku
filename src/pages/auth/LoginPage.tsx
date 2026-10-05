import { useEffect, useRef, useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'

const getRedirectPath = (role: string) => {
  if (['admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu'].includes(role)) return '/admin'
  if (role === 'guru' || role === 'wali_kelas') return '/guru'
  if (role === 'proktor') return '/proktor'
  return '/siswa'
}

/**
 * Halaman masuk minimalis: satu kolom tengah, logo lembaga, dua isian, tombol.
 * Tanpa panel pemasaran agar fokus ke formulir (dan ringan di HP).
 */
export default function LoginPage() {
  const { settings } = useSettingsStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const logo = settings.logo || '/logo-jurnalku-256.png'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const demoRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { loginWithCredentials, loginDemo, isAuthenticated, user, authReady } = useAuthStore()

  // PWA start_url untuk host tenant terdaftar adalah '/login', jadi setiap kali
  // aplikasi yang sudah terinstall dibuka ulang, browser membuka rute ini
  // langsung -- bukan '/'. Token 30 hari di localStorage tetap valid dan
  // checkAuth() tetap sukses, tapi tanpa redirect ini user selalu terjebak
  // melihat form login lagi, seolah-olah sesinya hilang ("logout otomatis").
  useEffect(() => {
    if (window.location.hash !== '#demo' || !demoRef.current) return
    const frame = window.requestAnimationFrame(() => {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      demoRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  // Jangan tampilkan form login jika sesi masih valid; redirect ke dashboard.
  if (authReady && isAuthenticated && user) {
    return <Navigate to={getRedirectPath(user.role)} replace />
  }

  const handleDemo = async (role: string) => {
    setError('')
    setLoading(true)
    try {
      await loginDemo(role)
      const user = useAuthStore.getState().user
      navigate(getRedirectPath(user?.role || role))
    } catch (err: any) {
      setError(err.response?.data?.error || 'Akun demo belum tersedia')
    } finally { setLoading(false) }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginWithCredentials(email, password)
      const user = useAuthStore.getState().user
      navigate(getRedirectPath(user?.role || 'siswa'))
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login gagal. Periksa email dan password.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 dark:border-gray-700 dark:bg-gray-800 dark:text-white'

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="flex justify-end p-3">
        <button
          onClick={toggleDark}
          className="rounded-full p-2 text-slate-400 transition hover:bg-slate-200 dark:hover:bg-gray-800"
          aria-label={dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          title={dark ? 'Mode Terang' : 'Mode Gelap'}
        >
          {dark ? <Sun size={17} className="text-amber-500" /> : <Moon size={17} />}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-10">
        <div className="w-full max-w-sm">
          {/* Identitas lembaga */}
          <div className="mb-7 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <img src={logo} alt="Logo" className="h-full w-full object-contain" />
            </div>
            <h1 className="break-words text-lg font-bold leading-tight text-slate-900 dark:text-white">
              {settings.nama_lembaga || 'JURNALKU'}
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-400">Sistem Informasi Madrasah &amp; Sekolah</p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label htmlFor="login-identifier" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-gray-300">
                Email / Kode Guru / NISN / NIS
              </label>
              <input
                id="login-identifier"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email, kode guru, NISN, atau NIS"
                className={inputClass}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="login-password" className="text-xs font-semibold text-slate-600 dark:text-gray-300">Password</label>
                <Link to="/forgot-password" className="text-[11px] font-semibold text-primary hover:underline">Lupa?</Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-sm transition-all hover:opacity-95 active:scale-[.99] disabled:opacity-50"
            >
              {loading ? 'Memproses...' : (<>Masuk <ArrowRight size={16} /></>)}
            </button>
          </form>

          <p className="mt-3 text-[11px] leading-snug text-slate-400">
            Username dan password awal siswa menggunakan NISN, atau NIS jika NISN belum tersedia.
          </p>

          {['jurnal.cc.cd', 'jurnalmadrasah.web.id'].includes(window.location.hostname) && (
            <div
              id="demo"
              ref={demoRef}
              tabIndex={-1}
              className="mt-5 scroll-mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-gray-800 dark:bg-gray-900/50"
            >
              <p className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-gray-400">Akun demo</p>
              <div className="grid grid-cols-3 gap-1.5">
                {['admin', 'kepala', 'guru', 'bendahara', 'siswa'].map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleDemo(role)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold capitalize text-slate-600 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {role.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-gray-400">
            Belum punya akun?{' '}
            <Link to="/register" className="font-semibold text-primary hover:underline">Daftar gratis</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
