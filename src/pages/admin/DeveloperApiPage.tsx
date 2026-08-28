import { useEffect, useState } from 'react'
import { Check, Clipboard, Code2, KeyRound, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

type ApiKeyRow = {
  id: string
  name: string
  permissions: string[]
  enabled: boolean | number
  created_at: string
  expires_at: string
  last_used_at?: string
  usage_count?: number
}

const endpoints = [
  ['GET', '/api/external/v1/tenant/info', 'Informasi tenant/lembaga'],
  ['GET', '/api/external/v1/siswa', 'Daftar siswa; filter page, limit, search, rombel_id, status'],
  ['GET', '/api/external/v1/siswa/:id', 'Detail satu siswa'],
  ['GET', '/api/external/v1/gtk', 'Daftar guru dan tenaga kependidikan'],
  ['GET', '/api/external/v1/absensi', 'Absensi; filter tanggal, rombel_id, siswa_id'],
  ['GET', '/api/external/v1/nilai', 'Nilai; filter siswa, mapel, rombel, semester, tahun ajaran'],
  ['GET', '/api/external/v1/jadwal', 'Jadwal pelajaran'],
  ['GET', '/api/external/v1/rombel', 'Rombongan belajar'],
  ['GET', '/api/external/v1/mapel', 'Mata pelajaran aktif'],
  ['GET', '/api/external/v1/tagihan', 'Tagihan siswa'],
  ['GET', '/api/external/v1/pembayaran', 'Riwayat pembayaran'],
  ['GET', '/api/external/v1/cashless/balance/:student_id', 'Saldo cashless siswa'],
  ['GET', '/api/external/v1/cashless/transactions/:student_id', 'Transaksi cashless siswa'],
  ['POST', '/api/external/webhook/cashless', 'Kredit/debit cashless dengan idempotency key'],
] as const

export default function DeveloperApiPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [name, setName] = useState('Integrasi Development')
  const [days, setDays] = useState(365)
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [copied, setCopied] = useState(false)

  const load = async () => {
    try { setKeys((await api.get('/external/api-keys')).data || []) }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memuat API key') }
  }
  useEffect(() => { void load() }, [])

  const createKey = async () => {
    if (!name.trim()) return toast.error('Nama API key wajib diisi')
    setCreating(true)
    try {
      const response = await api.post('/external/api-keys', { name: name.trim(), expires_in_days: days, permissions: ['read'] })
      setNewKey(response.data.api_key)
      await load()
      toast.success('API key berhasil dibuat')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal membuat API key') }
    finally { setCreating(false) }
  }

  const revoke = async (id: string) => {
    if (!confirm('Cabut API key ini? Integrasi yang memakainya akan berhenti.')) return
    try {
      await api.delete(`/external/api-keys/${id}`)
      setKeys(current => current.filter(key => key.id !== id))
      toast.success('API key dicabut')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal mencabut API key') }
  }

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const example = `curl -H "X-API-Key: YOUR_API_KEY" \\\n  "${window.location.origin}/api/external/v1/siswa?page=1&limit=20"`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800 dark:text-white"><Code2 className="text-primary" /> REST API Developer</h1>
        <p className="mt-1 text-sm text-gray-500">Integrasikan aplikasi eksternal dengan data tenant ini secara terisolasi.</p>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white"><Plus size={18} /> Buat API Key</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
          <input aria-label="Nama API key" value={name} onChange={e => setName(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="Nama integrasi" />
          <input aria-label="Masa berlaku hari" type="number" min="1" max="3650" value={days} onChange={e => setDays(Number(e.target.value))} className="rounded-lg border px-3 py-2 text-sm" />
          <button type="button" onClick={createKey} disabled={creating} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{creating ? 'Membuat...' : 'Buat Key'}</button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Key baru memiliki izin baca. API key hanya ditampilkan satu kali; simpan di password manager atau secret manager.</p>
        {newKey && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-900">API key baru — salin sekarang</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs text-emerald-300">{newKey}</code>
              <button type="button" aria-label="Salin API key" onClick={() => copy(newKey)} className="rounded-lg border bg-white p-3 text-gray-700">{copied ? <Check size={17} /> : <Clipboard size={17} />}</button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white"><KeyRound size={18} /> API Key Aktif</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-gray-500"><tr><th className="py-2">Nama</th><th>Izin</th><th>Kedaluwarsa</th><th>Terakhir dipakai</th><th>Penggunaan</th><th /></tr></thead>
            <tbody>
              {keys.map(key => <tr key={key.id} className="border-b last:border-0"><td className="py-3 font-medium">{key.name}</td><td>{key.permissions.join(', ')}</td><td>{key.expires_at ? new Date(key.expires_at).toLocaleDateString('id-ID') : '-'}</td><td>{key.last_used_at ? new Date(key.last_used_at).toLocaleString('id-ID') : 'Belum'}</td><td>{key.usage_count || 0}</td><td className="text-right"><button type="button" aria-label={`Cabut ${key.name}`} onClick={() => revoke(key.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></td></tr>)}
              {!keys.length && <tr><td colSpan={6} className="py-8 text-center text-gray-400">Belum ada API key.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-semibold text-gray-800 dark:text-white">Autentikasi dan Base URL</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Kirim key lewat header <code className="rounded bg-gray-100 px-1.5 py-0.5">X-API-Key</code>. Base URL mengikuti domain lembaga: <code className="break-all">{window.location.origin}/api/external</code>.</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-emerald-300"><code>{example}</code></pre>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-semibold text-gray-800 dark:text-white">Endpoint tersedia</h2>
        <div className="mt-4 space-y-2">
          {endpoints.map(([method, endpoint, description]) => <div key={`${method}-${endpoint}`} className="grid gap-1 rounded-lg border p-3 sm:grid-cols-[60px_minmax(260px,1fr)_1fr] sm:items-center"><span className={`w-fit rounded px-2 py-1 text-[11px] font-bold ${method === 'GET' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{method}</span><code className="overflow-x-auto text-xs text-gray-800 dark:text-gray-200">{endpoint}</code><span className="text-xs text-gray-500">{description}</span></div>)}
        </div>
      </section>
    </div>
  )
}
