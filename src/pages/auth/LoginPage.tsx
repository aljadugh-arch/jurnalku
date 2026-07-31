import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Eye, EyeOff } from 'lucide-react'

const demoButtons = [
  { role: 'admin', nama: 'Admin Sekolah', label: 'Admin Operator' },
  { role: 'kepala', nama: 'Kepala Madrasah', label: 'Kepala' },
  { role: 'guru', nama: 'Budi Santoso, S.Pd', label: 'Guru' },
  { role: 'siswa', nama: 'Ahmad Fauzi', label: 'Siswa' },
  { role: 'wali_kelas', nama: 'Siti Rahayu, S.Pd', label: 'Wali Kelas' },
]

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
    if (role === 'admin' || role === 'super_admin' || role === 'kepala') return '/admin'
    if (role === 'guru' || role === 'wali_kelas') return '/guru'
    return '/siswa'
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

  const handleDemoLogin = async (role: string) => {
    setError('')
    setLoading(true)
    try {
      await loginDemo(role)
      navigate(getRedirectPath(role))
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login demo gagal.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark via-primary to-primary-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
            <img src={logo} alt="Logo Jurnalku" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white font-display">JURNALKU</h1>
          <p className="text-blue-200 mt-2">Sistem Informasi Manajemen Sekolah/Madrasah</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Masuk ke Akun</h2>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@sekolah.id"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-2.5 rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
            <div className="flex items-center justify-between mt-3">
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">Lupa password?</Link>
              <Link to="/register" className="text-xs text-primary hover:underline">Daftar akun baru</Link>
            </div>
          </form>

          <div className="mt-6 border-t pt-6">
            <p className="text-sm text-gray-500 mb-3 text-center">Akun Demo (klik untuk masuk)</p>
            <div className="grid grid-cols-2 gap-2">
              {demoButtons.map((d) => (
                <button
                  key={d.role}
                  onClick={() => handleDemoLogin(d.role)}
                  disabled={loading}
                  className="text-left px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <p className="text-xs font-medium text-gray-700 truncate">{d.nama}</p>
                  <p className="text-[10px] text-gray-400 capitalize">{d.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
