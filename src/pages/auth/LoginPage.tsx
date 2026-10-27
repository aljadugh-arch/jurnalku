import { useEffect, useRef, useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Moon, Sun, ClipboardList, GraduationCap, MonitorPlay, BookOpen, MessageCircle } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import api, { pesanGagalJaringan } from '../../services/api'
import toast from 'react-hot-toast'
import { useThemeStore } from '../../stores/themeStore'

// Site key reCAPTCHA v2 (PUBLIK — aman di kode). Secret key ada di server
// (RECAPTCHA_SECRET di server/.env), tidak pernah dikirim ke frontend.
const RECAPTCHA_SITEKEY = '6Lft1QIuAAAAAEvEEzG_qYGX0Pwj8GZdcT92YEgk'
const recaptchaApi = () => (window as any).grecaptcha
// Root domain yang widget-nya terdaftar (reCAPTCHA otomatis mencakup semua subdomain).
// Domain custom lembaga tidak tercakup → widget tidak dirender & token tidak wajib.
const RECAPTCHA_COVERED_ROOTS = ['cc.cd', 'jurnalmadrasah.web.id', 'jurnalku.biz.id', 'idjurnal.my.id', 'idjurnal.web.id', 'idjurnal.biz.id']
const recaptchaCoversHost = (host: string) => RECAPTCHA_COVERED_ROOTS.some((r) => host === r || host.endsWith('.' + r))

const getRedirectPath = (role: string) => {
  if (['admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu'].includes(role)) return '/admin'
  if (role === 'guru' || role === 'wali_kelas') return '/guru'
  if (role === 'proktor') return '/proktor'
  return '/siswa'
}

// Layanan unggulan yang ditampilkan di kolom intro halaman login (design system
// SISFO). PPDB adalah satu-satunya tautan publik sungguhan; sisanya mengarah ke
// /login karena fitur tersebut butuh akun (mirip sisfo yang menautkan "Akademik"
// ke halaman login).
const layanan = [
  { icon: GraduationCap, judul: 'PPDB', sub: 'Penerimaan Siswa Baru', href: '/ppdb' },
  { icon: MonitorPlay, judul: 'Ujian Online', sub: 'Computer Based Test', href: '/ujian-online' },
  { icon: BookOpen, judul: 'LMS', sub: 'Penugasan Digital', href: '/lms' },
  { icon: MessageCircle, judul: 'WhatsApp', sub: 'Kabar ke Wali Murid', href: '/whatsapp' },
]

/**
 * Halaman masuk dengan layout split ala SISFO: kolom kiri intro lembaga + grid
 * layanan, kolom kanan kartu login. Semua logika login (OTP wali, akun demo,
 * banner PPDB, deteksi koneksi lambat) dipertahankan — hanya tampilan yang
 * mengikuti design system krem/oranye.
 */
