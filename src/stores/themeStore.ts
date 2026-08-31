import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'jurnalku_theme'

interface ThemeState {
  dark: boolean
  /** true bila pengguna sendiri yang memilih terang/gelap lewat tombol header. */
  explicit: boolean
  toggle: () => void
  setDark: (dark: boolean) => void
}

export function setDarkClass(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

/** Sinkronkan tema hasil resolusi tanpa membuatnya menjadi pilihan eksplisit. */
export function setResolvedDark(dark: boolean) {
  setDarkClass(dark)
  useThemeStore.setState({ dark })
}

/**
 * Preferensi lokal pengguna: `true`/`false` bila dipilih eksplisit,
 * `null` bila belum pernah memilih sehingga tema lembaga yang dipakai.
 */
export function readLocalDark(): boolean | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    const state = parsed?.state
    if (state?.explicit === true && typeof state.dark === 'boolean') return state.dark
    return null
  } catch { return null }
}

export function clearLocalTheme() {
  localStorage.removeItem(STORAGE_KEY)
  useThemeStore.setState({ dark: false, explicit: false })
  setDarkClass(false)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      explicit: false,
      toggle: () => set(s => {
        const next = !s.dark
        setDarkClass(next)
        return { dark: next, explicit: true }
      }),
      setDark: (dark) => {
        setDarkClass(dark)
        set({ dark, explicit: true })
      },
    }),
    { name: STORAGE_KEY }
  )
)

/**
 * Dipanggil sebelum render pertama. Pilihan eksplisit pengguna menang atas
 * tema lembaga supaya mode gelap/terang tidak kembali sendiri saat refresh.
 */
export function applyTheme() {
  const local = readLocalDark()
  if (local !== null) {
    setResolvedDark(local)
    return
  }
  try {
    const raw = localStorage.getItem('jurnalku_settings')
    const theme = JSON.parse(raw || '{}')?.state?.settings?.theme
    if (theme === 'light' || theme === 'dark') {
      setResolvedDark(theme === 'dark')
      return
    }
  } catch {}
  setResolvedDark(false)
}
