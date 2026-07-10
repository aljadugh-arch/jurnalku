import { useState, useEffect } from 'react'
import { Globe, CheckCircle, AlertTriangle, Loader2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function DomainSetupPage() {
  const [info, setInfo] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/tenant/domain-status').then(r => {
      setInfo(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const verifyDomain = async () => {
    setChecking(true)
    setResult(null)
    try {
      const res = await api.post('/tenant/verify-domain')
      setResult(res.data)
      if (res.data.success) {
        toast.success('Domain berhasil diaktifkan!')
        // Refresh info
        const updated = await api.get('/tenant/domain-status')
        setInfo(updated.data)
      }
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.error || 'Gagal verifikasi' })
    } finally { setChecking(false) }
  }

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin text-primary" size={24} /></div>

  if (!info?.domain_custom) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="text-center py-12">
          <Globe size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Belum Ada Domain Custom</h2>
          <p className="text-gray-500 text-sm">Anda menggunakan subdomain <b>{info?.slug || '...'}.jurnal.cc.cd</b></p>
          <p className="text-gray-400 text-xs mt-1">Untuk menggunakan domain sendiri, hubungi admin.</p>
        </div>
      </div>
    )
  }

  const isActive = info.domain_status === 'active'
  const isError = info.domain_status === 'error'

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Globe size={24} className="text-primary" />
          Pengaturan Domain
        </h1>
        <p className="text-gray-500 text-sm mt-1">Kelola domain custom lembaga Anda</p>
      </div>

      {/* Status */}
      <div className={`rounded-xl p-4 border ${isActive ? 'bg-green-50 border-green-200' : isError ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-3">
          {isActive ? <CheckCircle className="text-green-600" size={24} /> :
           <AlertTriangle className={isError ? 'text-red-500' : 'text-amber-500'} size={24} />}
          <div>
            <p className="font-semibold text-gray-800">
              {isActive ? 'Domain Aktif' : isError ? 'Gagal Aktivasi' : 'Menunggu Pengaturan DNS'}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">
              <code className="bg-white/60 px-1.5 py-0.5 rounded text-xs">{info.domain_custom}</code>
            </p>
          </div>
        </div>
        {isActive && (
          <a href={`https://${info.domain_custom}`} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-900 font-medium">
            Buka domain Anda <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* DNS Instructions (pending / error state) */}
      {!isActive && (
        <>
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">1. Atur DNS Domain Anda</h3>
            <p className="text-sm text-gray-600">Di panel pengelola DNS domain Anda, tambahkan record berikut:</p>
            <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm space-y-1 border">
              <div><span className="text-gray-400">Type:</span> <span className="font-semibold">A</span></div>
              <div><span className="text-gray-400">Name/Host:</span> <span className="font-semibold">jurnal</span></div>
              <div><span className="text-gray-400">Value:</span> <span className="font-semibold text-primary">129.226.82.94</span></div>
              <div><span className="text-gray-400">TTL:</span> 300</div>
            </div>
            <p className="text-xs text-gray-400">Jika domain Anda langsung (bukan subdomain), gunakan <code>@</code> sebagai Name.</p>
          </div>

          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="font-semibold text-gray-800">2. Verifikasi & Aktifkan</h3>
            <p className="text-sm text-gray-600">Setelah DNS teratur (tunggu ~5 menit), klik tombol di bawah untuk verifikasi dan pasang SSL otomatis.</p>
            <button onClick={verifyDomain} disabled={checking}
              className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-2">
              {checking ? <><Loader2 size={16} className="animate-spin" /> Mengecek DNS & Mengaktifkan...</> : 'Verifikasi & Aktifkan Domain'}
            </button>
          </div>
        </>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl p-4 border text-sm ${result.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <p className="font-medium">{result.message}</p>
          {result.current_ips?.length > 0 && (
            <p className="text-xs mt-1 opacity-75">IP terdeteksi: {result.current_ips.join(', ')}</p>
          )}
          {result.expected_ip && !result.success && (
            <p className="text-xs mt-1 opacity-75">IP yang diharapkan: {result.expected_ip}</p>
          )}
        </div>
      )}
    </div>
  )
}