export default function LoginPage() {
  const { settings } = useSettingsStore()
  // reCAPTCHA hanya aktif di domain platform (root domain tercakup + subdomain-nya).
  // Domain custom lembaga tidak dirender widgetnya agar login tetap jalan.
  const recaptchaAktif = recaptchaCoversHost(window.location.hostname.toLowerCase())
  const recaptchaRef = useRef<HTMLDivElement>(null)
  const [recaptchaWidgetId, setRecaptchaWidgetId] = useState<number | null>(null)
  const [recaptchaGagal, setRecaptchaGagal] = useState(false)

  // Render widget reCAPTCHA v2 secara EKSPLISIT (lebih andal daripada implicit di SPA,
  // karena script bisa termuat sebelum React me-render div). Gagal dimuat → tampilkan
  // pesan yang terlihat, bukan gagal senyap.
  useEffect(() => {
    if (!recaptchaAktif) return
    const container = recaptchaRef.current
    if (!container) return
    let widgetId: number | undefined
    let batal = false
    const renderWidget = () => {
      const gr = (window as any).grecaptcha
      if (!gr || typeof gr.render !== 'function') return false
      try {
        widgetId = gr.render(container, {
          sitekey: RECAPTCHA_SITEKEY,
          hl: 'id',
          'error-callback': () => { if (!batal) setRecaptchaGagal(true) },
        })
        setRecaptchaWidgetId(widgetId ?? null)
        return true
      } catch {
        if (!batal) setRecaptchaGagal(true)
        return true // hentikan retry, error sudah ditampilkan
      }
    }
    if (renderWidget()) {
      return () => { try { recaptchaApi()?.reset(widgetId) } catch { /* abaikan */ } }
    }
    let n = 0
    const timer = setInterval(() => {
      n += 1
      if (renderWidget() || n > 40) clearInterval(timer) // maks ~12 detik
    }, 300)
    return () => {
      clearInterval(timer)
      try { recaptchaApi()?.reset(widgetId) } catch { /* abaikan */ }
    }
  }, [recaptchaAktif])
  const { dark, toggle: toggleDark } = useThemeStore()
  const logo = settings.logo || '/logo-jurnalku-256.png'
  const namaLembaga = settings.nama_lembaga || 'JURNALKU'

  // PPDB di halaman login: calon siswa bisa membuka formulir pendaftaran
  // lembaga ini tanpa akun. Tombol hanya tampil bila pendaftaran memang dibuka,
  // supaya tidak menyesatkan saat gelombang tutup.
  const [ppdb, setPpdb] = useState<{ dibuka: boolean; nama: string | null }>({ dibuka: false, nama: null })
  useEffect(() => {
    let hidup = true
    api.get('/ppdb/publik/info', { timeout: 8000 })
      .then(({ data }) => { if (hidup) setPpdb({ dibuka: !!data?.dibuka, nama: data?.gelombang?.nama || null }) })
      .catch(() => { /* diam: PPDB opsional, jangan ganggu halaman login */ })
    return () => { hidup = false }
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const alasan = new URLSearchParams(window.location.search).get('alasan')
    if (alasan === 'lembaga-nonaktif') {
      setError('Lembaga ini sedang tidak aktif. Hubungi penyedia layanan apabila Anda merasa ini sebuah kekeliruan.')
    }
  }, [])
  const [loading, setLoading] = useState(false)
  const [lambat, setLambat] = useState(false)
  useEffect(() => {
    if (!loading) { setLambat(false); return }
    const t = window.setTimeout(() => setLambat(true), 6000)
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

  // Panel demo HANYA ditampilkan kalau SERVER membenarkan host ini (satu aturan
  // server, tidak bisa berbeda antara tampilan dan route). Default false.
  const [demoHostAktif, setDemoHostAktif] = useState(false)
  useEffect(() => {
    let batal = false
    api.get('/demo-status', { timeout: 8000 })
      .then(r => { if (!batal) setDemoHostAktif(Boolean(r?.data?.aktif)) })
      .catch(() => { if (!batal) setDemoHostAktif(false) })
    return () => { batal = true }
  }, [])

  // PWA start_url untuk host tenant terdaftar adalah '/login' — redirect agar
  // aplikasi terinstall tidak terjebak menampilkan form login lagi.
  useEffect(() => {
    if (window.location.hash !== '#demo' || !demoRef.current) return
    const frame = window.requestAnimationFrame(() => {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      demoRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

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
      setError(err?.response?.data?.error || pesanGagalJaringan(err))
    } finally { setLoading(false) }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const token = recaptchaAktif && recaptchaWidgetId != null ? (recaptchaApi()?.getResponse?.(recaptchaWidgetId) || '') : ''
    if (recaptchaAktif && !token) {
      setError('Selesaikan verifikasi keamanan (centang CAPTCHA) terlebih dahulu.')
      return
    }
    setLoading(true)
    try {
      await loginWithCredentials(email, password, token)
      const user = useAuthStore.getState().user
      navigate(getRedirectPath(user?.role || 'siswa'))
    } catch (err: any) {
      setError(pesanGagalJaringan(err))
      // Token reCAPTCHA single-use — reset agar percobaan berikutnya dapat token baru.
      try { if (recaptchaWidgetId != null) recaptchaApi()?.reset?.(recaptchaWidgetId) } catch { /* abaikan */ }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sk-root flex min-h-screen flex-col">
      {/* Navbar publik */}
      <nav className="sk-nav">
        <div className="sk-nav-inner">
          <Link to="/" className="sk-nav-brand">
            <img src={logo} alt={`Logo ${namaLembaga}`} />
            <span>{namaLembaga}</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleDark}
              className="rounded-full p-2 text-slate-400 transition hover:bg-black/5"
              aria-label={dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              title={dark ? 'Mode Terang' : 'Mode Gelap'}
            >
              {dark ? <Sun size={17} className="text-amber-500" /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
          {/* Kolom intro + layanan */}
          <section className="hidden min-w-0 lg:block">
            <div className="sk-badge">Selamat Datang</div>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sk-txt">
              Selamat Datang di{' '}
              <span className="block sk-txt-accent">{namaLembaga}</span>
            </h1>
            <h2 className="mt-2 text-base font-semibold sk-txt-muted">Sistem Informasi Madrasah &amp; Sekolah</h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed sk-txt-muted">
              Satu platform terpadu untuk seluruh administrasi lembaga — data siswa,
              absensi, jurnal mengajar, penilaian, rapor, keuangan, sampai notifikasi
              WhatsApp ke wali murid.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-4">
              {layanan.map(s => (
                <Link key={s.judul} to={s.href} className="sk-service">
                  <div className="sk-service-icon"><s.icon size={22} /></div>
                  <h3>{s.judul}</h3>
                  <p>{s.sub}</p>
                  <span className="sk-service-arrow">→</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Kolom kartu login */}
          <section className="min-w-0 w-full">
            <div className="sk-card mx-auto w-full max-w-full sm:max-w-[500px] px-6 py-6 sm:px-8">
              {/* Identitas lembaga (mark + judul) */}
              <div className="mb-5 text-center">
                <div className="mx-auto mb-4 flex h-[75px] w-[75px] items-center justify-center overflow-hidden rounded-full border sk-border-soft bg-white shadow-[0_8px_22px_rgba(52,45,40,0.08)]">
                  <img src={logo} alt="Logo" className="h-[68px] w-[68px] object-contain" />
                </div>
                <h2 className="text-[23px] font-extrabold tracking-tight sk-txt-heading">Masuk ke Akun Anda</h2>
                <p className="mx-auto mt-1.5 max-w-[365px] text-[13px] leading-snug sk-txt-muted">
                  Silakan masuk menggunakan akun lembaga Anda untuk melanjutkan.
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-600">
                  {error}
                </div>
              )}

              {lambat && !error && (
                <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
                  Koneksi lambat — masih diproses. Jangan tutup halaman ini.
                </div>
              )}

              {/* Pilihan cara masuk: sandi atau OTP (wali murid). */}
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl sk-bg-subtle p-1">
                {([['sandi', 'Username / NIS'], ['otp', 'Nomor WA (OTP)']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setMode(id); setError(''); setInfo(''); setOtpTerkirim(false); setKode('') }}
                    className={`rounded-lg py-2 text-xs font-semibold transition ${
                      mode === id ? 'bg-white sk-txt-accent shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {info && (
                <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-700">
                  {info}
                </div>
              )}

              {mode === 'otp' ? (
                <form onSubmit={handleVerifikasiOtp} className="space-y-3.5">
                  <div className="sk-field">
                    <label htmlFor="otp-phone">Nomor WhatsApp</label>
                    <div className="sk-input-wrap">
                      <input
                        id="otp-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Nomor WhatsApp"
                      />
                    </div>
                  </div>

                  {otpTerkirim && (
                    <div className="sk-field">
                      <label htmlFor="otp-code">Kode 6 Digit</label>
                      <div className="sk-input-wrap">
                        <input
                          id="otp-code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={kode}
                          onChange={(e) => setKode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          style={{ textAlign: 'center', fontWeight: 700, letterSpacing: '0.5em' }}
                        />
                      </div>
                    </div>
                  )}

                  {otpTerkirim ? (
                    <button type="submit" disabled={loading || kode.length !== 6} className="sk-btn w-full">
                      {loading ? 'Memeriksa...' : 'Masuk'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => void handleMintaOtp()} disabled={loading || email.trim().length < 9} className="sk-btn w-full">
                      {loading ? 'Mengirim...' : 'Kirim Kode ke WhatsApp'}
                    </button>
                  )}

                  {otpTerkirim && (
                    <button type="button" onClick={() => void handleMintaOtp()} disabled={loading} className="w-full text-center text-[11px] font-semibold sk-txt-accent hover:underline disabled:opacity-50">
                      Kirim ulang kode
                    </button>
                  )}
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-3.5">
                  <div className="sk-field">
                    <label htmlFor="login-identifier">Username</label>
                    <div className="sk-input-wrap">
                      <input
                        id="login-identifier"
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Username"
                      />
                    </div>
                  </div>

                  <div className="sk-field">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label htmlFor="login-password">Password</label>
                      <Link to="/forgot-password" className="text-[11px] font-semibold sk-txt-accent hover:underline">Lupa Password?</Link>
                    </div>
                    <div className="sk-input-wrap">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        className="sk-input-toggle"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* reCAPTCHA v2 — verifikasi anti-bot sebelum login (hanya domain platform). */}
                  {recaptchaAktif && (
                    <div>
                      <div ref={recaptchaRef}></div>
                      {recaptchaGagal && (
                        <p className="text-[11px] font-medium text-rose-600">Verifikasi keamanan gagal dimuat. Muat ulang halaman lalu coba lagi.</p>
                      )}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="sk-btn w-full">
                    {loading ? 'Memproses...' : (<>Masuk Sekarang <ArrowRight size={16} /></>)}
                  </button>
                </form>
              )}

              {/* Banner PPDB: pendaftaran mandiri calon siswa tanpa akun. */}
              {ppdb.dibuka && (
                <div className="mt-4 rounded-xl border sk-border-accent sk-bg-soft p-3">
                  <div className="flex items-start gap-2.5">
                    <ClipboardList size={18} className="mt-0.5 shrink-0 sk-txt-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold sk-txt-heading">Pendaftaran siswa baru dibuka</p>
                      <p className="mt-0.5 text-[11px] leading-snug sk-txt-muted">
                        {ppdb.nama ? `${ppdb.nama} — ` : ''}Calon siswa/wali bisa mendaftar tanpa akun.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link to="/ppdb" className="sk-btn inline-flex min-h-0 !px-4 !py-2 text-[11px]">Daftar Sekarang</Link>
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/ppdb`
                            navigator.clipboard?.writeText(url)
                              .then(() => toast.success('Tautan PPDB disalin'))
                              .catch(() => toast(`Tautan: ${url}`))
                          }}
                          className="sk-btn sk-btn--ghost inline-flex min-h-0 !px-4 !py-2 text-[11px]"
                        >
                          Salin Tautan
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Akun demo (hanya host yang diizinkan server). */}
              {demoHostAktif && (
                <div id="demo" ref={demoRef} tabIndex={-1} className="mt-5 scroll-mt-4 rounded-xl border sk-border-soft sk-bg-subtle p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sk-orange)]">
                  <p className="mb-2 text-[11px] font-semibold sk-txt-muted">Akun demo</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['admin', 'kepala', 'guru', 'bendahara', 'siswa', 'wali_murid', 'proktor'].map(role => (
                      <button
                        key={role}
                        type="button"
                        disabled={loading}
                        onClick={() => handleDemo(role)}
                        className="rounded-lg border sk-border-soft sk-card px-2 py-1.5 text-[11px] font-semibold capitalize sk-txt-muted transition hover:sk-bg-subtle disabled:opacity-50"
                      >
                        {role === 'wali_murid' ? 'wali murid' : role.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-5 text-center text-xs sk-txt-muted">
                Belum punya akun?{' '}
                <Link to="/register" className="font-semibold sk-txt-accent hover:underline">Daftar gratis</Link>
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="sk-footer">
        <div className="sk-footer-inner">
          <span>Sistem aman &amp; terintegrasi</span>
          <div className="sk-footer-links">
            <Link to="/forgot-password">Bantuan</Link>
            <Link to="/panduan">Panduan</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
