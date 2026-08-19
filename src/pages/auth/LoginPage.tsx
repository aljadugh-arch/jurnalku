import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft, ArrowRight } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'

export default function LoginPage() {
  const { settings } = useSettingsStore()
  const logo = settings.logo || '/logo-jurnalku-256.png'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { loginWithCredentials, loginDemo } = useAuthStore()

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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel — marketing (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[45%] bg-gray-900 items-center justify-center relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 px-12 xl:px-16 max-w-lg">
          {/* Logo + brand */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-2xl font-extrabold text-white">JURNALKU</span>
          </div>
          {/* Headline */}
          <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-4">
            Kelola Sekolah<br />
            <span className="text-gray-400">Jadi Lebih Mudah.</span>
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed mb-8">
            Platform SIMS/M terpadu untuk madrasah &amp; sekolah. Data siswa, jadwal, absensi,
            keuangan — semua dalam satu tempat.
          </p>
          {/* Trust indicator */}
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <div className="flex -space-x-2">
              {['A', 'S', 'B', 'R'].map((l, i) => (
                <div
                  key={i}
                  className="w-8 h-8 bg-gradient-to-br from-primary to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-gray-900"
                >
                  {l}
                </div>
              ))}
            </div>
            <span>Dipercaya 100+ lembaga</span>
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile branding */}
          <div className="text-center lg:hidden mb-8">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-gray-200 overflow-hidden">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl font-extrabold text-gray-900">JURNALKU</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
            {/* Back link + heading */}
            <div className="mb-6">
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
              >
                <ArrowLeft size={14} /> Kembali
              </Link>
              <h2 className="text-xl font-bold text-gray-900">Masuk ke Akun</h2>
              <p className="text-sm text-gray-500 mt-1">Masukkan email dan password Anda</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email / kode guru */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email / Kode Guru
                </label>
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email atau kode guru"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Password</label>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                    Lupa?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary pr-10 text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Memproses...' : (
                  <>Masuk <ArrowRight size={16} /></>
                )}
              </button>
            </form>


            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-sm font-bold text-gray-800 mb-2">Akun demo</p>
              <div className="grid grid-cols-2 gap-2">
                {['admin','kepala','guru','bendahara','siswa'].map(role => (
                  <button key={role} type="button" onClick={() => handleDemo(role)} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-primary border border-blue-100 hover:bg-blue-100 capitalize">
                    Demo {role.replace('_',' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Register link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Belum punya akun?{' '}
                <Link to="/register" className="text-primary font-semibold hover:underline">
                  Daftar gratis
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            © 2026 JURNALKU — SIMS/M Terpadu
          </p>
        </div>
      </div>
    </div>
  )
}
