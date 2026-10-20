import { create } from 'zustand'
import type { User } from '../types'
import api from '../services/api'
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
  loginWithCredentials: (email: string, password: string) => Promise<void>
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
  loginWithCredentials: async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true })
    await useSettingsStore.getState().loadSettings()
  },
  // Wali murid: kode 6 digit dikirim ke WhatsApp nomor yang terdaftar.
  // Sandi tidak dipakai di jalur ini, sehingga tidak ada angka yang bisa
  // ditebak dari nomor telepon.
  mintaOtp: async (phone) => {
    const res = await api.post('/auth/otp/request', { phone })
    return { ok: Boolean(res.data?.ok), pesan: String(res.data?.pesan || 'Kode dikirim.') }
  },
  loginDenganOtp: async (phone, code) => {
    const res = await api.post('/auth/otp/verify', { phone, code })
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true })
    await useSettingsStore.getState().loadSettings()
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
    const res = await api.post('/auth/demo', { role })
    localStorage.setItem('jurnalku_token', res.data.token)
    sessionStorage.removeItem('jurnalku_token')
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true, authReady: true })
    await useSettingsStore.getState().loadSettings()
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
      const res = await api.get('/auth/me')
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
