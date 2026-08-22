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
    const res = await api.post('/auth/demo', { role })
    localStorage.setItem('jurnalku_token', res.data.token)
    set({ user: res.data.user, token: res.data.token, isAuthenticated: true })
    await useSettingsStore.getState().loadSettings()
  },
  logout: () => {
    localStorage.removeItem('jurnalku_token')
    // Clear tenant-scoped preferences so a previous tenant/user cannot
    // leave the next session stuck in its theme or settings.
    localStorage.removeItem('jurnalku_theme')
    localStorage.removeItem('jurnalku_settings')
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = 'light'
    useSettingsStore.setState({ settings: {} })
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