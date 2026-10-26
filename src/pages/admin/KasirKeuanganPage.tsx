import { useEffect, useRef, useState } from 'react'
import { QrCode, Search, CreditCard, PiggyBank, ArrowDownLeft, ArrowUpRight, RefreshCw, X, User } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { Html5Qrcode } from 'html5-qrcode'

type SiswaInfo = {
  id: string
  nama: string
  nis: string
  nisn: string | null
  jenis_kelamin: string
  foto: string | null
  rombel: string | null
}

type TagihanItem = {
  id: string
  jenis_nama: string
  bulan: string
  tahun: string
  nominal: number
}

const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0))

export default function KasirKeuanganPage() {
  const [siswa, setSiswa] = useState<SiswaInfo | null>(null)
  const [saldo, setSaldo] = useState(0)
  const [tagihan, setTagihan] = useState<TagihanItem[]>([])
  const [totalTagihan, setTotalTagihan] = useState(0)
  const [busy, setBusy] = useState(false)
  const [metode, setMetode] = useState('tunai')
  const [nisInput, setNisInput] = useState('')
  const [rfidInput, setRfidInput] = useState('')
  const [nominal, setNominal] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const qrRef = useRef<Html5Qrcode | null>(null)
  const scanBusyRef = useRef(false)
  const rfidInputRef = useRef<HTMLInputElement>(null)
  const [selectedTagihan, setSelectedTagihan] = useState<Set<string>>(new Set())

  useEffect(() => () => { try { qrRef.current?.stop() } catch {} }, [])

  const lookup = async (payload: { token?: string; rfid_uid?: string; nis?: string }) => {
    setBusy(true)
    try {
      const r = await api.post('/keuangan/lookup-siswa', payload)
      setSiswa(r.data.siswa)
      setSaldo(r.data.saldo_tabungan)
      setTagihan(r.data.tagihan_belum || [])
      setTotalTagihan(r.data.total_tagihan_belum || 0)
      setSelectedTagihan(new Set((r.data.tagihan_belum || []).map((t: any) => t.id)))
      setKeterangan('')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Siswa tidak ditemukan')
      setSiswa(null)
    } finally {
      setBusy(false)
    }
  }

  const cariNis = () => {
    const q = nisInput.trim()
    if (!q) return toast.error('Masukkan NIS/NISN')
    lookup({ nis: q })
    setNisInput('')
  }

  const tapRfid = () => {
    const uid = rfidInput.trim()
    if (!uid) return
    lookup({ rfid_uid: uid })
    setRfidInput('')
  }

  const startQr = async () => {
    if (qrRef.current || scanBusyRef.current) return
    scanBusyRef.current = true
    setQrOpen(true)
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('kasir-qr-reader')
        qrRef.current = scanner
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, async text => {
          const normalized = text.trim()
          if (scanBusyRef.current === false || normalized === '') return
          if (normalized) {
            scanBusyRef.current = false
            setScanBusy(true)
            try { await lookup({ token: normalized }) }
            catch (e: any) { toast.error(e?.response?.data?.error || 'QR gagal') }
            finally { await stopQr() }
          }
        }, () => {})
      } catch {
        toast.error('Kamera/QR tidak bisa dibuka')
        setQrOpen(false)
        scanBusyRef.current = false
      }
    }, 100)
  }

  const stopQr = async () => {
    scanBusyRef.current = false
    try { await qrRef.current?.stop() } catch {}
    try { qrRef.current?.clear() } catch {}
    qrRef.current = null
    setScanBusy(false)
    setQrOpen(false)
  }

  const bayarTagihan = async () => {
    if (!siswa) return
    const ids = [...selectedTagihan]
    if (!ids.length) return toast.error('Pilih tagihan yang akan dibayar')
    setBusy(true)
    try {
      for (const id of ids) await api.put(`/tagihan/${id}/bayar`, { metode_bayar: metode, keterangan })
      toast.success(`${ids.length} tagihan ditandai lunas`)
      await lookup({ nis: siswa.nis })
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membayar')
    } finally { setBusy(false) }
  }

  const simpanTabungan = async (tipe: 'setor' | 'tarik') => {
    if (!siswa) return
    const n = Number(nominal)
    if (!Number.isFinite(n) || n <= 0) return toast.error('Nominal harus angka > 0')
    setBusy(true)
    try {
      await api.post('/tabungan', { siswa_id: siswa.id, tipe, nominal: n, keterangan })
      toast.success(tipe === 'setor' ? 'Setoran tabungan tersimpan' : 'Penarikan tabungan tersimpan')
      setNominal('')
      await lookup({ nis: siswa.nis })
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal simpan tabungan')
    } finally { setBusy(false) }
  }

  const toggleTagihan = (id: string) => {
    setSelectedTagihan(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Kasir Cepat Keuangan</h1>
        <p className="text-gray-500 text-sm mt-1">Scan QR / tap RFID / ketik NIS-NISN — data siswa langsung muncul untuk bayar tagihan atau setor tabungan.</p>
      </div>

      {/* Input identitas */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={startQr} disabled={scanBusy} className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-60">
            <QrCode size={18} /> Scan QR Siswa
          </button>
          <div className="relative">
            <input
              ref={rfidInputRef}
              value={rfidInput}
              onChange={e => setRfidInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tapRfid() }}
              placeholder="Tap kartu RFID lalu Enter…"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm pr-10"
              autoFocus
            />
            <CreditCard size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="flex gap-2">
            <input
              value={nisInput}
              onChange={e => setNisInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') cariNis() }}
              placeholder="NIS / NISN"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm"
            />
            <button onClick={cariNis} className="px-4 py-3 bg-gray-800 text-white rounded-lg text-sm font-semibold"><Search size={16} /></button>
          </div>
        </div>
        {qrOpen && (
          <div className="relative">
            <div id="kasir-qr-reader" className="mx-auto max-w-sm" />
            <button onClick={stopQr} className="mt-2 w-full px-4 py-2 bg-gray-800 text-white rounded-lg text-sm">Tutup Kamera</button>
          </div>
        )}
      </div>

      {/* Kartu siswa */}
      {busy && !siswa && <p className="py-8 text-center text-sm text-gray-400">Mencari siswa…</p>}
      {!busy && !siswa && (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center text-sm text-gray-400">
          Belum ada siswa dipilih. Scan QR, tap kartu RFID, atau ketik NIS/NISN untuk memulai.
        </div>
      )}

      {siswa && (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex flex-wrap items-center gap-4">
              <div className="h-16 w-16 shrink-0 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400">
                {siswa.foto ? <img src={siswa.foto} alt={siswa.nama} className="h-full w-full object-cover" /> : <User size={28} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-gray-800 truncate">{siswa.nama}</h2>
                <p className="text-sm text-gray-500">NIS {siswa.nis}{siswa.nisn ? ` · NISN ${siswa.nisn}` : ''} · {siswa.rombel || 'Tanpa rombel'}</p>
              </div>
              <div className="flex gap-2">
                <div className="rounded-xl bg-blue-50 px-4 py-2 text-center border border-blue-100">
                  <p className="text-xs text-blue-500">Saldo Tabungan</p>
                  <p className="font-bold text-blue-700">{rupiah(saldo)}</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-4 py-2 text-center border border-amber-100">
                  <p className="text-xs text-amber-600">Tagihan Belum Bayar</p>
                  <p className="font-bold text-amber-700">{tagihan.length} · {rupiah(totalTagihan)}</p>
                </div>
              </div>
              <button onClick={() => lookup({ nis: siswa.nis })} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                <RefreshCw size={14} /> Muat ulang
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Bayar tagihan */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">Pembayaran Tagihan</h3>
                <select value={metode} onChange={e => setMetode(e.target.value)} className="px-2 py-1 border rounded text-xs">
                  <option value="tunai">Tunai</option>
                  <option value="qris">QRIS</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              {tagihan.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Tidak ada tagihan belum bayar.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-auto">
                  {tagihan.map(t => (
                    <label key={t.id} className="flex items-center gap-3 rounded-lg border border-gray-100 p-2.5 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={selectedTagihan.has(t.id)} onChange={() => toggleTagihan(t.id)} className="w-4 h-4 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">{t.jenis_nama}</p>
                        <p className="text-xs text-gray-400">{t.bulan} {t.tahun}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-700">{rupiah(t.nominal)}</p>
                    </label>
                  ))}
                </div>
              )}
              <button onClick={bayarTagihan} disabled={busy || tagihan.length === 0} className="mt-3 flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                <CreditCard size={16} /> Bayar {selectedTagihan.size > 0 ? `${selectedTagihan.size} tagihan` : 'tagihan'}
              </button>
            </div>

            {/* Tabungan */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="mb-3 text-sm font-bold text-gray-800">Tabungan Siswa</h3>
              <input
                type="number"
                inputMode="numeric"
                value={nominal}
                onChange={e => setNominal(e.target.value)}
                placeholder="Nominal (Rp)"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-2"
              />
              <input
                value={keterangan}
                onChange={e => setKeterangan(e.target.value)}
                placeholder="Keterangan (opsional)"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-3"
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => simpanTabungan('setor')} disabled={busy} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                  <ArrowDownLeft size={16} /> Setor
                </button>
                <button onClick={() => simpanTabungan('tarik')} disabled={busy} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 disabled:opacity-50">
                  <ArrowUpRight size={16} /> Tarik
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400"><PiggyBank size={13} className="inline mr-1" />Saldo saat ini {rupiah(saldo)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
