import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null; menyegarkan: boolean }

// Pagar kesalahan render. Tanpa ini, satu error React (mis. urutan hook)
// membuat seluruh pohon unmount: layar diam, tombol tidak merespons, dan
// pengguna tidak tahu apa yang terjadi.
//
// Kasus khusus: "Failed to fetch dynamically imported module". Ini terjadi saat
// aplikasi sudah terbuka tetapi berkas chunk sudah diganti versi baru (deploy),
// atau jaringan terputus sesaat. Solusinya bukan menampilkan error, melainkan
// memuat ulang halaman SEKALI supaya HTML dan chunk kembali sinkron.
const POLA_CHUNK = /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|Failed to fetch/i
const KUNCI_RELOAD = 'jurnalku_chunk_reload'
const JEDA_RELOAD_MS = 20000

function gagalMuatChunk(error: Error | null) {
  return !!error && POLA_CHUNK.test(String(error.message || ''))
}

// Dipakai juga oleh penangan global di main.tsx untuk import dinamis yang
// gagal di luar render (mis. saat menekan tombol ekspor).
export function segarkanSekali(): boolean {
  try {
    const terakhir = Number(sessionStorage.getItem(KUNCI_RELOAD) || 0)
    if (Date.now() - terakhir < JEDA_RELOAD_MS) return false
    sessionStorage.setItem(KUNCI_RELOAD, String(Date.now()))
    window.location.reload()
    return true
  } catch {
    return false
  }
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, menyegarkan: false }

  static getDerivedStateFromError(error: Error): State {
    return { error, menyegarkan: false }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ui] render error:', error?.message, (info?.componentStack || '').slice(0, 400))
    if (gagalMuatChunk(error) && segarkanSekali()) {
      this.setState({ menyegarkan: true })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    if (this.state.menyegarkan) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">Menyegarkan halaman…</p>
        </div>
      )
    }

    const chunk = gagalMuatChunk(this.state.error)
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Halaman gagal ditampilkan</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {chunk
              ? 'Versi aplikasi baru saja diperbarui. Muat ulang untuk melanjutkan — data Anda tetap aman.'
              : 'Data Anda tetap aman. Muat ulang halaman untuk melanjutkan.'}
          </p>
          <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-gray-50 p-2 text-left text-[11px] leading-4 text-gray-400 dark:bg-gray-800">
            {String(this.state.error?.message || '').slice(0, 200)}
          </pre>
          <button
            type="button"
            onClick={() => { if (!segarkanSekali()) window.location.reload() }}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Muat ulang
          </button>
        </div>
      </div>
    )
  }
}
