import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/sisfo.css'
import App from './App'
import { applyTheme } from './stores/themeStore'
import { daftarkanServiceWorker } from './lib/pushNotif'

// Apply dark mode from persisted store before first render
applyTheme()

// Service worker SELALU didaftarkan (tidak lagi hanya saat PWA lembaga aktif):
// notifikasi adzan di HP/tablet bergantung padanya — server mengirim Web Push ke
// service worker, bukan ke halaman, karena halaman ditangguhkan saat tab di-latar.
void daftarkanServiceWorker()

// Metadata milik lembaga (tema/judul/ikon) dipakai bila PWA lembaga diaktifkan.
// Manifest tetap tertaut statis di index.html supaya PWABuilder selalu menemukannya.
async function configurePwa() {
  const linkEl = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null

  try {
    const response = await fetch('/api/pwa/manifest')
    if (response.status === 204 || !response.ok) {
      // Lembaga ini tidak mengaktifkan PWA: pertahankan manifest statis
      // (/manifest.json) agar audit PWABuilder tetap menemukan manifest.
      // Hanya ikon/favicon yang di-scope ke lembaga.
      const stamp = Date.now()
      const gelap = document.documentElement.classList.contains('dark')
      const faviconTema = gelap ? 'favicon-dark' : 'favicon-light'
      document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
        .forEach(el => { el.setAttribute('href', `/${faviconTema}.png?v=${stamp}`) })
      const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')
      if (appleIcon) appleIcon.setAttribute('href', `/${faviconTema}.png?v=${stamp}`)
      return
    }

    const data = await response.json()
    if (linkEl) linkEl.href = '/api/pwa/manifest'
    const tc = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (tc && data.theme_color) tc.content = data.theme_color
    if (data.name) document.title = data.name
    const baseIconUrl = data.icons?.find((icon: { sizes?: string }) => icon.sizes === '192x192')?.src || data.icons?.[0]?.src || '/logo-jurnalku-256.png'
    const iconUrl = data.version && !baseIconUrl.includes('v=')
      ? `${baseIconUrl}${baseIconUrl.includes('?') ? '&' : '?'}v=${data.version}`
      : baseIconUrl
    const favicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
    favicons.forEach(el => { el.setAttribute('href', iconUrl) })
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
