import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Megaphone, Send, RefreshCw, AlertTriangle, CheckCircle2, Building2, Loader2, Image as ImageIcon } from 'lucide-react'
import api from '../../services/api'

type Audiens = {
  tenant_count: number
  nomor_count: number
  siap_kirim: number
  per_tenant: { id: string; nama: string; wa: string; nomor: number; rincian: { gtk: number; wali: number; lembaga: number } }[]
}

type Riwayat = {
  id: string
  judul: string
  pesan_count: number
  tenant_count: number
  terkirim: number
  menunggu: number
  gagal: number
  created_at: string
  created_by_nama?: string
}

const MAKS_PANJANG = 900

const labelWA = (s: string) => s === 'connected' ? 'Tersambung' : s === 'qr' ? 'Perlu pindai QR' : s === 'connecting' ? 'Menyambung' : 'Tidak aktif'
const warnaWA = (s: string) => s === 'connected' ? 'text-emerald-600 bg-emerald-50' : s === 'connecting' ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50'

export default function PlatformBroadcastPage() {
  const [judul, setJudul] = useState('')
  const [pesan, setPesan] = useState('')
  const [semua, setSemua] = useState(true)
  const [pilihan, setPilihan] = useState<string[]>([])
  const [audiens, setAudiens] = useState<Audiens | null>(null)
  const [memuatAudiens, setMemuatAudiens] = useState(false)
  const [mengirim, setMengirim] = useState(false)
  const [lampiran, setLampiran] = useState<{ path: string; bytes?: number } | null>(null)
  const [mengunggah, setMengunggah] = useState(false)
  const [riwayat, setRiwayat] = useState<Riwayat[]>([])
  const [memuatRiwayat, setMemuatRiwayat] = useState(false)

  const target = semua ? 'semua' : pilihan

  const muatAudiens = useCallback(async () => {
    setMemuatAudiens(true)
    try {
      const r = await api.get('/superadmin/broadcast/audiens', { params: { target: semua ? 'semua' : pilihan.join(',') } })
      setAudiens(r.data)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat audiens')
    } finally { setMemuatAudiens(false) }
  }, [semua, pilihan])

  const muatRiwayat = useCallback(async () => {
    setMemuatRiwayat(true)
    try {
      const r = await api.get('/superadmin/broadcast?limit=10')
      setRiwayat(r.data || [])
    } catch { /* diamkan */ } finally { setMemuatRiwayat(false) }
  }, [])

  useEffect(() => { void muatAudiens() }, [muatAudiens])
  useEffect(() => { void muatRiwayat() }, [muatRiwayat])

  const tidakSiap = useMemo(() => (audiens?.per_tenant || []).filter(t => t.wa !== 'connected' && t.nomor > 0), [audiens])

  const toggleTenant = (id: string) => {
    setPilihan(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  const unggahGambar = async (file?: File | null) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error('Format harus JPG, PNG, atau WebP'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Ukuran maksimal 5 MB'); return }
    setMengunggah(true)
    try {
      const fd = new FormData(); fd.append('gambar', file)
      const r = await api.post('/broadcast/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setLampiran({ path: r.data.path, bytes: r.data.bytes })
      toast.success('Gambar siap dikirim')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mengunggah gambar')
    } finally { setMengunggah(false) }
  }

  const kirim = async () => {
    if (judul.trim().length < 3) { toast.error('Judul minimal 3 karakter'); return }
    if (pesan.trim().length < 10 && !lampiran) { toast.error('Isi pengumuman minimal 10 karakter (atau lampirkan gambar)'); return }
    if (!semua && pilihan.length === 0) { toast.error('Pilih minimal satu lembaga'); return }
      const unggahGambar = async (file?: File | null) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error('Format harus JPG, PNG, atau WebP'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Ukuran maksimal 5 MB'); return }
    setMengunggah(true)
    try {
      const fd = new FormData(); fd.append('gambar', file)
      const r = await api.post('/broadcast/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setLampiran({ path: r.data.path, bytes: r.data.bytes })
      toast.success('Gambar siap dikirim')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mengunggah gambar')
    } finally { setMengunggah(false) }
  }

const jumlah = audiens?.nomor_count ?? 0
    const yakin = window.confirm(`Kirim pengumuman ke ${jumlah} nomor WhatsApp?\n\nPesan akan masuk antrean dan dikirim mengikuti status sesi WA tiap lembaga.`)
    if (!yakin) return
    setMengirim(true)
    try {
      const r = await api.post('/superadmin/broadcast', { judul, pesan, target, ...(lampiran ? { media_path: lampiran.path } : {}) })
      toast.success(`Masuk antrean: ${r.data.masuk_antrean} pesan ke ${r.data.tenant_count} lembaga`)
      setJudul(''); setPesan(''); setLampiran(null)
      void muatRiwayat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mengirim pengumuman')
    } finally { setMengirim(false) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Megaphone size={20} /></div>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Pengumuman Platform</h1>
          <p className="text-sm text-gray-500">Kirim pemberitahuan ke pengguna semua lembaga lewat WhatsApp masing-masing lembaga.</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">Judul</label>
          <input value={judul} onChange={e => setJudul(e.target.value.slice(0, 120))} placeholder="Contoh: Pemeliharaan sistem Sabtu malam" className="w-full rounded-lg border px-4 py-2 text-sm" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-600">Isi Pengumuman</label>
            <span className={`text-[11px] ${pesan.length > MAKS_PANJANG ? 'text-rose-600' : 'text-gray-400'}`}>{pesan.length}/{MAKS_PANJANG}</span>
          </div>
          <textarea value={pesan} onChange={e => setPesan(e.target.value.slice(0, MAKS_PANJANG))} rows={6} placeholder="Tulis informasi singkat, jelas, dan tanpa data sensitif." className="w-full rounded-lg border px-4 py-2 text-sm" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${mengunggah ? 'opacity-60' : 'hover:bg-gray-50'}`}>
              <ImageIcon size={14} /> {mengunggah ? 'Mengunggah…' : lampiran ? 'Ganti gambar' : 'Lampirkan gambar'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={mengunggah}
                onChange={e => { void unggahGambar(e.target.files?.[0]); e.currentTarget.value = '' }} />
            </label>
            {lampiran && <>
              <img src={lampiran.path} alt="Lampiran" className="h-12 w-12 rounded-lg border object-cover" />
              <button type="button" onClick={() => setLampiran(null)} className="text-xs font-semibold text-rose-600 hover:underline">Hapus</button>
              {lampiran.bytes ? <span className="text-[10px] text-gray-400">{Math.round(lampiran.bytes / 1024)} KB setelah kompres</span> : null}
            </>}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-600">Tujuan</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSemua(true)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${semua ? 'border-primary bg-primary/5 text-primary' : 'text-gray-600'}`}>Semua lembaga</button>
            <button type="button" onClick={() => setSemua(false)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${!semua ? 'border-primary bg-primary/5 text-primary' : 'text-gray-600'}`}>Pilih lembaga</button>
          </div>
          {!semua && (
            <div className="max-h-52 space-y-1 overflow-auto rounded-lg border p-2">
              {(audiens?.per_tenant || []).map(t => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                  <input type="checkbox" checked={pilihan.includes(t.id)} onChange={() => toggleTenant(t.id)} />
                  <Building2 size={14} className="text-gray-400" />
                  <span className="min-w-0 flex-1 truncate">{t.nama}</span>
                  <span className="shrink-0 text-[11px] text-gray-400">{t.nomor} nomor</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-gray-50 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-gray-700">{audiens?.tenant_count ?? 0} lembaga</span>
            <span className="text-gray-600">{audiens?.nomor_count ?? 0} nomor unik</span>
            <span className="text-emerald-600">{audiens?.siap_kirim ?? 0} siap kirim sekarang</span>
            {memuatAudiens && <Loader2 size={14} className="animate-spin text-gray-400" />}
            <button type="button" onClick={() => void muatAudiens()} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <RefreshCw size={12} /> Hitung ulang
            </button>
          </div>
          {tidakSiap.length > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {tidakSiap.length} lembaga belum tersambung WA ({tidakSiap.slice(0, 4).map(t => t.nama).join(', ')}{tidakSiap.length > 4 ? ', …' : ''}).
                Pesan tetap masuk antrean dan terkirim otomatis setelah sesi tersambung.
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={kirim} disabled={mengirim} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {mengirim ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {mengirim ? 'Mengirim...' : 'Kirim Pengumuman'}
          </button>
          <button type="button" onClick={() => void muatRiwayat()} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <RefreshCw size={16} /> Muat ulang riwayat
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">Riwayat Pengumuman</h2>
          {memuatRiwayat && <Loader2 size={14} className="animate-spin text-gray-400" />}
        </div>
        <div className="divide-y">
          {riwayat.length === 0 && <p className="p-6 text-center text-sm text-gray-400">Belum ada pengumuman.</p>}
          {riwayat.map(r => (
            <div key={r.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{r.judul}</p>
                <span className="text-[11px] text-gray-400">{new Date(r.created_at + 'Z').toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{r.tenant_count} lembaga</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{r.pesan_count} nomor</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"><CheckCircle2 size={11} /> {r.terkirim} terkirim</span>
                {r.menunggu > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{r.menunggu} menunggu</span>}
                {r.gagal > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">{r.gagal} gagal</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="px-1 text-[11px] leading-5 text-gray-400">
        Penerima diambil dari nomor yang terdaftar: GTK, wali/siswa aktif, dan kontak lembaga. Nomor ganda hanya menerima satu pesan.
        Pengumuman tidak memuat data akademik; jangan pernah menulis kata sandi atau data pribadi di sini.
      </p>
    </div>
  )
}
