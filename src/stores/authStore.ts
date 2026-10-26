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
  login: (user: User, token: string) => void
  loginWithCredentials: (email: string, password: string, turnstileToken?: string) => Promise<void>
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
const AUTH_RETRY_MS = 3000

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: storedToken(),
  isAuthenticated: !!storedToken(),
  // Tanpa token tidak ada yang perlu dihidrasi, jadi langsung siap.
  authReady: !storedToken(),
  authError: null,
  login: (user, token) => {
    localStorage.setItem('jurnalku_token', token)
    sessionStorage.removeItem('jurnalku_token')
    set({ user, token, isAuthenticated: true, authReady: true })
  },
  loginWithCredentials: async (email, password, turnstileToken) => {
    // Login memakai batas waktu jauh lebih pendek dari 90 detik. Di koneksi
    // lemah, menunggu 90 detik terasa seperti aplikasi rusak. 20 detik cukup:
    // bila server tidak menjawab dalam waktu itu, pengguna diberi tahu dan
    // bisa mencoba lagi.
    //
    // Satu kali coba ulang otomatis HANYA untuk kegagalan jaringan/timeout.
    // Percobaan ulang tidak boleh terjadi saat server menolak (401 sandi
    // salah) — itu menambah hitungan rate-limit tanpa mengubah hasil.
    const payload = { email, password, turnstileToken }
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
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true })
    // loadSettings TIDAK ditunggu. Sebelumnya `await` di sini menahan navigasi
    // setelah login: token sudah sah, tetapi pengguna masih melihat spinner
    // karena menunggu /api/settings selesai di koneksi lemah. Diambil di
    // belakang layar dengan batas waktu pendek; bila gagal, tampilan memakai
    // nilai bawaan dan tidak menghalangi masuk.
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
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true })
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
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true })
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
    useSettingsStore.setState({ settings: {} })
    set({ user: null, token: null, isAuthenticated: false, authReady: true })
  },
  checkAuth: async () => {
    const token = storedToken()
    if (!token) {
      set({ user: null, token: null, isAuthenticated: false, authReady: true, authError: null })
      return
    }
    try {
      // Batas waktu pendek: pemeriksaan sesi menentukan apakah halaman bisa
      // dirender. Dengan timeout bawaan (90 detik) di koneksi lemah pengguna
      // melihat "Memuat sesi..." sangat lama, padahal ia cukup diarahkan ke
      // halaman login yang bisa langsung dipakai.
      const res = await api.get('/auth/me', { timeout: 12000 })
      set({ user: res.data, token, isAuthenticated: true, authReady: true, authError: null })
    } catch (error: any) {
      const status = error?.response?.status
      // Hanya 401 yang membuktikan token tidak lagi valid. 403 dapat berasal
      // dari izin/tenant, sedangkan 5xx dan error jaringan bersifat sementara.
      if (status === 401) {
        localStorage.removeItem('jurnalku_token')
        sessionStorage.removeItem('jurnalku_token')
        set({ user: null, token: null, isAuthenticated: false, authReady: true, authError: null })
        return
      }
      // Jangan render protected route sebelum identitas tersedia. Simpan token
      // dan lakukan retry supaya refresh pulih tanpa logout paksa.
      set({ authReady: false, token, isAuthenticated: true, authError: status === 403 ? 'Sesi belum dapat diverifikasi' : 'Koneksi ke server terganggu' })
      window.setTimeout(() => void get().checkAuth(), AUTH_RETRY_MS)
    }
  },
  updateUser: (partial) => set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),
}))
