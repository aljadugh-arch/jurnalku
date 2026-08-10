import { create } from 'zustand'
import api from '../services/api'
import { applyTheme } from '../lib/applyTheme'

interface Settings {
  nama_lembaga?: string
  logo?: string
  theme?: string
  primary_color?: string
  accent_color?: string
  sidebar_color?: string
  [key: string]: unknown
}

interface SettingsState {
  settings: Settings
  loadSettings: () => Promise<void>
  setSettings: (s: Partial<Settings>) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loadSettings: async () => {
    try {
      const res = await api.get('/settings')
      set({ settings: res.data || {} })
      applyTheme(res.data || {})
    } catch {
      // ignore; keep defaults
    }
  },
  setSettings: (s) => {
    const settings = { ...get().settings, ...s }
    set({ settings })
    applyTheme(settings)
  },
}))
