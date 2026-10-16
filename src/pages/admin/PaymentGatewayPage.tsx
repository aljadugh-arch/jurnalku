import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save, RefreshCw, Copy, CheckCircle2, XCircle, AlertTriangle, QrCode, Wallet, Landmark } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ResponsiveTable from '../../components/ui/ResponsiveTable'

interface Config {
  provider: string
  base_url: string
  enabled: boolean
  punya_api_key: boolean
  api_key_hint: string
  webhook_url: string
  webhook_registered_at: string | null
  webhook_last_error: string | null
  last_verified_at: string | null
  last_verify_error: string | null
}

interface Intent {
  id: string
  ref_type: string
  ref_id: string
  student_id: string
  label: string
  nominal: number
  kode_unik: string
  pay_amount: number
  gateway_order_id: string
  status: string
  sumber: string
  created_at: string
  paid_at: string | null
  settled: boolean
}

interface Rekap {
  per_jenis: { ref_type: string; status: string; settled: boolean; jumlah: number; total: number }[]
  total_lunas: number
  jumlah_lunas: number
  total_belum_diselesaikan: number
  jumlah_belum_diselesaikan: number
}

const rupiah = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const LABEL_JENIS: Record<string, string> = { tagihan: 'Tagihan', topup: 'Top-up saldo', tabungan: 'Tabungan' }
const WARNA_STATUS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  expired: 'bg-gray-200 text-gray-600',
  canceled: 'bg-red-100 text-red-700',
}
const LABEL_STATUS: Record<string, string> = { pending: 'Menunggu', paid: 'Lunas', expired: 'Kedaluwarsa', canceled: 'Dibatalkan' }

