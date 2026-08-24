import { useState, useEffect } from 'react'
import { Save, Loader2, QrCode } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

type Config = { enabled: boolean; va_prefix: string; bank_code: string; admin_fee: number; manual_verify: boolean; shopee_qris: string; gopay_qris: string }
const empty: Config = { enabled: false, va_prefix: '', bank_code: '', admin_fee: 0, manual_verify: true, shopee_qris: '', gopay_qris: '' }

const readImage = (file: File, set: (value: string) => void) => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('QRIS harus PNG, JPG, atau WEBP')
  if (file.size > 1024 * 1024) return toast.error('Ukuran QRIS maksimal 1 MB')
  const reader = new FileReader()
  reader.onload = () => set(String(reader.result || ''))
  reader.readAsDataURL(file)
}

export default function CashlessBankTransferConfigPage() {
  const [config, setConfig] = useState<Config>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.get('/cashless/provider/bank_transfer').then(r => setConfig({ ...empty, ...r.data.config, enabled: Boolean(r.data.enabled) })).catch(() => toast.error('Gagal memuat konfigurasi')).finally(() => setLoading(false)) }, [])
  const save = async () => {
    setSaving(true)
    try {
      await api.put('/cashless/provider/bank_transfer', config)
      toast.success('Konfigurasi transfer bank dan QRIS disimpan')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto" />Memuat...</div>

  const qris = (label: string, key: 'shopee_qris' | 'gopay_qris') => (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3 min-w-0">
      <h3 className="font-semibold flex items-center gap-2"><QrCode size={18} className="shrink-0" />{label}</h3>
      <p className="text-xs text-gray-500">Upload QRIS statis merchant. Sistem tidak mengambil data akun atau cookie merchant.</p>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => e.target.files?.[0] && readImage(e.target.files[0], value => setConfig(c => ({ ...c, [key]: value })))} className="block w-full min-w-0 text-sm" />
      {config[key] && <img src={config[key]} alt={`QRIS ${label}`} className="w-56 h-56 max-w-full object-contain mx-auto border rounded-lg p-2" />}
      {config[key] && <button type="button" onClick={() => setConfig(c => ({ ...c, [key]: '' }))} className="text-xs text-red-600">Hapus QRIS</button>}
    </div>
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Konfigurasi Transfer Bank & QRIS</h1>
        <p className="text-sm text-gray-500 mt-1">Atur transfer bank dan QRIS merchant untuk top-up manual yang diverifikasi bendahara.</p>
      </div>

      <div className="bg-white rounded-xl border p-4 sm:p-6 space-y-6">
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800">Konfigurasi Transfer Bank</h2>
            <p className="text-xs text-gray-500 mt-1">Rekening tujuan/VA dan aturan verifikasi transfer manual.</p>
          </div>

          <label className="flex items-start gap-3 font-medium">
            <input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} className="mt-0.5" />
            <span>Aktifkan transfer bank sebagai metode top-up</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className="block text-xs font-medium text-gray-600 mb-1">Prefix VA</span>
              <input type="text" value={config.va_prefix} onChange={e => setConfig({ ...config, va_prefix: e.target.value.toUpperCase() })} placeholder="JURNAL" maxLength={10} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <span className="block text-xs text-gray-500 mt-1">Format VA: {config.va_prefix || 'PREFIX'} + NIS siswa</span>
            </label>

            <label className="block min-w-0">
              <span className="block text-xs font-medium text-gray-600 mb-1">Kode Bank</span>
              <input type="text" inputMode="numeric" value={config.bank_code} onChange={e => setConfig({ ...config, bank_code: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="002, 008, 009, atau 014" maxLength={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <span className="block text-xs text-gray-500 mt-1">Kode bank 3 digit: BRI 002, Mandiri 008, BNI 009, BCA 014.</span>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Biaya Admin per Transaksi (Rp)</span>
            <input type="number" min="0" step="100" value={config.admin_fee} onChange={e => setConfig({ ...config, admin_fee: Math.max(0, Number(e.target.value) || 0) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </label>

          <label className="flex items-start gap-3 font-medium">
            <input type="checkbox" checked={config.manual_verify} onChange={e => setConfig({ ...config, manual_verify: e.target.checked })} className="mt-0.5" />
            <span>Verifikasi manual oleh admin/bendahara</span>
          </label>
        </section>

        <section className="space-y-4 border-t pt-6">
          <div>
            <h2 className="font-semibold text-gray-800">QRIS Merchant Statis</h2>
            <p className="text-xs text-gray-500 mt-1">ShopeePay dan GoPay tetap tersedia bersama transfer bank.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{qris('ShopeePay Merchant', 'shopee_qris')}{qris('GoPay Merchant', 'gopay_qris')}</div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">QRIS statis tidak bisa membaca otomatis nama pengirim atau nominal. User wajib mengisi identitas, nominal, dan bukti transfer; bendahara mencocokkan mutasi lalu memverifikasi.</div>
        </section>

        <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-lg bg-primary text-white flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan Konfigurasi
        </button>
      </div>
    </div>
  )
}
