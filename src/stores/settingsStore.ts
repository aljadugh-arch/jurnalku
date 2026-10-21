import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
  settings: {},
  loadSettings: async () => {
    try {
      // Batas waktu pendek: pengaturan hanya memengaruhi tampilan (nama, logo,
      // warna). Di koneksi lemah lebih baik memakai nilai tersimpan di cache
      // daripada menahan halaman.
      const res = await api.get('/settings', { headers: { 'Cache-Control': 'no-cache' }, timeout: 12000 })
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
    }),
    { name: 'jurnalku_settings', partialize: (state: SettingsState) => ({ settings: state.settings }) }
  )
)
