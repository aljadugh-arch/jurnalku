import { useEffect, useState } from 'react'
import { BookOpen, ExternalLink, Loader2 } from 'lucide-react'
import api from '../../services/api'

type LibraryConfig = {
  name: string
  description: string
  drive_folder_url: string
  enabled: boolean
}

function extractFolderId(url: string): string | null {
  const m = String(url || '').match(/\/folders\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

export default function SiswaPerpustakaanPage() {
  const [config, setConfig] = useState<LibraryConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/library')
      .then(res => setConfig(res.data))
      .catch(err => setError(err?.response?.data?.error || 'Gagal memuat perpustakaan digital'))
      .finally(() => setLoading(false))
  }, [])

  const folderId = config?.drive_folder_url ? extractFolderId(config.drive_folder_url) : null
  const embedUrl = folderId ? `https://drive.google.com/embeddedfolderview?id=${folderId}#grid` : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white font-display">Perpustakaan Digital</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Akses koleksi buku dan referensi digital langsung di sini</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" /> Memuat...
        </div>
      )}

      {!loading && (error || !config) && (
        <div className="mx-auto max-w-2xl rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 mx-auto mb-4">
            <BookOpen size={32} />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Perpustakaan Digital</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Perpustakaan digital sekolah belum diaktifkan oleh lembaga.
          </p>
        </div>
      )}

      {!loading && config && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                  <BookOpen size={20} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-white truncate">{config.name}</p>
                  {config.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{config.description}</p>}
                </div>
              </div>
              {config.drive_folder_url && (
                <a
                  href={config.drive_folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90"
                >
                  <ExternalLink size={13} /> Buka di Tab Baru
                </a>
              )}
            </div>
          </div>

          {embedUrl ? (
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
              <iframe
                src={embedUrl}
                title="Perpustakaan Digital"
                className="w-full"
                style={{ height: '70vh', minHeight: 480, border: 0 }}
                loading="lazy"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm text-center text-sm text-gray-500 dark:text-gray-400">
              Folder Google Drive belum tersedia atau tidak valid. Hubungi admin lembaga.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
