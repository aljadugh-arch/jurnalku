import { useState, useEffect } from 'react'
import { Save, Loader2, CheckCircle, QrCode, RefreshCw, Eye, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function CashlessBankTransferConfigPage() {
  const [config, setConfig] = useState({
    enabled: false,
    va_prefix: '',
    bank_code: '',
    admin_fee: 0,
    manual_verify: true,
    shopee_merchant_id: '',
    shopee_partner_key: '',
    shopee_partner_secret: '',
    gopay_client_id: '',
    gopay_client_secret: '',
    gopay_merchant_id: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scrapingShopee, setScrapingShopee] = useState(false)
  const [scrapingGoPay, setScrapingGoPay] = useState(false)
  const [shopeeQr, setShopeeQr] = useState<string | null>(null)
  const [gopayQr, setGoPayQr] = useState<string | null>(null)

  const fetchConfig = async () => {
    try {
      const res = await api.get('/cashless/provider/bank_transfer')
      setConfig(prev => ({ ...prev, ...res.data.config }))
    } catch { toast.error('Gagal memuat konfigurasi') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchConfig() }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/cashless/provider/bank_transfer', config)
      toast.success('Konfigurasi bank transfer disimpan')
      fetchConfig()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan')
    } finally { setSaving(false) }
  }

  const scrapeShopeeQr = async () => {
    if (!config.shopee_merchant_id || !config.shopee_partner_key || !config.shopee_partner_secret) {
      return toast.error('Isi Merchant ID, Partner Key, dan Partner Secret Shopee terlebih dahulu')
    }
    setScrapingShopee(true)
    try {
      const res = await api.post('/cashless/provider/bank_transfer/shopee/qr')
      if (res.data.qr_code) {
        setShopeeQr(res.data.qr_code)
        toast.success('QR Shopee Partner berhasil diambil')
      } else {
        toast.error(res.data.error || 'QR tidak ditemukan')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal scrape QR Shopee')
    } finally { setScrapingShopee(false) }
  }

  const scrapeGoPayQr = async () => {
    if (!config.gopay_client_id || !config.gopay_client_secret || !config.gopay_merchant_id) {
      return toast.error('Isi Client ID, Client Secret, dan Merchant ID GoPay terlebih dahulu')
    }
    setScrapingGoPay(true)
    try {
      const res = await api.post('/cashless/provider/bank_transfer/gopay/qr')
      if (res.data.qr_code) {
        setGoPayQr(res.data.qr_code)
        toast.success('QR GoPay Merchant berhasil diambil')
      } else {
        toast.error(res.data.error || 'QR tidak ditemukan')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal scrape QR GoPay')
    } finally { setScrapingGoPay(false) }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Konfigurasi Bank Transfer</h1>
        <p className="text-gray-500 text-sm mt-1">Pengaturan Virtual Account & verifikasi manual topup cashless</p>
      </div>

      {loading ? (
        <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /><p className="mt-2 text-gray-500">Memuat...</p></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="enabled"
              checked={config.enabled}
              onChange={e => setConfig({...config, enabled: e.target.checked})}
              className="w-5 h-5 text-primary rounded border-gray-300 focus:ring-primary/20"
            />
            <label htmlFor="enabled" className="font-medium text-gray-700">Aktifkan bank transfer sebagai metode topup</label>
          </div>

          {config.enabled && (
            <div className="space-y-4 border-t pt-6">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prefix VA (contoh: JURNAL)</label>
                <input
                  type="text"
                  value={config.va_prefix}
                  onChange={e => setConfig({...config, va_prefix: e.target.value.toUpperCase()})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="JURNAL"
                  maxLength={10}
                />
                <p className="text-xs text-gray-500 mt-1">Format VA: {config.va_prefix || 'PREFIX'} + NIS siswa</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kode Bank (kode 3 digit Bank Indonesia)</label>
                <input
                  type="text"
                  value={config.bank_code}
                  onChange={e => setConfig({...config, bank_code: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="002 (BRI), 008 (Mandiri), 009 (BNI), 014 (BCA)"
                  maxLength={3}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Biaya Admin per Transaksi (Rp)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={config.admin_fee}
                  onChange={e => setConfig({...config, admin_fee: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="manual_verify"
                  checked={config.manual_verify}
                  onChange={e => setConfig({...config, manual_verify: e.target.checked})}
                  className="w-5 h-5 text-primary rounded border-gray-300 focus:ring-primary/20"
                />
                <label htmlFor="manual_verify" className="font-medium text-gray-700">
                  Verifikasi manual oleh admin/bendahara (wajib untuk bank transfer)
                </label>
              </div>

              {/* Shopee Partner QR */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-primary" /> Shopee Partner (ShopeePay)
                </h3>
                <p className="text-xs text-gray-500">Ambil QR code merchant Shopee untuk topup otomatis dengan kode unik 3 digit</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Merchant ID Shopee</label>
                  <input
                    type="text"
                    value={config.shopee_merchant_id}
                    onChange={e => setConfig({...config, shopee_merchant_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="SHOPEE_MERCHANT_ID"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Partner Key</label>
                  <input
                    type="text"
                    value={config.shopee_partner_key}
                    onChange={e => setConfig({...config, shopee_partner_key: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="PARTNER_KEY"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Partner Secret</label>
                  <input
                    type="password"
                    value={config.shopee_partner_secret}
                    onChange={e => setConfig({...config, shopee_partner_secret: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="PARTNER_SECRET"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={scrapeShopeeQr}
                    disabled={scrapingShopee || !config.shopee_merchant_id || !config.shopee_partner_key || !config.shopee_partner_secret}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {scrapingShopee ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode size={16} />} Ambil QR Shopee
                  </button>
                  {shopeeQr && (
                    <button
                      onClick={() => window.open(shopeeQr, '_blank')}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 flex items-center justify-center gap-2"
                    >
                      <Eye size={16} /> Lihat QR
                    </button>
                  )}
                </div>
                {shopeeQr && (
                  <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-center">
                    <img src={shopeeQr} alt="Shopee Partner QR" className="max-w-xs mx-auto" />
                    <p className="text-xs text-green-700 mt-2">QR Shopee Partner - gunakan untuk generate VA topup</p>
                  </div>
                )}
              </div>

              {/* GoPay Merchant QR */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-primary" /> GoPay Merchant
                </h3>
                <p className="text-xs text-gray-500">Ambil QR code merchant GoPay untuk topup otomatis dengan kode unik 3 digit</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client ID GoPay</label>
                  <input
                    type="text"
                    value={config.gopay_client_id}
                    onChange={e => setConfig({...config, gopay_client_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="GOPAY_CLIENT_ID"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret GoPay</label>
                  <input
                    type="password"
                    value={config.gopay_client_secret}
                    onChange={e => setConfig({...config, gopay_client_secret: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="GOPAY_CLIENT_SECRET"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Merchant ID GoPay</label>
                  <input
                    type="text"
                    value={config.gopay_merchant_id}
                    onChange={e => setConfig({...config, gopay_merchant_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="GOPAY_MERCHANT_ID"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={scrapeGoPayQr}
                    disabled={scrapingGoPay || !config.gopay_client_id || !config.gopay_client_secret || !config.gopay_merchant_id}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {scrapingGoPay ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode size={16} />} Ambil QR GoPay
                  </button>
                  {gopayQr && (
                    <button
                      onClick={() => window.open(gopayQr, '_blank')}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 flex items-center justify-center gap-2"
                    >
                      <Eye size={16} /> Lihat QR
                    </button>
                  )}
                </div>
                {gopayQr && (
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 text-center">
                    <img src={gopayQr} alt="GoPay Merchant QR" className="max-w-xs mx-auto" />
                    <p className="text-xs text-purple-700 mt-2">QR GoPay Merchant - gunakan untuk generate VA topup</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-sm text-blue-700"><strong>Catatan:</strong></p>
                <ul className="text-sm text-blue-600 mt-2 space-y-1 list-disc list-inside">
                  <li>Siswa/orang tua transfer ke VA yang digenerate sistem</li>
                  <li>Upload bukti transfer via aplikasi siswa/wali</li>
                  <li>Admin/bendahara verifikasi di halaman "Verifikasi Topup Manual"</li>
                  <li>Setelah diverifikasi, saldo cashless otomatis bertambah</li>
                </ul>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />} Simpan Konfigurasi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}