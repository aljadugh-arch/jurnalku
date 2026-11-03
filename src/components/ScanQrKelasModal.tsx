import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { X, Camera } from 'lucide-react'

// Pemindai QR ruang kelas. Dipakai guru sebagai jalur cadangan saat GPS tidak
// terbaca / akurasinya buruk: QR membuktikan ruangan secara langsung.
export default function ScanQrKelasModal({ open, onClose, onHasil, onFallback, fallbackLabel }: {
  open: boolean
  onClose: () => void
  onHasil: (payload: string) => Promise<void> | void
  // Jalur cadangan (mis. GPS) bila kamera/QR tidak bisa dipakai.
  onFallback?: () => Promise<void> | void
  fallbackLabel?: string
}) {
  const [galat, setGalat] = useState('')
  const [memproses, setMemproses] = useState(false)
  const instance = useRef<Html5Qrcode | null>(null)
  // html5-qrcode mengetik stop()/clear() sebagai void walau sebenarnya Promise;
  // bungkus agar aman dipanggil tanpa memicu unhandled rejection.
  const diam = (p: any) => { try { if (p && typeof p.catch === 'function') p.catch(() => {}) } catch { /* abaikan */ } }
  const selesai = useRef(false)

  useEffect(() => {
    if (!open) return
    setGalat(''); setMemproses(false); selesai.current = false
    const id = 'qr-kelas-reader'
    const qr = new Html5Qrcode(id)
    instance.current = qr
    ;(async () => {
    try {
    await (qr.start as any)(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (teks: string) => {
        if (selesai.current) return
        selesai.current = true
        setMemproses(true)
        try {
          try { await (qr.stop as any)() } catch { /* abaikan */ }
          await onHasil(teks)
        } catch (e: any) {
          setGalat(e?.response?.data?.error || e?.message || 'QR tidak dapat diproses')
          setMemproses(false)
          selesai.current = false
        }
      },
      () => { /* frame tanpa QR: abaikan */ },
    )
    } catch (e: any) {
      setGalat(e?.message || 'Kamera tidak dapat dibuka. Izinkan akses kamera lalu coba lagi.')
    }
    })()

    return () => {
      const q = instance.current
      instance.current = null
      if (q) { diam(q.stop()); diam((q as any).clear()) }
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-gray-800"><Camera size={16} /> Pindai QR Ruang</p>
          <button onClick={onClose} aria-label="Tutup" className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="p-3">
          <div id="qr-kelas-reader" className="overflow-hidden rounded-xl bg-black" style={{ minHeight: 260 }} />
          {galat && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{galat}</p>}
          {memproses && <p className="mt-2 text-center text-xs font-semibold text-primary">Memproses QR…</p>}
          <p className="mt-2 text-center text-[11px] leading-4 text-gray-400">
            Arahkan kamera ke QR di pintu ruang kelas. Jangan lupa izinkan akses kamera.
          </p>
          {onFallback && (
            <button
              type="button"
              onClick={() => { void onFallback() }}
              className="mt-2 w-full rounded-lg border px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              {fallbackLabel || 'Kamera bermasalah? Masuk dengan lokasi (GPS)'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
