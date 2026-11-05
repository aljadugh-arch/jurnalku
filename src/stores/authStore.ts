import { create } from 'zustand'
import type { User } from '../types'
import api, { bisaDiulang } from '../services/api'
import { useSettingsStore } from './settingsStore'
import { clearLocalTheme } from './themeStore'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  /** false selama token yang tersimpan belum divalidasi ke /auth/me. */
  authReady: boolean
  authError: string | null
  /** Jumlah percobaan /auth/me yang gagal berturut-turut (untuk backoff). */
  percobaanAuth: number
  login: (user: User, token: string) => void
  loginWithCredentials: (email: string, password: string, captchaToken?: string, captchaJawaban?: string) => Promise<any>
  verifikasiDuaFaktor: (challengeToken: string, code: string) => Promise<void>
  masukDenganTotp: (identifier: string, code: string) => Promise<void>
  mintaTautanMasuk: (email: string) => Promise<{ ok: boolean; pesan: string }>
  pakaiTautanMasuk: (token: string) => Promise<any>
  mintaOtp: (phone: string) => Promise<{ ok: boolean; pesan: string }>
  loginDenganOtp: (phone: string, code: string) => Promise<void>
  masukLembaga: (tenantId: string) => Promise<void>
  kembaliKePlatform: () => Promise<void>
  loginDemo: (role: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  updateUser: (partial: Partial<User>) => void
}

export const canAccessTeacherDashboard = (user: User | null) =>
  !!user && (user.role === 'guru' || user.role === 'wali_kelas' || (user.role === 'kepala' && !!user.can_teach))

// Handoff token lintas-origin: saat registrasi dengan domain sendiri, sesi
// dibawa dari platform (jurnal.cc.cd) ke domain lembaga lewat fragment URL
// (#token=...). Fragment tidak pernah dikirim ke server, jadi token tidak
// bocor ke access log. Dikonsumsi SEKALI saat modul dimuat (sebelum state awal
// dibaca) supaya refresh langsung dianggap sudah login, lalu fragment dibersihkan.
;(function konsumsiTokenHandoff() {
  if (typeof window === 'undefined') return
  const m = window.location.hash.match(/[#&]token=([^&]+)/)
  if (!m) return
  try {
    const token = decodeURIComponent(m[1])
    if (!token) return
    localStorage.setItem('jurnalku_token', token)
    sessionStorage.removeItem('jurnalku_token')
    const bersih = window.location.href.replace(/[#&]token=[^&]*/, '').replace(/#$/, '')
    window.history.replaceState(null, '', bersih)
  } catch { /* token tak valid — abaikan */ }
})()

const storedToken = () => localStorage.getItem('jurnalku_token')

// Profil terakhir disimpan supaya aplikasi bisa langsung dirender saat dibuka
// di perangkat/koneksi lambat. Tanpa ini layar tertahan di "Memuat sesi..."
// sampai /auth/me menjawab — dan kalau jaringan buruk, bisa lama sekali.
const USER_CACHE = 'jurnalku_user'
function bacaCacheUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE)
    if (!raw) return null
    const u = JSON.parse(raw)
    return u && u.id && u.role ? (u as User) : null
  } catch { return null }
}
function simpanCacheUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_CACHE, JSON.stringify(user))
    else localStorage.removeItem(USER_CACHE)
  } catch { /* penyimpanan penuh/diblokir — abaikan, cache hanya mempercepat */ }
}

