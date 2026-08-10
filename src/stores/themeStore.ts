import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  dark: boolean
  toggle: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      toggle: () => set(s => {
        const next = !s.dark
        document.documentElement.classList.toggle('dark', next)
        return { dark: next }
      }),
    }),
    { name: 'jurnalku_theme' }
  )
)

// Apply on first load
export function applyTheme() {
  const raw = localStorage.getItem('jurnalku_theme')
  try {
    const dark = JSON.parse(raw || '{}')?.state?.dark
    document.documentElement.classList.toggle('dark', !!dark)
  } catch {}
}
