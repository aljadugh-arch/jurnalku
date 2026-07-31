import { create } from 'zustand'
import type { User } from '../types'
import api from '../services/api'
import { useSettingsStore } from './settingsStore'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  loginWithCredentials: (email: string, password: string) => Promise<void>
  loginDemo: (role: string) => Promise<void>
  logout: () => void
  checkAuth: () => void
  updateUser: (partial: Partial<User>) => void
}

const demoAccounts: Record<string, { email: string; password: string }> = {
  admin: { email: 'admin@jurnalku.id', password: 'admin123' },
  kepala: { email: 'kepala@jurnalku.id', password: 'admin123' },
  guru: { email: 'budi@jurnalku.id', password: 'admin123' },
  siswa: { email: 'ahmad@jurnalku.id', password: 'admin123' },
  wali_kelas: { email: 'siti@jurnalku.id', password: 'admin123' },
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('jurnalku_token'),
  isAuthenticated: !!localStorage.getItem('jurnalku_token'),
  login: (user, token) => {
    localStorage.setItem('jurnalku_token', token)
    set({ user, token, isAuthenticated: true })
  },
  loginWithCredentials: async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    localStorage.setItem('jurnalku_token', res.data.token)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true })
    await useSettingsStore.getState().loadSettings()
  },
  loginDemo: async (role) => {
    const creds = demoAccounts[role]
    if (!creds) return
    const res = await api.post('/auth/login', creds)
    localStorage.setItem('jurnalku_token', res.data.token)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true })
    await useSettingsStore.getState().loadSettings()
  },
  logout: () => {
    localStorage.removeItem('jurnalku_token')
    set({ user: null, token: null, isAuthenticated: false })
  },
  checkAuth: async () => {
    const token = localStorage.getItem('jurnalku_token')
    if (!token) return
    try {
      const res = await api.get('/auth/me')
      set({ user: res.data, token, isAuthenticated: true })
    } catch {
      localStorage.removeItem('jurnalku_token')
      set({ user: null, token: null, isAuthenticated: false })
    }
  },
  updateUser: (partial) => set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),
}))
