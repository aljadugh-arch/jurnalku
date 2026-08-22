interface ThemeSettings {
  primary_color?: string
  accent_color?: string
  sidebar_color?: string
  theme?: string
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

export function applyTheme(s: ThemeSettings) {
  if (!s) return
  const dark = s.theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  const root = document.documentElement.style
  if (s.primary_color) {
    root.setProperty('--color-primary', s.primary_color)
    root.setProperty('--color-primary-light', shade(s.primary_color, 20))
    root.setProperty('--color-primary-dark', shade(s.primary_color, -20))
  }
  if (s.accent_color) {
    root.setProperty('--color-secondary', s.accent_color)
    root.setProperty('--color-secondary-light', shade(s.accent_color, 20))
  }
  if (s.sidebar_color) {
    root.setProperty('--color-sidebar', s.sidebar_color)
    root.setProperty('--color-sidebar-hover', shade(s.sidebar_color, 12))
    root.setProperty('--color-sidebar-active', shade(s.sidebar_color, -12))
  }
}
