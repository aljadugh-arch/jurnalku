import { useEffect, useRef, useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { ClipboardList } from 'lucide-react'
import api, { pesanGagalJaringan } from '../../services/api'
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
    // Batas waktu pendek: di koneksi lemah permintaan opsional ini bersaing
    // memperebutkan bandwidth dengan permintaan login. Kalau lambat, lebih baik
    // dilepas cepat daripada menahan antrean.
    api.get('/ppdb/publik/info', { timeout: 8000 })
      .then(({ data }) => { if (hidup) setPpdb({ dibuka: !!data?.dibuka, nama: data?.gelombang?.nama || null }) })
      .catch(() => { /* diam: PPDB opsional, jangan ganggu halaman login */ })
    return () => { hidup = false }
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  // Kalau sesi berakhir karena lembaga dinonaktifkan, jelaskan alasannya di
  // halaman login — jangan biarkan pengguna mengira aplikasinya rusak.
  useEffect(() => {
    const alasan = new URLSearchParams(window.location.search).get('alasan')
    if (alasan === 'lembaga-nonaktif') {
      setError('Lembaga ini sedang tidak aktif. Hubungi penyedia layanan apabila Anda merasa ini sebuah kekeliruan.')
    }
  }, [])
  const [loading, setLoading] = useState(false)
  // Penanda koneksi lambat: setelah 6 detik menunggu, beri tahu pengguna bahwa
  // masih diproses — bukan macet. Di koneksi lemah, spinner diam tanpa
  // keterangan membuat orang menutup aplikasi lalu mengulang login berkali-kali
  // (yang justru menambah beban dan memicu batas percobaan).
  const [lambat, setLambat] = useState(false)
  useEffect(() => {
    if (!loading) { setLambat(false); return }
    const t = window.setTimeout(() => setLambat(true), 6000)
    // Dengarkan perubahan status jaringan: begitu perangkat kembali online,
    // hilangkan peringatan tanpa menunggu permintaan selesai.
    const onOnline = () => setLambat(false)
    window.addEventListener('online', onOnline)
    return () => { window.clearTimeout(t); window.removeEventListener('online', onOnline) }
  }, [loading])
  // Login wali tanpa sandi: kode 6 digit dikirim ke WhatsApp nomor terdaftar.
  const [mode, setMode] = useState<'sandi' | 'otp'>('sandi')
  const [otpTerkirim, setOtpTerkirim] = useState(false)
  const [kode, setKode] = useState('')
  const [info, setInfo] = useState('')
  const demoRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { loginWithCredentials, loginDemo, mintaOtp, loginDenganOtp, isAuthenticated, user, authReady } = useAuthStore()

  // Panel demo HANYA ditampilkan kalau SERVER membenarkan host ini.
  // Sebelumnya daftar host diduplikasi di sini, dan keduanya melenceng:
  // `jurnalmadrasah.web.id` ikut terdaftar padahal itu alamat resmi MI Sunan
  // Drajat, jadi wali murid di sana melihat panel akun demo di halaman login
  // lembaganya sendiri. Sekarang server yang menjawab (/api/demo-status) —
  // satu aturan, tidak bisa berbeda antara tampilan dan route.
  // Default `false`: kalau permintaan gagal, panel tidak muncul. Lebih baik
  // tombol hilang daripada muncul lalu 404.
  // Catatan: hook ini WAJIB di atas early-return sesi di bawah — kalau
  // diletakkan setelahnya, jumlah hook berubah antar-render dan React melempar
  // "Rendered fewer hooks than expected" begitu user login.
  const [demoHostAktif, setDemoHostAktif] = useState(false)
  useEffect(() => {
    let batal = false
    api.get('/demo-status', { timeout: 8000 })
      .then(r => { if (!batal) setDemoHostAktif(Boolean(r?.data?.aktif)) })
      .catch(() => { if (!batal) setDemoHostAktif(false) })
    return () => { batal = true }
  }, [])

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

  const handleMintaOtp = async () => {
    setError(''); setInfo(''); setLoading(true)
    try {
      const r = await mintaOtp(email)
      setOtpTerkirim(true)
      setInfo(r.pesan)
    } catch (err: any) {
      // Membedakan gagal jaringan dari penolakan server. Sebelumnya jaringan
      // putus selalu tampil "Gagal mengirim kode" sehingga wali mengulang
      // terus padahal yang bermasalah sinyalnya.
      setError(err?.response?.data?.error || pesanGagalJaringan(err))
    } finally { setLoading(false) }
  }

  const handleVerifikasiOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await loginDenganOtp(email, kode)
      const u = useAuthStore.getState().user
      navigate(getRedirectPath(u?.role || 'wali_murid'))
    } catch (err: any) {
      // Kalau server menjawab, pakai pesannya ("Kode salah atau kedaluwarsa").
      // Kalau tidak ada jawaban sama sekali, jangan salahkan kodenya.
      setError(err?.response?.data?.error || pesanGagalJaringan(err))
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
      // Sebelumnya: err.response?.data?.error || 'Login gagal. Periksa email...'
      // Saat jaringan putus, err.response kosong sehingga pengguna diberi tahu
      // "periksa email dan password" — padahal sandinya benar dan yang salah
      // adalah sinyal. Pesan sekarang membedakan ditolak server vs jaringan.
      setError(pesanGagalJaringan(err))
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

          {lambat && !error && (
            <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
              Koneksi lambat — masih diproses. Jangan tutup halaman ini.
            </div>
          )}

          {/* Pilihan cara masuk. Wali murid memakai OTP karena sandi bawaan
              mereka adalah 6 digit terakhir nomor WA — angka yang mudah
              ditebak siapa pun yang tahu nomornya. */}
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-gray-800">
            {([['sandi', 'Email / NIS'], ['otp', 'Nomor WA (OTP)']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setMode(id); setError(''); setInfo(''); setOtpTerkirim(false); setKode('') }}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  mode === id
                    ? 'bg-white text-primary shadow-sm dark:bg-gray-900'
                    : 'text-slate-500 hover:text-slate-700 dark:text-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {info && (
            <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-400">
              {info}
            </div>
          )}

          {mode === 'otp' ? (
            <form onSubmit={handleVerifikasiOtp} className="space-y-3.5">
              <div>
                <label htmlFor="otp-phone" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-gray-300">
                  Nomor WhatsApp
                </label>
                <input
                  id="otp-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Nomor WhatsApp"
                  className={inputClass}
                />
              </div>

              {otpTerkirim && (
                <div>
                  <label htmlFor="otp-code" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-gray-300">
                    Kode 6 Digit
                  </label>
                  <input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={kode}
                    onChange={(e) => setKode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className={`${inputClass} text-center text-lg font-bold tracking-[0.5em]`}
                  />
                </div>
              )}

              {otpTerkirim ? (
                <button
                  type="submit"
                  disabled={loading || kode.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-sm transition-all hover:opacity-95 active:scale-[.99] disabled:opacity-50"
                >
                  {loading ? 'Memeriksa...' : (<>Masuk <ArrowRight size={16} /></>)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleMintaOtp()}
                  disabled={loading || email.trim().length < 9}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-sm transition-all hover:opacity-95 active:scale-[.99] disabled:opacity-50"
                >
                  {loading ? 'Mengirim...' : 'Kirim Kode ke WhatsApp'}
                </button>
              )}

              {otpTerkirim && (
                <button
                  type="button"
                  onClick={() => void handleMintaOtp()}
                  disabled={loading}
                  className="w-full text-center text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  Kirim ulang kode
                </button>
              )}
            </form>
          ) : (
          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label htmlFor="login-identifier" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-gray-300">
                Username
              </label>
              <input
                id="login-identifier"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Username"
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
                  placeholder="Password"
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
          )}

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
                {['admin', 'kepala', 'guru', 'bendahara', 'siswa', 'wali_murid', 'proktor'].map(role => (
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

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-gray-400">
            Belum punya akun?{' '}
            <Link to="/register" className="font-semibold text-primary hover:underline">Daftar gratis</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
