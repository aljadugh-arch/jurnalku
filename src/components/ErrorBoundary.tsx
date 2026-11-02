import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

// Pagar kesalahan render. Tanpa ini, satu error React (mis. urutan hook)
// membuat seluruh pohon unmount: layar diam, tombol tidak merespons, dan
// pengguna tidak tahu apa yang terjadi. Dengan pagar ini selalu ada jalan
// keluar: pesan singkat + tombol muat ulang.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Jejak singkat ke konsol; tidak dikirim ke mana pun.
    console.error('[ui] render error:', error?.message, (info?.componentStack || '').slice(0, 400))
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Halaman gagal ditampilkan</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Data Anda tetap aman. Muat ulang halaman untuk melanjutkan.
          </p>
          <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-gray-50 p-2 text-left text-[11px] leading-4 text-gray-400 dark:bg-gray-800">
            {String(this.state.error?.message || '').slice(0, 200)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Muat ulang
          </button>
        </div>
      </div>
    )
  }
}
