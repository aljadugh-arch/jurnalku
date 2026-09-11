import { useEffect, useState } from 'react'
import { Sparkles, Save, Key, LogIn, LogOut, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

type Scope = 'tenant' | 'me'

type AiConfig = {
  provider: string
  model: string
  hasApiKey: boolean
  apiKeyMasked: string
  customEndpoint?: string
  googleConnected?: boolean
  googleEmail?: string
}

const PROVIDERS = [
  { value: 'gemini', label: 'Google Gemini', hint: 'gemini-2.0-flash, gemini-1.5-pro, dll' },
  { value: 'openai', label: 'OpenAI ChatGPT', hint: 'gpt-4o-mini, gpt-4o, dll' },
  { value: 'custom', label: 'Provider Lain (kompatibel OpenAI)', hint: 'Endpoint custom / self-hosted' },
]

export default function AiSettingsCard({ scope, title, description }: { scope: Scope; title: string; description: string }) {
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [provider, setProvider] = useState('gemini')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const url = scope === 'tenant' ? '/ai-config/tenant' : '/ai-config/me'

  const load = () => {
    setLoading(true)
    api.get(url).then(({ data }) => {
      setCfg(data)
      setProvider(data.provider || 'gemini')
      setModel(data.model || '')
      setCustomEndpoint(data.customEndpoint || '')
    }).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put(url, { provider, apiKey, model, customEndpoint })
      toast.success('Konfigurasi AI berhasil disimpan')
      setApiKey('')
      load()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal menyimpan konfigurasi AI')
    } finally { setSaving(false) }
  }

  const clearOverride = async () => {
    if (!confirm('Hapus konfigurasi AI personal? Sistem akan kembali memakai pengaturan default lembaga.')) return
    try {
      await api.delete('/ai-config/me')
      toast.success('Konfigurasi personal dihapus, kembali ke default lembaga')
      load()
    } catch { toast.error('Gagal menghapus konfigurasi') }
  }

  const connectGoogle = async () => {
    setConnecting(true)
    try {
      const { data } = await api.get('/ai-config/google/start')
      const popup = window.open(data.url, '_blank', 'width=520,height=650')
      const timer = setInterval(() => {
        if (popup?.closed) { clearInterval(timer); setConnecting(false); load() }
      }, 1000)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Google OAuth belum dikonfigurasi administrator sistem')
      setConnecting(false)
    }
  }

  const disconnectGoogle = async () => {
    try {
      await api.delete('/ai-config/google')
      toast.success('Akun Google berhasil diputus')
      load()
    } catch { toast.error('Gagal memutus akun Google') }
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400'

  if (loading) return <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles size={20} /></span>
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-slate-100">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{description}</p>
        </div>
      </div>

      {scope === 'me' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Hubungkan Akun Google (opsional)</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Menampilkan identitas akun Google Anda di sistem. Catatan: berlangganan Gemini Pro pribadi tidak memberi akses API — untuk memakai AI, tetap wajib isi API Key Gemini di bawah (didapat gratis dari Google AI Studio, terpisah dari langganan Gemini Pro).</p>
          {cfg?.googleConnected ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3.5 py-2.5 dark:bg-emerald-950/30">
              <span className="text-sm text-emerald-700 dark:text-emerald-300">Terhubung sebagai <strong>{cfg.googleEmail}</strong></span>
              <button onClick={disconnectGoogle} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm dark:bg-slate-900"><LogOut size={14} /> Putuskan</button>
            </div>
          ) : (
            <button onClick={connectGoogle} disabled={connecting} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700">
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Hubungkan Akun Google
            </button>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-slate-200">{scope === 'tenant' ? 'API Key Default Lembaga' : 'API Key Personal (opsional, override default lembaga)'}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label><span className={labelClass}>Provider</span>
            <select className={inputClass} value={provider} onChange={e => setProvider(e.target.value)}>
              {scope === 'me' && <option value="">— Pakai default lembaga —</option>}
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label><span className={labelClass}>Model (opsional)</span><input className={inputClass} value={model} onChange={e => setModel(e.target.value)} placeholder={provider === 'gemini' ? 'gemini-2.0-flash' : provider === 'openai' ? 'gpt-4o-mini' : 'nama-model'} /></label>
          {provider === 'custom' && <label className="sm:col-span-2"><span className={labelClass}>Endpoint Custom</span><input className={inputClass} value={customEndpoint} onChange={e => setCustomEndpoint(e.target.value)} placeholder="https://api.provider-anda.com/v1" /></label>}
          <label className="sm:col-span-2"><span className={labelClass}>API Key</span>
            <div className="relative">
              <Key size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="password" className={`${inputClass} pl-9`} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={cfg?.hasApiKey ? `Tersimpan: ${cfg.apiKeyMasked} (kosongkan jika tidak diubah)` : 'Masukkan API key'} />
            </div>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Simpan
        </button>
        {scope === 'me' && (cfg?.hasApiKey || cfg?.googleConnected) && (
          <button onClick={clearOverride} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 dark:border-slate-700 dark:text-slate-300">Hapus Override Personal</button>
        )}
      </div>
    </div>
  )
}
