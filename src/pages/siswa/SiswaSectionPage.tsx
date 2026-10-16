import { useCallback, useEffect, useState } from 'react'
import { BookOpen, ClipboardCheck, Receipt, Wallet, QrCode, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import QrisPayModal, { JALUR_PORTAL, type QrisTarget } from '../../components/QrisPayModal'

export type SiswaSection = 'tugas' | 'tagihan' | 'tabungan'

const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))

export default function SiswaSectionPage({ section }: { section: SiswaSection }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [qris, setQris] = useState<QrisTarget | null>(null)
  const [gatewayAktif, setGatewayAktif] = useState(false)

  const muat = useCallback(() => {
    api.get('/siswa/dashboard').then(response => setData(response.data || {})).catch(() => setData({})).finally(() => setLoading(false))
  }, [])

  useEffect(() => { muat() }, [muat])

  // Tagihan dibayar lewat QRIS gateway lembaga. Kalau gateway belum
  // dikonfigurasi, tombol Bayar tidak ditampilkan sama sekali — supaya siswa
  // tidak menekan tombol yang pasti gagal.
  useEffect(() => {
    if (section !== 'tagihan') return
    api.get('/portal/payment-gateway').then(r => setGatewayAktif(Boolean(r.data?.enabled))).catch(() => setGatewayAktif(false))
  }, [section])

  if (loading) return <div className="py-10 text-center text-sm text-gray-400">Memuat...</div>

  if (section === 'tugas') return <div className="space-y-4"><h1 className="flex items-center gap-2 text-xl font-bold text-gray-800"><ClipboardCheck />Tugas</h1><div className="space-y-3">{(data?.tugas || []).length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm text-gray-400">Belum ada tugas</p>}{(data?.tugas || []).map((item: any) => <article key={item.id} className="rounded-xl border bg-white p-4"><h2 className="font-semibold text-gray-800">{item.judul}</h2><p className="text-xs text-gray-500">{item.mapel_nama || '-'} · Deadline {item.deadline || '-'}</p>{item.deskripsi && <p className="mt-2 text-sm text-gray-600">{item.deskripsi}</p>}</article>)}</div></div>

  if (section === 'tagihan') {
    const rows = data?.tagihan_detail || []
    const siswaId = data?.siswa?.id
    const belum = rows.filter((t: any) => t.status !== 'lunas' && t.status !== 'sudah_bayar')
    return (
      <div className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-800"><Receipt />Tagihan</h1>
          <p className="mt-1 text-sm text-gray-500">
            Belum bayar {rupiah(data?.tagihan?.belum_bayar)} · Lunas {rupiah(data?.tagihan?.lunas)}
          </p>
        </div>
        <div className="space-y-3">
          {rows.length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm text-gray-400">Belum ada tagihan</p>}
          {rows.map((item: any) => {
            const lunas = item.status === 'lunas' || item.status === 'sudah_bayar'
            return (
              <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-800">{item.jenis_nama || 'Tagihan'}</h2>
                  <p className="text-xs text-gray-500">{item.bulan || '-'} {item.tahun || ''}{item.tanggal_bayar ? ` · dibayar ${item.tanggal_bayar}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold">{rupiah(item.nominal)}</p>
                    <p className={lunas ? 'text-xs text-emerald-600' : 'text-xs text-rose-600'}>{lunas ? 'Lunas' : 'Belum bayar'}</p>
                  </div>
                  {!lunas && gatewayAktif && siswaId && (
                    <button
                      onClick={() => setQris({ ref_type: 'tagihan', ref_id: item.id, student_id: siswaId, nominal: Number(item.nominal) || 0, label: item.jenis_nama || 'Tagihan' })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white active:scale-95"
                    >
                      <QrCode size={13} /> Bayar
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
        {!gatewayAktif && belum.length > 0 && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
            Pembayaran online belum diaktifkan lembaga. Hubungi bendahara untuk pembayaran manual.
          </p>
        )}
        {qris && <QrisPayModal target={qris} paths={JALUR_PORTAL} onClose={() => setQris(null)} onPaid={() => { setQris(null); toast.success('Tagihan ditandai lunas'); muat() }} />}
      </div>
    )
  }

  return <div className="space-y-4"><h1 className="flex items-center gap-2 text-xl font-bold text-gray-800"><Wallet />Tabungan</h1><div className="rounded-xl bg-primary p-5 text-white"><p className="text-sm opacity-80">Saldo</p><p className="text-2xl font-bold">{rupiah(data?.tabungan?.saldo)}</p></div><div className="space-y-3">{(data?.tabungan_detail || []).length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm text-gray-400">Belum ada mutasi tabungan</p>}{(data?.tabungan_detail || []).map((item: any, index: number) => <article key={item.id || index} className="flex items-center justify-between rounded-xl border bg-white p-4"><div><p className={item.tipe === 'setor' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>{item.tipe === 'setor' ? 'Setoran' : 'Penarikan'} {rupiah(item.nominal)}</p><p className="text-xs text-gray-500">{item.tanggal} {item.keterangan ? `· ${item.keterangan}` : ''}</p></div><p className="text-sm font-medium">{rupiah(item.saldo_akhir)}</p></article>)}</div></div>
}
