import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import api from '../services/api'

export interface QrisTarget {
  ref_type: 'tagihan' | 'topup' | 'tabungan'
  ref_id?: string
  student_id?: string
  nominal?: number
  label?: string
}

interface Intent {
  id: string
  nominal: number
  kode_unik: string
  pay_amount: number
  qris_url: string
  qris_code?: string
  status: string
  expires_at?: string
  paid_at?: string
}

export interface QrisPaths {
  create: string
  cek: (id: string) => string
  cancel: (id: string) => string
}

const rupiah = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

const JALUR_STAF: QrisPaths = {
  create: '/payment-gateway/intents',
  cek: (id) => `/payment-gateway/intents/${id}/cek`,
  cancel: (id) => `/payment-gateway/intents/${id}/cancel`,
}

export const JALUR_PORTAL: QrisPaths = {
  create: '/portal/payment-intent',
  cek: (id) => `/portal/payment-intent/${id}/cek`,
  cancel: (id) => `/portal/payment-intent/${id}/cancel`,
}

/**
 * Hitung mundur dipisah jadi komponen sendiri supaya detak per detik tidak
 * me-render ulang modal — kalau modal ikut render tiap detik, interval polling
 * status ikut ter-reset dan pembayaran tidak pernah terdeteksi.
 */
function HitungMundur({ sampai }: { sampai?: string }) {
  const [sisa, setSisa] = useState<number | null>(null)
  useEffect(() => {
    if (!sampai) return
    const hitung = () => setSisa(Math.max(0, Math.floor((new Date(sampai).getTime() - Date.now()) / 1000)))
    hitung()
    const t = setInterval(hitung, 1000)
    return () => clearInterval(t)
  }, [sampai])
  if (sisa === null) return <span>Berlaku 24 jam</span>
  const jj = String(Math.floor(sisa / 3600)).padStart(2, '0')
  const mm = String(Math.floor((sisa % 3600) / 60)).padStart(2, '0')
  const dd = String(sisa % 60).padStart(2, '0')
  return <span>Berlaku {jj}:{mm}:{dd}</span>
}

/**
 * Modal bayar QRIS lewat payment gateway lembaga (fazapay).
 *
 * QRIS dibuat DINAMIS per transaksi (nominal + kode unik sudah tertanam di dalam QR), jadi
 * pembayar tidak perlu melaporkan bukti transfer — statusnya terbaca otomatis lewat webhook
 * gateway, dengan tombol "Cek status" sebagai jalur manual.
 */
