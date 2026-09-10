import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft, ArrowRight, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'

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
  const { loginWithCredentials, loginDemo } = useAuthStore()

  useEffect(() => {
    if (window.location.hash !== '#demo' || !demoRef.current) return
    const frame = window.requestAnimationFrame(() => {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      demoRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const getRedirectPath = (role: string) => {
    if (['admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu'].includes(role)) return '/admin'
    if (role === 'guru' || role === 'wali_kelas') return '/guru'
    return '/siswa'
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

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-gray-100">
      {/* Left panel — marketing (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[45%] bg-slate-900 dark:bg-black items-center justify-center relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 px-12 xl:px-16 max-w-lg">
          {/* Logo + brand */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center overflow-hidden shadow-lg p-2">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-2xl font-black text-white tracking-tight">JURNALKU</span>
              <p className="text-[11px] text-slate-400 font-medium">{settings.nama_lembaga || 'Sistem Informasi Madrasah'}</p>
            </div>
          </div>
          {/* Headline */}
          <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-4">
            Kelola Sekolah<br />
            <span className="text-blue-400">Jadi Lebih Mudah.</span>
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-8">
            Platform SIMS/M terpadu untuk madrasah &amp; sekolah. Presensi, jurnal KBM, nilai,
            keuangan, dan komunikasi sekolah dalam satu genggaman.
          </p>
          {/* Trust indicator */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex -space-x-2">
              {['A', 'S', 'B', 'R'].map((l, i) => (
                <div
                  key={i}
                  className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-slate-900"
                >
                  {l}
                </div>
              ))}
            </div>
            <span>Dipercaya ratusan tenaga pendidik</span>
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col justify-between p-4 sm:p-8 bg-slate-50 dark:bg-gray-950">
        <div className="flex justify-end p-2">
          <button
            onClick={toggleDark}
            className="p-2.5 rounded-full text-slate-500 hover:bg-slate-200 dark:text-gray-400 dark:hover:bg-gray-800 transition"
            aria-label={dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
            title={dark ? 'Mode Terang' : 'Mode Gelap'}
          >
            {dark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} />}
          </button>
        </div>

        <div className="w-full max-w-md mx-auto my-auto">
          {/* Mobile branding */}
          <div className="text-center lg:hidden mb-6">
            <div className="w-14 h-14 bg-white dark:bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md border border-slate-100 dark:border-gray-800 overflow-hidden p-2">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">JURNALKU</h1>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{settings.nama_lembaga || 'Sistem Informasi Sekolah'}</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-gray-800 p-6 sm:p-8">
            {/* Back link + heading */}
            <div className="mb-6">
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 mb-3 transition-colors"
              >
                <ArrowLeft size={13} /> Kembali
              </Link>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Masuk ke Akun</h2>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Masukkan email/kode guru atau NISN/NIS siswa</p>
            </div>

            {error && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-medium px-4 py-3 rounded-2xl mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-identifier" className="block text-xs font-bold text-slate-700 dark:text-gray-300 mb-1.5">
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
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition-all text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="text-xs font-bold text-slate-700 dark:text-gray-300">Password</label>
                  <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline font-semibold">
                    Lupa?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pr-10 text-sm transition-all text-slate-900 dark:text-white"
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
                className="w-full bg-blue-600 text-white py-3 rounded-2xl font-bold text-sm hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-98"
              >
                {loading ? 'Memproses...' : (
                  <>Masuk <ArrowRight size={16} /></>
                )}
              </button>
            </form>

            {['jurnal.cc.cd','jurnalmadrasah.web.id'].includes(window.location.hostname) && (
            <div
              id="demo"
              ref={demoRef}
              tabIndex={-1}
              className="mt-5 scroll-mt-4 rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/30 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <p className="text-xs font-bold text-slate-800 dark:text-gray-200 mb-2">Akun Demo Cepat</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {['admin','kepala','guru','bendahara','siswa'].map(role => (
                  <button key={role} type="button" onClick={() => handleDemo(role)} className="rounded-xl bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700 capitalize shadow-xs">
                    {role.replace('_',' ')}
                  </button>
                ))}
              </div>
            </div>
            )}

            <div className="mt-6 text-center">
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Belum punya akun?{' '}
                <Link to="/register" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">
                  Daftar gratis
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 dark:text-gray-600 mt-6 font-medium">
            © 2026 JURNALKU — Sistem Informasi Madrasah & Sekolah
          </p>
        </div>
        <div />
      </div>
    </div>
  )
}
