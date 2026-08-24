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
  const save = async () => { setSaving(true); try { await api.put('/cashless/provider/bank_transfer', config); toast.success('QRIS statis disimpan') } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan') } finally { setSaving(false) } }
  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto" />Memuat...</div>
  const qris = (label: string, key: 'shopee_qris' | 'gopay_qris') => <div className="rounded-xl border border-gray-200 p-4 space-y-3"><h3 className="font-semibold flex items-center gap-2"><QrCode size={18} />{label}</h3><p className="text-xs text-gray-500">Upload QRIS statis merchant. Sistem tidak mengambil data akun atau cookie merchant.</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => e.target.files?.[0] && readImage(e.target.files[0], value => setConfig(c => ({ ...c, [key]: value })))} className="block w-full text-sm" />{config[key] && <img src={config[key]} alt={`QRIS ${label}`} className="w-56 h-56 object-contain mx-auto border rounded-lg p-2" />}<button type="button" onClick={() => setConfig(c => ({ ...c, [key]: '' }))} className="text-xs text-red-600">Hapus QRIS</button></div>
  return <div className="space-y-6 max-w-3xl"><div><h1 className="text-2xl font-bold text-gray-800">QRIS Merchant Statis</h1><p className="text-sm text-gray-500 mt-1">Sediakan QRIS ShopeePay dan GoPay untuk pembayaran manual yang diverifikasi bendahara.</p></div><div className="bg-white rounded-xl border p-6 space-y-5"><label className="flex items-center gap-3 font-medium"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />Aktifkan top-up QRIS</label><div className="grid md:grid-cols-2 gap-4">{qris('ShopeePay Merchant', 'shopee_qris')}{qris('GoPay Merchant', 'gopay_qris')}</div><div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">QRIS statis tidak bisa membaca otomatis nama pengirim atau nominal. User wajib mengisi identitas, nominal, dan bukti transfer; bendahara mencocokkan mutasi lalu memverifikasi.</div><button onClick={save} disabled={saving} className="w-full py-2.5 rounded-lg bg-primary text-white flex items-center justify-center gap-2 disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan</button></div></div>
}
