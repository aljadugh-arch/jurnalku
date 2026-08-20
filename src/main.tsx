import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyTheme } from './stores/themeStore'

// Apply dark mode from persisted store before first render
applyTheme()

// Update manifest href to dynamic per-tenant manifest
try {
  const linkEl = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
  if (linkEl) {
    // Point to dynamic API manifest for per-tenant PWA name/icon
    fetch('/api/pwa/manifest').then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return
      const blob = new Blob([JSON.stringify(data)], { type: 'application/manifest+json' })
      linkEl.href = URL.createObjectURL(blob)
      // Update theme-color meta
      const tc = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
      if (tc && data.theme_color) tc.content = data.theme_color
      // Update title
      if (data.name) document.title = data.name
    }).catch(() => {})
  }
} catch {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