const AUTH_RETRY_MS = 3000
const AUTH_RETRY_MAKS = 30000
let timerAuth: number | null = null
function jadwalkanCekUlang(percobaan: number) {
  if (typeof window === 'undefined') return
  if (timerAuth) window.clearTimeout(timerAuth)
  // Backoff 3s -> 6s -> 12s -> 24s -> 30s, supaya perangkat lemah tidak
  // menghantam server terus-menerus saat jaringan sedang bermasalah.
  const jeda = Math.min(AUTH_RETRY_MAKS, AUTH_RETRY_MS * Math.pow(2, Math.max(0, percobaan - 1)))
  timerAuth = window.setTimeout(() => { timerAuth = null; void useAuthStore.getState().checkAuth() }, jeda)
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Bila ada token + profil tersimpan, langsung siap render; validasi tetap
  // berjalan di belakang layar dan akan memperbaiki/mengeluarkan sesi bila perlu.
  user: storedToken() ? bacaCacheUser() : null,
  token: storedToken(),
  isAuthenticated: !!storedToken(),
  authReady: !storedToken() || !!bacaCacheUser(),
  authError: null,
  percobaanAuth: 0,
  login: (user, token) => {
    localStorage.setItem('jurnalku_token', token)
    sessionStorage.removeItem('jurnalku_token')
    simpanCacheUser(user)
    set({ user, token, isAuthenticated: true, authReady: true, percobaanAuth: 0, authError: null })
  },
  loginWithCredentials: async (email, password, captchaToken, captchaJawaban) => {
    // Login memakai batas waktu jauh lebih pendek dari 90 detik. Di koneksi
    // lemah, menunggu 90 detik terasa seperti aplikasi rusak. 20 detik cukup:
    // bila server tidak menjawab dalam waktu itu, pengguna diberi tahu dan
    // bisa mencoba lagi.
    //
    // Satu kali coba ulang otomatis HANYA untuk kegagalan jaringan/timeout.
    // Percobaan ulang tidak boleh terjadi saat server menolak (401 sandi
    // salah) — itu menambah hitungan rate-limit tanpa mengubah hasil.
    const payload = { email, password, captchaToken, captchaJawaban }
    let res
    try {
      res = await api.post('/auth/login', payload, { timeout: 20000 })
    } catch (err: any) {
      // Jangan mengulang saat perangkat jelas-jelas offline: percobaan kedua
      // hanya menambah 20 detik menunggu tanpa kemungkinan berhasil.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline || !bisaDiulang(err)) throw err
      await new Promise(r => setTimeout(r, 1200))
      res = await api.post('/auth/login', payload, { timeout: 20000 })
    }
    // 2FA aktif: server belum menerbitkan sesi, hanya tantangan. Jangan simpan
    // token apa pun — pengguna harus menyelesaikan langkah kedua.
    if (res.data?.mfa_required) return res.data
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    simpanCacheUser(res.data.user)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true, percobaanAuth: 0, authError: null })
    // loadSettings TIDAK ditunggu. Sebelumnya `await` di sini menahan navigasi
    // setelah login: token sudah sah, tetapi pengguna masih melihat spinner
    // karena menunggu /api/settings selesai di koneksi lemah. Diambil di
    // belakang layar dengan batas waktu pendek; bila gagal, tampilan memakai
    // nilai bawaan dan tidak menghalangi masuk.
    void useSettingsStore.getState().loadSettings().catch(() => {})
    return res.data
  },
  // Langkah kedua: kode authenticator atau kode pemulihan.
  verifikasiDuaFaktor: async (challengeToken, code) => {
    const res = await api.post('/auth/2fa/verify', { challenge_token: challengeToken, code }, { timeout: 20000 })
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    simpanCacheUser(res.data.user)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true, percobaanAuth: 0, authError: null })
    void useSettingsStore.getState().loadSettings().catch(() => {})
  },
  // Tanpa sandi: username/email/NIS + kode authenticator.
  masukDenganTotp: async (identifier, code) => {
    const res = await api.post('/auth/totp-login', { identifier, code }, { timeout: 20000 })
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    simpanCacheUser(res.data.user)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true, percobaanAuth: 0, authError: null })
    void useSettingsStore.getState().loadSettings().catch(() => {})
  },
  mintaTautanMasuk: async (email) => {
    const res = await api.post('/auth/magic/request', { email }, { timeout: 20000 })
    return { ok: Boolean(res.data?.ok), pesan: String(res.data?.pesan || 'Tautan dikirim.') }
  },
  pakaiTautanMasuk: async (token) => {
    const res = await api.post('/auth/magic/consume', { token }, { timeout: 20000 })
    if (res.data?.mfa_required) return res.data
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    simpanCacheUser(res.data.user)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true, percobaanAuth: 0, authError: null })
    void useSettingsStore.getState().loadSettings().catch(() => {})
  },
  // Wali murid: kode 6 digit dikirim ke WhatsApp nomor yang terdaftar.
  // Sandi tidak dipakai di jalur ini, sehingga tidak ada angka yang bisa
  // ditebak dari nomor telepon.
  mintaOtp: async (phone) => {
    const res = await api.post('/auth/otp/request', { phone }, { timeout: 20000 })
    return { ok: Boolean(res.data?.ok), pesan: String(res.data?.pesan || 'Kode dikirim.') }
  },
  loginDenganOtp: async (phone, code) => {
    const res = await api.post('/auth/otp/verify', { phone, code }, { timeout: 20000 })
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    simpanCacheUser(res.data.user)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true, percobaanAuth: 0, authError: null })
    void useSettingsStore.getState().loadSettings().catch(() => {})
  },
  // Superadmin: pindah konteks ke satu lembaga tanpa logout. Token baru tetap
  // membawa role super_admin — hanya tenant_id yang berubah.
  masukLembaga: async (tenantId) => {
    const res = await api.post('/superadmin/masuk-lembaga', { tenant_id: tenantId })
    localStorage.setItem('jurnalku_token', res.data.token)
    set({ token: res.data.token })
    // Muat ulang pengaturan karena pengaturan kini milik lembaga tersebut.
    await useSettingsStore.getState().loadSettings().catch(() => {})
  },
  kembaliKePlatform: async () => {
    const res = await api.post('/superadmin/kembali-platform')
    localStorage.setItem('jurnalku_token', res.data.token)
    set({ token: res.data.token })
    await useSettingsStore.getState().loadSettings().catch(() => {})
  },
  loginDemo: async (role) => {
    const res = await api.post('/auth/demo', { role }, { timeout: 20000 })
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    simpanCacheUser(res.data.user)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true, percobaanAuth: 0, authError: null })
    // Sama seperti login biasa: pengaturan dimuat di belakang layar supaya
    // panel demo tidak tertahan di koneksi lambat.
    void useSettingsStore.getState().loadSettings().catch(() => {})
  },
  logout: () => {
    localStorage.removeItem('jurnalku_token')
    sessionStorage.removeItem('jurnalku_token')
    // Bersihkan preferensi bertenant agar tenant/pengguna sebelumnya tidak
    // meninggalkan tema atau pengaturannya pada sesi berikutnya.
    clearLocalTheme()
    localStorage.removeItem('jurnalku_settings')
    localStorage.removeItem(USER_CACHE)
    if (timerAuth) { window.clearTimeout(timerAuth); timerAuth = null }
    useSettingsStore.setState({ settings: {} })
    set({ user: null, token: null, isAuthenticated: false, authReady: true, percobaanAuth: 0, authError: null })
  },
  checkAuth: async () => {
    const token = storedToken()
    if (!token) {
      simpanCacheUser(null)
      set({ user: null, token: null, isAuthenticated: false, authReady: true, authError: null, percobaanAuth: 0 })
      return
    }
    try {
      // Batas waktu pendek: pemeriksaan sesi menentukan apakah halaman bisa
      // dirender. Dengan timeout bawaan (90 detik) di koneksi lemah pengguna
      // melihat "Memuat sesi..." sangat lama, padahal ia cukup diarahkan ke
      // halaman login yang bisa langsung dipakai.
      const res = await api.get('/auth/me', { timeout: 8000 })
      if (timerAuth) { window.clearTimeout(timerAuth); timerAuth = null }
      simpanCacheUser(res.data)
      set({ user: res.data, token, isAuthenticated: true, authReady: true, authError: null, percobaanAuth: 0 })
    } catch (error: any) {
      const status = error?.response?.status
      // Hanya 401 yang membuktikan token tidak lagi valid.
      if (status === 401) {
        localStorage.removeItem('jurnalku_token')
        sessionStorage.removeItem('jurnalku_token')
        simpanCacheUser(null)
        if (timerAuth) { window.clearTimeout(timerAuth); timerAuth = null }
        set({ user: null, token: null, isAuthenticated: false, authReady: true, authError: null, percobaanAuth: 0 })
        return
      }

      const percobaan = get().percobaanAuth + 1
      // 403 dan 5xx/putus koneksi bersifat sementara. Jangan tahan layar:
      // render dengan profil terakhir yang tersimpan, lalu perbaiki di latar.
      const tersimpan = get().user || bacaCacheUser()
      if (tersimpan) {
        set({
          user: tersimpan, token, isAuthenticated: true, authReady: true, percobaanAuth: percobaan,
          authError: status === 403
            ? 'Sesi belum dapat diverifikasi — menampilkan data terakhir.'
            : 'Koneksi terganggu — menampilkan data terakhir.',
        })
        // Berhenti mencoba setelah 6 kali; tombol "Coba lagi"/peristiwa online
        // akan memulai lagi tanpa membebani server.
        if (percobaan < 6) jadwalkanCekUlang(percobaan)
        return
      }

      // Tidak ada identitas tersimpan sama sekali. Satu percobaan cepat masih
      // wajar; setelah itu lepaskan layar dan arahkan pengguna ke login.
      if (percobaan >= 2) {
        set({
          user: null, token, isAuthenticated: false, authReady: true, percobaanAuth: percobaan,
          authError: 'Koneksi ke server terganggu. Periksa jaringan lalu masuk kembali.',
        })
        return
      }
      set({ authReady: false, token, isAuthenticated: true, percobaanAuth: percobaan, authError: 'Menghubungkan…' })
      jadwalkanCekUlang(percobaan)
    }
  },
  updateUser: (partial) => set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),
}))

// Perangkat kembali online: jangan menunggu backoff berikutnya.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const st = useAuthStore.getState()
    if (st.token && (!st.user || st.authError)) { useAuthStore.setState({ percobaanAuth: 0 }); void st.checkAuth() }
  })
}
