import { useCallback, useEffect, useState } from 'react'
import { BookOpen, ClipboardCheck, Receipt, Wallet, QrCode, Loader2, Upload, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import QrisPayModal, { JALUR_PORTAL, type QrisTarget } from '../../components/QrisPayModal'

export type SiswaSection = 'tugas' | 'tagihan' | 'tabungan'

const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))

const fmtWaktu = (s?: string | null) => {
  if (!s) return '-'
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function TugasSection() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [kumpulId, setKumpulId] = useState<string | null>(null)
  const [teks, setTeks] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [mengirim, setMengirim] = useState(false)

  const muat = useCallback(() => {
    api.get('/siswa/tugas').then(r => setData(Array.isArray(r.data) ? r.data : [])).catch(() => setData([])).finally(() => setLoading(false))
  }, [])

  useEffect(() => { muat() }, [muat])

  const kirim = async (id: string) => {
    if (!teks.trim() && !file) return toast.error('Isi jawaban teks atau lampirkan berkas')
    const fd = new FormData()
    if (teks.trim()) fd.append('teks', teks.trim())
    if (file) fd.append('file', file)
    setMengirim(true)
    try {
      const r = await api.post(`/siswa/tugas/${id}/kumpul`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(r.data?.terlambat ? 'Terkumpul (terlambat)' : 'Tugas terkumpul')
      setKumpulId(null); setTeks(''); setFile(null)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mengumpulkan')
    } finally { setMengirim(false) }
  }

  if (loading) return <div className="py-10 text-center text-sm text-gray-400">Memuat...</div>

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-800"><ClipboardCheck />Tugas</h1>
      {data.length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm text-gray-400">Belum ada tugas</p>}
      {data.map((t: any) => {
        const sudah = !!t.pengumpulan_id
        const terlambat = !!t.terlambat
        const dinilai = t.nilai != null
        return (
          <article key={t.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-800">{t.judul}</h2>
                <p className="text-xs text-gray-500">{t.mapel_nama || '-'} · {t.guru_nama || '-'}</p>
              </div>
              {sudah ? (
                dinilai ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={13} /> Nilai {t.nilai}
                  </span>
                ) : terlambat ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                    <AlertTriangle size={13} /> Terlambat
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={13} /> Terkumpul
                  </span>
                )
              ) : (
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">Belum</span>
              )}
            </div>
            {t.deadline && (
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                <Clock size={12} /> Deadline {fmtWaktu(t.deadline)}
              </p>
            )}
            {t.deskripsi && <p className="mt-2 text-sm text-gray-600">{t.deskripsi}</p>}
            {t.file_path && (
              <a href={t.file_path} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Upload size={12} /> Lampiran tugas
              </a>
            )}

            {/* Status pengumpulan / nilai sendiri */}
            {sudah && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                <p>Dikumpulkan {fmtWaktu(t.submitted_at)}{terlambat ? ' · terlambat' : ''}</p>
                {t.pengumpulan_file_nama && <p className="mt-1">Berkas: {t.pengumpulan_file_nama}</p>}
                {dinilai && (
                  <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 p-2">
                    <p className="font-semibold text-emerald-800">Nilai: {t.nilai}{t.bobot ? ` / ${t.bobot}` : ''}</p>
                    {t.catatan_guru && <p className="mt-1 text-emerald-700">{t.catatan_guru}</p>}
                  </div>
                )}
                <button onClick={() => { setKumpulId(t.id); setTeks(t.pengumpulan_teks || '') }}
                  className="mt-2 text-xs font-semibold text-primary hover:underline">
                  Kumpulkan ulang
                </button>
              </div>
            )}

            {/* Form kumpul */}
            {kumpulId === t.id ? (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <textarea value={teks} onChange={e => setTeks(e.target.value)} rows={3}
                  placeholder="Jawaban teks (opsional bila melampirkan berkas)"
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
                    <Upload size={14} />
                    <span className="truncate">{file ? file.name : 'Lampirkan berkas'}</span>
                    <input type="file" className="hidden" accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.mp3,.txt"
                      onChange={e => setFile(e.target.files?.[0] || null)} />
                  </label>
                  <button onClick={() => { setKumpulId(null); setTeks(''); setFile(null) }} className="ml-auto text-xs text-gray-500 hover:underline">Batal</button>
                  <button disabled={mengirim} onClick={() => kirim(t.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {mengirim ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Kumpul
                  </button>
                </div>
              </div>
            ) : (
              !sudah && (
                <button onClick={() => setKumpulId(t.id)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">
                  <Upload size={13} /> Kumpulkan tugas
                </button>
              )
            )}
          </article>
        )
      })}
    </div>
  )
}

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

  if (section === 'tugas') return <TugasSection />

  if (loading) return <div className="py-10 text-center text-sm text-gray-400">Memuat...</div>

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