export default function PaymentGatewayPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [rekap, setRekap] = useState<Rekap | null>(null)
  const [intents, setIntents] = useState<Intent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [menguji, setMenguji] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState({ base_url: 'https://pg.fazapay.ccwu.cc', api_key: '', enabled: false })

  const muat = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([
        api.get('/payment-gateway'),
        api.get('/payment-gateway/intents', { params: filterStatus ? { status: filterStatus } : {} }),
      ])
      setConfig(c.data.config)
      setRekap(c.data.rekap)
      setIntents(i.data.intents)
      setForm(f => ({ ...f, base_url: c.data.config.base_url, enabled: c.data.config.enabled, api_key: '' }))
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat konfigurasi')
    } finally { setLoading(false) }
  }, [filterStatus])

  useEffect(() => { muat() }, [muat])

  const simpan = async () => {
    setSaving(true)
    try {
      const payload: any = { base_url: form.base_url, enabled: form.enabled }
      if (form.api_key.trim()) payload.api_key = form.api_key.trim()
      const res = await api.put('/payment-gateway', payload)
      setConfig(res.data.config)
      setForm(f => ({ ...f, api_key: '' }))
      const uji = res.data.uji
      if (uji?.ok) {
        toast.success('Tersambung ke gateway' + (uji.webhook?.terdaftar ? ' + webhook terdaftar' : ' (webhook belum terdaftar)'))
      } else {
        toast.success('Konfigurasi disimpan')
      }
      muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan')
    } finally { setSaving(false) }
  }

  const ujiKoneksi = async () => {
    setMenguji(true)
    try {
      const res = await api.post('/payment-gateway/verify')
      setConfig(c => c ? { ...c, last_verified_at: new Date().toISOString(), last_verify_error: null, webhook_registered_at: res.data.webhook?.terdaftar ? new Date().toISOString() : c.webhook_registered_at } : c)
      toast.success(`Tersambung: ${res.data.akun?.email || 'ok'}${res.data.webhook?.terdaftar ? ' · webhook terdaftar' : ''}`)
      muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Uji koneksi gagal')
    } finally { setMenguji(false) }
  }

  const salinWebhook = async () => {
    if (!config?.webhook_url) return toast.error('Isi API key dulu')
    try { await navigator.clipboard.writeText(config.webhook_url); toast.success('URL webhook disalin') }
    catch { toast.error('Gagal menyalin') }
  }

  const aksi = async (intent: Intent, jenis: 'cek' | 'confirm' | 'cancel' | 'settle') => {
    try {
      if (jenis === 'cek') {
        const res = await api.post(`/payment-gateway/intents/${intent.id}/cek`)
        toast[res.data.berubah ? 'success' : 'error'](res.data.berubah ? 'Pembayaran diterima' : 'Belum ada pembayaran masuk')
      } else if (jenis === 'confirm') {
        if (!confirm('Konfirmasi manual bahwa dana ' + rupiah(intent.pay_amount) + ' sudah masuk?\n\nIni langsung melunasi tagihan / menambah saldo.')) return
        const res = await api.post(`/payment-gateway/intents/${intent.id}/confirm`, { catatan: 'konfirmasi bendahara' })
        toast.success(res.data.duplikat ? 'Sudah pernah dikonfirmasi' : 'Dikonfirmasi & efek diterapkan')
      } else if (jenis === 'cancel') {
        if (!confirm('Batalkan QRIS ini? Nominalnya akan bebas dipakai transaksi lain.')) return
        await api.post(`/payment-gateway/intents/${intent.id}/cancel`)
        toast.success('Dibatalkan')
      } else {
        await api.post('/payment-gateway/settle', { id: intent.id })
        toast.success('Ditandai sudah disetor')
      }
      muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal')
    }
  }

  if (loading) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>

  const tersambung = Boolean(config?.last_verified_at && !config?.last_verify_error)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Payment Gateway QRIS</h1>
        <p className="text-gray-500 text-sm mt-1">
          Terima pembayaran tagihan, top-up saldo, dan setoran tabungan lewat QRIS dinamis. Pembayaran terbaca otomatis.
        </p>
      </div>

      {/* Status */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            {tersambung && config?.enabled
              ? <CheckCircle2 className="text-green-600" />
              : config?.last_verify_error || !config?.punya_api_key
                ? <AlertTriangle className="text-amber-500" />
                : <XCircle className="text-gray-400" />}
            <div>
              <p className="font-semibold text-gray-800">
                {tersambung && config?.enabled ? 'Aktif & tersambung' : config?.punya_api_key ? 'Belum diaktifkan' : 'API key belum diisi'}
              </p>
              <p className="text-xs text-gray-500">
                {config?.last_verified_at ? `Verifikasi terakhir ${new Date(config.last_verified_at).toLocaleString('id-ID')}` : 'Belum pernah diverifikasi'}
                {config?.api_key_hint ? ` · kunci ${config.api_key_hint}` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={ujiKoneksi} disabled={menguji || !config?.punya_api_key} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {menguji ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Uji & daftarkan webhook
            </button>
          </div>
        </div>
        {config?.last_verify_error && <p className="mt-3 text-sm text-red-600">Galat terakhir: {config.last_verify_error}</p>}
        {config?.webhook_last_error && <p className="mt-1 text-sm text-amber-700">Webhook: {config.webhook_last_error}</p>}
      </div>

      {/* Konfigurasi */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Konfigurasi</h2>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">URL Gateway</label>
          <input value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://pg.fazapay.ccwu.cc" />
          <p className="text-[11px] text-gray-400 mt-1">Alamat gateway QRIS yang dipakai lembaga ini.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">API Key Gateway</label>
          <input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} autoComplete="off"
            className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={config?.punya_api_key ? '••••••••  (biarkan kosong bila tidak diubah)' : 'gpm_live_…'} />
          <p className="text-[11px] text-gray-400 mt-1">
            Disimpan terenkripsi di server dan tidak pernah dikirim kembali ke peramban.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm text-gray-700">
          <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="w-4 h-4" />
          Aktifkan pembayaran QRIS untuk lembaga ini
        </label>

        {config?.webhook_url && (
          <div className="rounded-lg bg-gray-50 border p-3">
            <p className="text-xs font-medium text-gray-600 mb-1">URL webhook (otomatis didaftarkan ke gateway)</p>
            <div className="flex items-center gap-2">
              <code className="text-[11px] break-all text-gray-700 flex-1">{config.webhook_url}</code>
              <button onClick={salinWebhook} className="p-1.5 rounded-lg bg-white border text-gray-600" title="Salin"><Copy size={14} /></button>
            </div>
            {config.webhook_registered_at && <p className="text-[11px] text-green-700 mt-1">Terdaftar {new Date(config.webhook_registered_at).toLocaleString('id-ID')}</p>}
          </div>
        )}

        <button onClick={simpan} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan
        </button>
      </div>

      {/* Rekap */}
      {rekap && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">Total lunas</p>
            <p className="text-xl font-bold text-green-600">{rupiah(rekap.total_lunas)}</p>
            <p className="text-xs text-gray-400">{rekap.jumlah_lunas} transaksi</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">Belum disetor operator</p>
            <p className="text-xl font-bold text-amber-600">{rupiah(rekap.total_belum_diselesaikan)}</p>
            <p className="text-xs text-gray-400">{rekap.jumlah_belum_diselesaikan} transaksi</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">Menunggu bayar</p>
            <p className="text-xl font-bold text-gray-800">{intents.filter(i => i.status === 'pending').length}</p>
            <p className="text-xs text-gray-400">QRIS aktif</p>
          </div>
        </div>
      )}

      {/* Riwayat */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><QrCode size={17} /> Riwayat pembayaran QRIS</h2>
          <div className="flex gap-2">
            {[['', 'Semua'], ['pending', 'Menunggu'], ['paid', 'Lunas'], ['expired', 'Kedaluwarsa'], ['canceled', 'Dibatalkan']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterStatus(v)} className={'px-3 py-1.5 rounded-lg text-xs ' + (filterStatus === v ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600')}>{l}</button>
            ))}
          </div>
        </div>
        <ResponsiveTable<Intent>
          columns={[
            { key: 'created_at', header: 'Waktu', render: (r) => <span className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString('id-ID')}</span> },
            { key: 'label', header: 'Jenis', render: (r) => <span className="text-sm">{r.label || LABEL_JENIS[r.ref_type] || r.ref_type}</span> },
            { key: 'pay_amount', header: 'Nominal', render: (r) => (
              <div className="text-sm">
                <span className="font-medium">{rupiah(r.pay_amount)}</span>
                <span className="block text-[11px] text-gray-400">asli {rupiah(r.nominal)} · kode {r.kode_unik}</span>
              </div>
            ) },
            { key: 'status', header: 'Status', render: (r) => (
              <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (WARNA_STATUS[r.status] || 'bg-gray-100')}>{LABEL_STATUS[r.status] || r.status}</span>
            ) },
            { key: 'sumber', header: 'Sumber', hideOnMobile: true, render: (r) => <span className="text-[11px] text-gray-400">{r.sumber || '-'}</span> },
          ]}
          rows={intents}
          rowKey={(r) => r.id}
          empty="Belum ada transaksi QRIS."
          actions={(r) => (
            <div className="flex gap-2 flex-wrap">
              {r.status === 'pending' && <>
                <button onClick={() => aksi(r, 'cek')} className="px-2 py-1 text-xs rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">Cek</button>
                <button onClick={() => aksi(r, 'confirm')} className="px-2 py-1 text-xs rounded-lg bg-green-50 text-green-700 hover:bg-green-100">Konfirmasi</button>
                <button onClick={() => aksi(r, 'cancel')} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100">Batal</button>
              </>}
              {r.status === 'paid' && !r.settled && (
                <button onClick={() => aksi(r, 'settle')} className="px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 inline-flex items-center gap-1"><Landmark size={11} /> Setor</button>
              )}
              {r.status === 'paid' && r.settled && <span className="text-[11px] text-gray-400 inline-flex items-center gap-1"><Wallet size={11} /> sudah disetor</span>}
            </div>
          )}
        />
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">Cara kerja singkat</p>
        <ol className="list-decimal ml-4 space-y-0.5 text-xs">
          <li>QRIS dibuat dinamis per transaksi — nominal + kode unik sudah tertanam di dalamnya.</li>
          <li>Pembayar scan; gateway mendeteksi dan mengirim notifikasi ke server ini.</li>
          <li>Tagihan otomatis lunas / saldo otomatis bertambah. Tombol <strong>Konfirmasi</strong> hanya untuk keadaan darurat bila notifikasi tidak sampai.</li>
        </ol>
      </div>
    </div>
  )
}