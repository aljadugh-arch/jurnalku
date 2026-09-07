import { readLocalDark, setResolvedDark } from '../stores/themeStore'

export interface ThemeSettings {
  primary_color?: string
  accent_color?: string
  sidebar_color?: string
  theme?: string
}

function cssVar(name: string): string {
  return (typeof document !== 'undefined' && document.documentElement.style.getPropertyValue(name).trim()) || ''
}

/**
 * Warna hero/gradient untuk dashboard mobile. Mengutamakan primary lembaga
 * (dari settings), lalu sidebar/akcent; di mode gelap memakai varian lebih
 * gelap dari sidebar agar tidak menyilaukan dan tetap ikut dark theme.
 */
export function heroColors(settings?: Partial<ThemeSettings>, dark = false): string {
  const primary = settings?.primary_color || cssVar('--color-primary')
  const sidebar = settings?.sidebar_color || cssVar('--color-sidebar')
  const accent = settings?.accent_color || cssVar('--color-accent')
  const base = primary || 'var(--color-primary, #2563eb)'
  const fallback = sidebar || accent || base
  // dark mode: gelapkan warna tenant agar hero tetap senada tanpa menyilaukan.
  return dark && /^#[0-9a-f]{6}$/i.test(fallback) ? shade(fallback, -38) : (dark ? fallback : base)
}

function shade(hex: string, percent: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const num = parseInt(h, 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  r = Math.min(255, Math.max(0, Math.round(r + (percent / 100) * 255)))
  g = Math.min(255, Math.max(0, Math.round(g + (percent / 100) * 255)))
  b = Math.min(255, Math.max(0, Math.round(b + (percent / 100) * 255)))
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

/**
 * Terapkan warna & tema lembaga. Preferensi terang/gelap yang dipilih
 * pengguna sendiri tetap menang, kecuali `force` (admin baru menyimpan
 * pengaturan lembaga) sehingga tema tidak berbalik saat halaman direfresh.
 */
export function applyTheme(s: ThemeSettings, force = false) {
  if (!s) return
  const local = readLocalDark()
  const dark = force || local === null ? s.theme === 'dark' : local
  setResolvedDark(dark)
  const root = document.documentElement.style
  if (s.primary_color) {
    root.setProperty('--color-primary', s.primary_color)
    root.setProperty('--color-primary-light', shade(s.primary_color, 20))
    root.setProperty('--color-primary-dark', shade(s.primary_color, -20))
  }
  if (s.accent_color) {
    // Accent is its own design token. Keep the secondary aliases for older
    // components, but do not silently map the preset to an unrelated token.
    root.setProperty('--color-accent', s.accent_color)
    root.setProperty('--color-accent-light', shade(s.accent_color, 20))
    root.setProperty('--color-accent-dark', shade(s.accent_color, -20))
    root.setProperty('--color-secondary', s.accent_color)
    root.setProperty('--color-secondary-light', shade(s.accent_color, 20))
    root.setProperty('--color-secondary-dark', shade(s.accent_color, -20))
  }
  if (s.sidebar_color) {
    root.setProperty('--color-sidebar', s.sidebar_color)
    root.setProperty('--color-sidebar-hover', shade(s.sidebar_color, 12))
    root.setProperty('--color-sidebar-active', shade(s.sidebar_color, -12))
  }
}
