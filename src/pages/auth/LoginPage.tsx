import { useEffect, useRef, useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { ClipboardList } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
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

  // PPDB di halaman login: calon siswa bisa membuka formulir pendaftaran
  // lembaga ini tanpa akun. Tombol hanya tampil bila pendaftaran memang dibuka,
  // supaya tidak menyesatkan saat gelombang tutup.
  const [ppdb, setPpdb] = useState<{ dibuka: boolean; nama: string | null }>({ dibuka: false, nama: null })
  useEffect(() => {
    let hidup = true
    api.get('/ppdb/publik/info')
      .then(({ data }) => { if (hidup) setPpdb({ dibuka: !!data?.dibuka, nama: data?.gelombang?.nama || null }) })
      .catch(() => { /* diam: PPDB opsional, jangan ganggu halaman login */ })
    return () => { hidup = false }
  }, [])
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

  // Tombol demo hanya ditampilkan di domain PLATFORM, sama dengan yang dilayani
  // server (DEMO_HOSTS). Sebelumnya tombol muncul di domain lembaga juga,
  // padahal server menolak 404 di sana — pengunjung melihat tombol yang pasti
  // gagal. Satu sumber kebenaran: daftar host di server.
  const demoHostAktif = (() => {
    const h = String(window.location.hostname || '').toLowerCase().replace(/\.$/, '')
    return h === 'localhost' || h === '127.0.0.1'
      || h === 'jurnal.cc.cd' || h === 'jurnalmadrasah.web.id'
      || h === 'jurnalku.biz.id' || h === 'idjurnal.my.id'
      || h === 'idjurnal.web.id' || h === 'idjurnal.biz.id'
      || h === 'demo.jurnal.cc.cd'
  })()

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
                Email / No. WhatsApp Wali / Kode Guru / NISN
              </label>
              <input
                id="login-identifier"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email, no. WA wali, kode guru, NISN, atau NIS"
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

          {/* Tautan PPDB: pendaftaran mandiri calon siswa tanpa akun.
              URL bisa dibagikan (WA/poster) — tetap milik lembaga ini karena
              tenant ditentukan dari domain yang dipakai. */}
          {ppdb.dibuka && (
            <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
              <div className="flex items-start gap-2.5">
                <ClipboardList size={18} className="mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700 dark:text-gray-200">Pendaftaran siswa baru dibuka</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-gray-400">
                    {ppdb.nama ? `${ppdb.nama} — ` : ''}Calon siswa/wali bisa mendaftar tanpa akun.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Link to="/ppdb" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-95">
                      Daftar Sekarang
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/ppdb`
                        navigator.clipboard?.writeText(url)
                          .then(() => toast.success('Tautan PPDB disalin'))
                          .catch(() => toast(`Tautan: ${url}`))
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                      Salin Tautan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Akun demo ditampilkan di SEMUA domain platform (permintaan user:
              "perbaiki akun demo munculkan di jurnal"). Pengunjung jurnal.cc.cd
              dan jurnal lembaga perlu bisa mencoba tanpa mendaftar.
              PENGAMAN: server tetap hanya melayani /api/auth/demo dari host di
              DEMO_HOSTS, dan tenant-nya TERPISAH (demo-tenant) — jadi data
              contoh tidak pernah bercampur dengan data lembaga sungguhan.
              Kalau host tidak mengizinkan, tombol akan menampilkan pesan jelas
              alih-alih gagal diam-diam. */}
          {demoHostAktif && (
            <div
              id="demo"
              ref={demoRef}
              tabIndex={-1}
              className="mt-5 scroll-mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-gray-800 dark:bg-gray-900/50"
            >
              <p className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-gray-400">Akun demo</p>
              <div className="grid grid-cols-3 gap-1.5">
                {['admin', 'kepala', 'guru', 'bendahara', 'siswa', 'wali_murid'].map(role => (
                  <button
                    key={role}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemo(role)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold capitalize text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {role === 'wali_murid' ? 'wali murid' : role.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400 dark:text-gray-500">
            Wali murid: masuk dengan nomor WhatsApp yang terdaftar di sekolah.
            Sandi awal = 6 angka terakhir nomor tersebut.
          </p>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-gray-400">
            Belum punya akun?{' '}
            <Link to="/register" className="font-semibold text-primary hover:underline">Daftar gratis</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
