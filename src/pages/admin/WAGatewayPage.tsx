import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, Wifi, WifiOff, Send, Settings, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function WAGatewayPage() {
  const [config, setConfig] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Test pesan dari JURNALKU 🎓')
  const [testResult, setTestResult] = useState<any>(null)
  const [waStatus, setWaStatus] = useState<any>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const statusTimer = useRef<number | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      const res = await api.get('/wa-gateway/config')
      setConfig(res.data)
    } catch { toast.error('Gagal load konfigurasi') }
    finally { setLoading(false) }
  }, [])

  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/wa-gateway/status')
      setWaStatus(r.data)
      if (r.data.status === 'connected') {
        setConnecting(false); setQrImage(null)
        if (statusTimer.current) { window.clearInterval(statusTimer.current); statusTimer.current = null }
      }
    } catch {}
  }, [])
  const loadQr = useCallback(async () => {
    try {
      const r = await api.get('/wa-gateway/qr-image')
      if (r.data.image) setQrImage(r.data.image)
      if (r.data.status) setWaStatus((s: any) => ({ ...s, status: r.data.status, has_qr: !!r.data.image }))
    } catch {}
  }, [])

  useEffect(() => {
    loadConfig(); loadStatus()
    return () => { if (statusTimer.current) window.clearInterval(statusTimer.current) }
  }, [loadStatus])
  const connect = async () => {
    try {
      setConnecting(true); setQrImage(null)
      await api.post('/wa-gateway/connect')
      toast.success('Gateway dimulai, menunggu QR...')
      if (statusTimer.current) window.clearInterval(statusTimer.current)
      let tries = 0
      statusTimer.current = window.setInterval(async () => {
        tries++
        await loadStatus(); await loadQr()
        if (tries >= 90 || waStatus?.status === 'connected') {
          if (statusTimer.current) window.clearInterval(statusTimer.current)
          statusTimer.current = null
        }
      }, 1000)
    } catch { setConnecting(false); toast.error('Gagal connect') }
  }
  const disconnect = async () => { try { await api.post('/wa-gateway/logout'); setConnecting(false); setQrImage(null); toast.success('Disconnect diminta'); setTimeout(loadStatus, 1000) } catch { toast.error('Gagal disconnect') } }
  const openQr = async () => {
    try {
      const r = await api.get('/wa-gateway/qr-image')
      if (!r.data.image) return toast.error('QR belum tersedia; tunggu beberapa detik lalu refresh')
      setQrImage(r.data.image)
      const w=window.open('','_blank'); w?.document.write(`<img src="${r.data.image}" style="width:280px"><p>Scan QR WhatsApp ini</p>`)
    } catch { toast.error('QR belum tersedia; tunggu beberapa detik lalu refresh') }
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
      if (res.data.success || res.data.queued) toast.success(res.data.message || 'Pesan masuk antrean kirim')
      else toast.error(res.data.error || res.data.reason || 'Gagal kirim')
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

      {config.provider === 'baileys' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3">
          <h2 className="text-lg font-bold text-gray-800">Device Baileys</h2>
          <p className="text-sm text-gray-500">Status: <b>{waStatus?.status || 'disconnected'}</b> {waStatus?.phone ? `· ${waStatus.phone}` : ''}</p>
          {waStatus?.last_error && <p className="text-xs text-red-600">{waStatus.last_error}</p>}
          {(qrImage || waStatus?.has_qr) && (
            <div className="rounded-xl border bg-white p-3 w-fit">
              {qrImage ? <img src={qrImage} alt="QR WhatsApp" className="w-[280px] max-w-full" /> : <p className="text-sm text-gray-500">QR tersedia. Klik Scan QR atau tunggu dimuat.</p>}
              <p className="text-xs text-gray-500 text-center mt-2">WhatsApp → Perangkat tertaut → Tautkan perangkat</p>
            </div>
          )}
          {connecting && !qrImage && <p className="text-sm text-amber-600">Menyiapkan QR WhatsApp…</p>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={connect} disabled={connecting} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">{connecting ? 'Connecting…' : 'Connect Device'}</button>
            <button onClick={disconnect} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Disconnect Device</button>
            <button onClick={openQr} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Scan QR</button>
            <button onClick={() => { loadStatus(); loadQr() }} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">Refresh Status</button>
          </div>
        </div>
      )}

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
