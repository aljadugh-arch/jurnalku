import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Send, Settings, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function WAGatewayPage() {
  const [config, setConfig] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Test pesan dari JURNALKU 🎓')
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => { loadConfig() }, [])

  const loadConfig = async () => {
    try {
      const res = await api.get('/wa-gateway/config')
      setConfig(res.data)
    } catch { toast.error('Gagal load konfigurasi') }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/wa-gateway/config', config)
      toast.success('Konfigurasi WA Gateway tersimpan')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!testPhone) { toast.error('Masukkan nomor HP'); return }
    setTestResult(null)
    try {
      const res = await api.post('/wa-gateway/test', { phone: testPhone, message: testMsg })
      setTestResult(res.data)
      if (res.data.success) toast.success('Pesan terkirim!')
      else toast.error(res.data.error || 'Gagal kirim')
    } catch { toast.error('Gagal test') }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">WhatsApp Gateway</h1>
        <p className="text-gray-500 text-sm mt-1">Konfigurasi gateway untuk broadcast WA (Baileys / Sidobe)</p>
      </div>

      {/* Status Card */}
      <div className={`rounded-xl p-4 border flex items-center gap-3 ${config.enabled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        {config.enabled ? <Wifi className="text-green-600" size={24} /> : <WifiOff className="text-red-600" size={24} />}
        <div>
          <p className="font-medium text-gray-800">{config.enabled ? 'Gateway Aktif' : 'Gateway Nonaktif'}</p>
          <p className="text-sm text-gray-500">Provider: <strong className="capitalize">{config.provider || '-'}</strong></p>
        </div>
      </div>

      {/* Config Form */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-5">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Settings size={20} /> Pengaturan</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
            <select value={config.provider || ''} onChange={e => setConfig({...config, provider: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="baileys">Baileys (Self-hosted)</option>
              <option value="sidobe">Sidobe API (Cloud)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select value={config.enabled ? '1' : '0'} onChange={e => setConfig({...config, enabled: e.target.value === '1'})} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nama Pengirim (untuk template)</label>
          <input value={config.sender_name || ''} onChange={e => setConfig({...config, sender_name: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="JURNALKU" />
        </div>

        {/* Baileys Config */}
        {config.provider === 'baileys' && (
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-medium text-gray-700 text-sm">⚙️ Baileys Configuration</h3>
            <p className="text-xs text-gray-500">Baileys menggunakan REST API endpoint lokal (wa-gateway/baileys-api). Pastikan service berjalan.</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Webhook URL (send endpoint)</label>
              <input value={config.baileys_webhook || ''} onChange={e => setConfig({...config, baileys_webhook: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="http://localhost:8000/send-message" />
            </div>
          </div>
        )}

        {/* Sidobe Config */}
        {config.provider === 'sidobe' && (
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-medium text-gray-700 text-sm">⚙️ Sidobe Configuration</h3>
            <p className="text-xs text-gray-500">Sidobe adalah layanan cloud WA API. Daftar di sidobe.com untuk mendapatkan API key.</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">API URL</label>
              <input value={config.sidobe_api_url || ''} onChange={e => setConfig({...config, sidobe_api_url: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="https://api.sidobe.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
              <input type="password" value={config.sidobe_api_key || ''} onChange={e => setConfig({...config, sidobe_api_key: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="sk-xxxx" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Device ID</label>
              <input value={config.sidobe_device_id || ''} onChange={e => setConfig({...config, sidobe_device_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="device-id" />
            </div>
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
        </button>
      </div>

      {/* Test Send */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Send size={20} /> Test Kirim Pesan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nomor HP</label>
            <input value={testPhone} onChange={e => setTestPhone(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="08xxxxxxxxxx" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pesan</label>
            <input value={testMsg} onChange={e => setTestMsg(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleTest} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Kirim Test</button>
          {testResult && (
            <span className={`flex items-center gap-1 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {testResult.success ? 'Berhasil' : testResult.error}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700 space-y-2">
        <p className="font-medium">📋 Panduan Provider:</p>
        <p><strong>Baileys (Self-hosted):</strong> Install wa-gateway lokal (Node.js), scan QR dari HP, lalu masukkan webhook URL. Gratis tanpa batas, butuh server.</p>
        <p><strong>Sidobe (Cloud):</strong> Daftar di sidobe.com, buat device, copy API key dan device ID. Berbayar per pesan, tanpa setup server.</p>
      </div>
    </div>
  )
}
