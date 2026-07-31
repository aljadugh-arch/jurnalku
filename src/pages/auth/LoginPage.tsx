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
    <div className="min-h-screen overflow-hidden bg-slate-950 text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,.35),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,.28),transparent_30%)]"></div>
      <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden lg:flex flex-col justify-between p-10 text-white">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white p-1.5 shadow-xl shadow-black/20">
              <img src={logo} alt="Logo Jurnalku" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">JURNALKU</p>
              <p className="text-xs text-slate-300">Dashboard sekolah modern</p>
            </div>
          </div>
          <div className="max-w-xl">
            <p className="mb-4 inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-sky-100 backdrop-blur">SIM sekolah/madrasah siap pakai</p>
            <h1 className="text-5xl font-bold leading-tight tracking-tight font-display">Kelola jurnal, jadwal, absensi, dan data sekolah dalam satu tempat.</h1>
            <p className="mt-5 text-lg text-slate-300">Tampilan baru, fungsi tetap sama. Masuk dengan akun asli atau pilih akun demo.</p>
          </div>
          <div className="grid max-w-xl grid-cols-3 gap-3 text-sm">
            {['Jurnal guru', 'Absensi QR/GPS', 'Multi tenant'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="font-semibold">{item}</p>
                <p className="mt-1 text-xs text-slate-300">Aktif</p>
              </div>
            ))}
          </div>
        </section>

        <main className="flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-[460px] rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8">
            <div className="mb-8 text-center lg:hidden">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg">
                <img src={logo} alt="Logo Jurnalku" className="h-full w-full object-contain" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 font-display">JURNALKU</h1>
              <p className="mt-2 text-sm text-slate-500">Sistem Informasi Manajemen Sekolah/Madrasah</p>
            </div>

            <div className="mb-6">
              <p className="text-sm font-semibold text-primary">Selamat datang</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Masuk ke akun</h2>
              <p className="mt-1 text-sm text-slate-500">Gunakan email/kode guru dan password.</p>
            </div>

            {error && (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Email atau kode guru</label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@sekolah.id"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-1 text-slate-400 hover:bg-slate-100"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-950 py-3 font-semibold text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
              <div className="flex items-center justify-between pt-1">
                <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">Lupa password?</Link>
                <Link to="/register" className="text-xs font-medium text-primary hover:underline">Daftar akun baru</Link>
              </div>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <p className="mb-3 text-center text-sm font-medium text-slate-500">Akun Demo</p>
              <div className="grid grid-cols-2 gap-2">
                {demoButtons.map((d) => (
                  <button
                    key={d.role}
                    onClick={() => handleDemoLogin(d.role)}
                    disabled={loading}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md disabled:opacity-50"
                  >
                    <p className="truncate text-xs font-semibold text-slate-800">{d.nama}</p>
                    <p className="mt-1 text-[10px] text-slate-400 capitalize">{d.label}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