export default function QrisPayModal({ target, onClose, onPaid, paths }: {
  target: QrisTarget
  onClose: () => void
  onPaid?: (intent: Intent) => void
  /** Jalur API; portal memakai JALUR_PORTAL, staf memakai bawaan. */
  paths?: QrisPaths
}) {
  const jalurRef = useRef<QrisPaths>(paths || JALUR_STAF)
  jalurRef.current = paths || JALUR_STAF

  const [intent, setIntent] = useState<Intent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cek, setCek] = useState(false)
  const [lunas, setLunas] = useState(false)
  const selesaiRef = useRef(false)
  const intentIdRef = useRef<string>('')

  const { ref_type, ref_id, student_id, nominal, label } = target

  const buatIntent = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await api.post(jalurRef.current.create, {
        ref_type, ref_id: ref_id || '', student_id: student_id || '', nominal, label: label || '',
      })
      setIntent(res.data.intent)
      intentIdRef.current = res.data.intent?.id || ''
    } catch (e: any) {
      setError(e.response?.data?.error || 'Gagal membuat QRIS')
    } finally { setLoading(false) }
  }, [ref_type, ref_id, student_id, nominal, label])

  useEffect(() => { buatIntent() }, [buatIntent])

  const cekStatus = useCallback(async (manual = false) => {
    const id = intentIdRef.current
    if (!id || selesaiRef.current) return
    if (manual) setCek(true)
    try {
      const res = await api.post(jalurRef.current.cek(id))
      if (res.data.intent) setIntent(res.data.intent)
      if (res.data.berubah || res.data.intent?.status === 'paid') {
        selesaiRef.current = true
        setLunas(true)
        toast.success('Pembayaran diterima — ' + rupiah(res.data.intent.pay_amount))
        onPaid?.(res.data.intent)
      } else if (manual) {
        toast('Belum ada pembayaran masuk untuk nominal ini', { icon: '⏳' })
      }
    } catch (e: any) {
      if (manual) toast.error(e.response?.data?.error || 'Gagal cek status')
    } finally { if (manual) setCek(false) }
  }, [onPaid])

  // Polling tiap 5 detik selama QR masih pending. Dependensi hanya id & status —
  // BUKAN objek intent — supaya render lain tidak mematikan intervalnya.
  useEffect(() => {
    if (!intent || intent.status !== 'pending' || lunas) return
    const t = setInterval(() => { cekStatus(false) }, 5000)
    return () => clearInterval(t)
  }, [intent?.id, intent?.status, lunas, cekStatus])

  const batal = async () => {
    const id = intentIdRef.current
    if (id && !selesaiRef.current) {
      try { await api.post(jalurRef.current.cancel(id)) } catch { /* biarkan */ }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) batal() }}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><QrCode size={20} /> Bayar QRIS</h2>
          <button onClick={batal} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500"><XCircle size={20} /></button>
        </div>

        {loading && <div className="py-12 text-center text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" />Membuat QRIS…</div>}

        {!loading && error && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            {error}
            <p className="mt-2 text-xs">Bila gateway belum aktif, minta bendahara mengaktifkannya di <strong>Pengaturan → Payment Gateway QRIS</strong>.</p>
            <button onClick={buatIntent} className="mt-3 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs">Coba lagi</button>
          </div>
        )}

        {!loading && intent && !error && (
          <div className="space-y-4">
            <div className="text-sm text-gray-500">
              {label || (ref_type === 'tagihan' ? 'Tagihan' : ref_type === 'tabungan' ? 'Setoran tabungan' : 'Top-up saldo')}
            </div>

            {lunas ? (
              <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center">
                <CheckCircle2 className="mx-auto text-green-600 mb-2" size={40} />
                <p className="font-semibold text-green-800">Pembayaran diterima</p>
                <p className="text-sm text-green-700 mt-1">{rupiah(intent.pay_amount)}</p>
              </div>
            ) : (
              <>
                <div className="bg-white border rounded-xl p-4 text-center">
                  {/* Render QRIS LOKAL dari payload (qris_code) — tidak lagi bergantung
                      layanan gambar pihak ketiga, dan payload tidak keluar dari browser. */}
                  {intent.qris_code
                    ? <QRCodeSVG value={intent.qris_code} size={256} level="M" className="mx-auto h-64 w-64 max-w-full" />
                    : intent.qris_url
                      ? <img src={intent.qris_url} alt="QRIS" className="w-64 h-64 max-w-full object-contain mx-auto" />
                      : <p className="text-sm text-gray-400 py-12">QR tidak tersedia</p>}
                  <p className="text-xs text-gray-400 mt-2">Scan dengan aplikasi apa pun yang mendukung QRIS</p>
                </div>

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  Bayar tepat <strong>{rupiah(intent.pay_amount)}</strong>
                  <span className="block text-xs mt-1">
                    Nominal {rupiah(intent.nominal)} + kode unik {intent.kode_unik}. Angka ini sudah tertanam di QR — jangan diubah.
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1"><Clock size={13} /> <HitungMundur sampai={intent.expires_at} /></span>
                  <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> menunggu pembayaran…</span>
                </div>

                <div className="flex gap-3">
                  <button onClick={batal} className="flex-1 px-4 py-2 border rounded-lg text-sm">Tutup</button>
                  <button onClick={() => cekStatus(true)} disabled={cek} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex justify-center items-center gap-2 disabled:opacity-60">
                    {cek ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Cek status
                  </button>
                </div>
              </>
            )}

            {lunas && <button onClick={onClose} className="w-full px-4 py-2 bg-primary text-white rounded-lg text-sm">Selesai</button>}
          </div>
        )}
      </div>
    </div>
  )
}