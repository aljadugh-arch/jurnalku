import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  dark: boolean
  toggle: () => void
}

function setDarkClass(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      toggle: () => set(s => {
        const next = !s.dark
        setDarkClass(next)
        return { dark: next }
      }),
    }),
    { name: 'jurnalku_theme' }
  )
)

// Apply on first load — prefer settings store (server theme) then local toggle
export function applyTheme() {
  // 1. server settings theme takes priority
  try {
    const raw = localStorage.getItem('jurnalku_settings')
    const theme = JSON.parse(raw || '{}')?.state?.settings?.theme
    if (theme === 'light' || theme === 'dark') {
      setDarkClass(theme === 'dark')
      return
    }
  } catch {}
  // 2. fallback to local toggle — but only if explicitly set true, default to light
  try {
    const raw = localStorage.getItem('jurnalku_theme')
    const parsed = JSON.parse(raw || 'null')
    const dark = parsed?.state?.dark
    setDarkClass(dark === true)
  } catch {
    setDarkClass(false)
  }
}
