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
  loginDemo: (role: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  updateUser: (partial: Partial<User>) => void
}

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
