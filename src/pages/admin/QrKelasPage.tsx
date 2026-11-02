import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Printer, RefreshCw, QrCode, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

type Kelas = { id: string; nama: string; tingkat: string; payload: string }

export default function QrKelasPage() {
  const [tanggal, setTanggal] = useState('')
  const [data, setData] = useState<{ tanggal: string; berlaku_sampai: string; kelas: Kelas[] } | null>(null)
  const [memuat, setMemuat] = useState(false)

  const muat = async (tgl = tanggal) => {
    setMemuat(true)
    try {
      const r = await api.get('/admin/qr-kelas', { params: tgl ? { tanggal: tgl } : {} })
      setData(r.data)
      setTanggal(r.data.tanggal)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat QR kelas')
    } finally { setMemuat(false) }
  }

  useEffect(() => { void muat() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <style>{`
        @media print {
          .tanpa-cetak { display: none !important; }
          .kartu-qr { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; border: 1px solid #ddd !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="tanpa-cetak flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">QR Ruang Kelas</h1>
          <p className="text-sm text-gray-500">
            Cetak dan tempel di pintu tiap ruang. Guru memindai QR ini untuk mencatat masuk kelas — bukti ruangan,
            tidak bergantung sinyal GPS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
          <button onClick={() => void muat()} disabled={memuat} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-gray-50">
            <RefreshCw size={15} className={memuat ? 'animate-spin' : ''} /> Muat
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
            <Printer size={15} /> Cetak
          </button>
        </div>
      </div>

      <div className="tanpa-cetak flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>
          QR berlaku untuk <strong>{data?.tanggal || '—'}</strong> saja (sampai {data?.berlaku_sampai || '23:59'}).
          Cetak ulang setiap hari, atau cetak versi laporan bila sekolah ingin satu lembar per pekan.
          QR lama otomatis ditolak besok.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(data?.kelas || []).map(k => (
          <div key={k.id} className="kartu-qr rounded-xl border border-gray-200 bg-white p-3 text-center">
            <div className="mb-1 flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <QrCode size={12} /> Ruang
            </div>
            <p className="truncate text-sm font-bold text-gray-900">{k.nama}</p>
            <p className="mb-2 text-[11px] text-gray-400">Tingkat {k.tingkat || '—'}</p>
            <div className="mx-auto w-fit rounded-lg border bg-white p-2">
              <QRCodeSVG value={k.payload} size={140} level="M" />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-gray-400">Pindai lewat menu Masuk Kelas di aplikasi guru</p>
          </div>
        ))}
        {data && data.kelas.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed py-10 text-center text-sm text-gray-400">
            Belum ada rombel. Tambahkan rombel lebih dulu.
          </p>
        )}
      </div>
    </div>
  )
}
