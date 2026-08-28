import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyTheme } from './stores/themeStore'

// Apply dark mode from persisted store before first render
applyTheme()

// Enable PWA discovery and its service worker only for tenants that opted in.
async function configurePwa() {
  const linkEl = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
  if (!linkEl) return

  linkEl.href = '/api/pwa/manifest'
  try {
    const response = await fetch('/api/pwa/manifest')
    if (!response.ok) {
      linkEl.removeAttribute('href')
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(registration => registration.unregister()))
      }
      return
    }

    const data = await response.json()
    const tc = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (tc && data.theme_color) tc.content = data.theme_color
    if (data.name) document.title = data.name
    const baseIconUrl = data.icons?.[0]?.src || '/logo-jurnalku-256.png'
    const iconUrl = data.version && !baseIconUrl.includes('v=')
      ? `${baseIconUrl}${baseIconUrl.includes('?') ? '&' : '?'}v=${data.version}`
      : baseIconUrl
    const favicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
    favicons.forEach(el => { el.setAttribute('href', iconUrl) })

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      await registration.update()
    }
  } catch {
    // Keep the application usable when PWA discovery is temporarily unavailable.
  }
}

void configurePwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
