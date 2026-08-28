import { useEffect, useMemo, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Navigator {
    standalone?: boolean
  }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

export default function PwaInstallPrompt() {
  const enabled = useSettingsStore(s => s.settings.pwa_enabled === true || s.settings.pwa_enabled === 1)
  const appName = String(useSettingsStore(s => s.settings.pwa_name || s.settings.nama_lembaga || 'JURNALKU'))
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => typeof window !== 'undefined' && isStandalone())
  const [dismissed, setDismissed] = useState(false)

  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(navigator.userAgent), [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setDismissed(false)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!enabled || installed || dismissed || (!deferredPrompt && !isIos)) return null

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    else setDismissed(true)
    setDeferredPrompt(null)
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md rounded-2xl border border-primary/20 bg-white p-4 shadow-2xl lg:bottom-5 dark:bg-gray-900">
      <button type="button" onClick={() => setDismissed(true)} aria-label="Tutup petunjuk instalasi" className="absolute right-2 top-2 rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
        <X size={16} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          {isIos && !deferredPrompt ? <Share2 size={22} /> : <Download size={22} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white">Install {appName}</p>
          {isIos && !deferredPrompt ? (
            <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">Di Safari, tekan Bagikan lalu pilih <strong>Tambah ke Layar Utama</strong>.</p>
          ) : (
            <>
              <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">Pasang shortcut aplikasi agar dapat dibuka dari layar utama.</p>
              <button type="button" onClick={install} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                <Download size={16} /> Install aplikasi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
