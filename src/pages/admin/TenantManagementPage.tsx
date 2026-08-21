import { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

interface Tenant {
  id: string
  slug: string
  nama: string
  domain_custom?: string | null
  email?: string | null
  telepon?: string | null
  plan: 'trial' | 'lite' | 'pro' | string
  trial_ends_at?: string | null
  subscription_ends_at?: string | null
  aktif: 0 | 1 | boolean
  [key: string]: unknown
}

export default function TenantManagementPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ slug: '', nama: '', email: '', telepon: '', max_siswa: 100, max_gtk: 20 })
  const [created, setCreated] = useState<any>(null)
  const [unlock, setUnlock] = useState<{ tenantId: string; tenantName: string; plan: 'lite' | 'pro'; months: number } | null>(null)
  const [generatedKey, setGeneratedKey] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => { loadTenants() }, [])

  const loadTenants = async () => {
    try {
      const { data } = await api.get('/tenants')
      setTenants(Array.isArray(data) ? (data as Tenant[]) : [])
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/tenants', form)
      setCreated(data)
      setShowForm(false)
      setForm({ slug: '', nama: '', email: '', telepon: '', max_siswa: 100, max_gtk: 20 })
      loadTenants()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Gagal membuat tenant')
    }
  }

  const toggleTenant = async (id: string, aktif: boolean | number) => {
    try {
      await api.put(`/tenants/${id}`, { aktif: aktif ? 0 : 1 })
      loadTenants()
    } catch (e) { alert('Gagal update status') }
  }

  const setCustomDomain = async (id: string) => {
    const domain = window.prompt('Masukkan custom domain (contoh: jurnal.sekolahku.sch.id):')
    if (!domain) return
    try {
      await api.put(`/tenants/${id}/domain`, { domain_custom: domain })
      loadTenants()
    } catch (e: any) { alert(e.response?.data?.error || 'Gagal set domain') }
  }

  const generateUnlockKey = async () => {
    if (!unlock) return
    setGenerating(true)
    try {
      const { data } = await api.post(`/tenants/${unlock.tenantId}/unlock-keys`, { plan: unlock.plan, months: unlock.months })
      setGeneratedKey(data.code)
      toast.success('Kunci unlock berhasil dibuat')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal membuat kunci unlock') }
    finally { setGenerating(false) }
  }

  const copyUnlockKey = async () => {
    await navigator.clipboard.writeText(generatedKey)
    toast.success('Kunci disalin')
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  const totalTenants = tenants.length
  const activeTenants = tenants.filter(t => t.aktif).length
  const totalUsers = tenants.reduce((sum, t) => sum + (Number(t.user_count) || 0), 0)
  const totalSiswa = tenants.reduce((sum, t) => sum + (Number(t.siswa_count) || 0), 0)

  return (
    <div className="space-y-6">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Total Lembaga</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalTenants}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Lembaga Aktif</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{activeTenants}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Total Pengguna</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalUsers}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Total Siswa</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalSiswa}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800">Manajemen Lembaga</h1>
          <p className="text-gray-500 mt-1">Kelola lembaga/tenant yang terdaftar di platform</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">
          {showForm ? 'Batal' : '+ Tambah Lembaga'}
        </button>
      </div>

      {created && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800">Lembaga Berhasil Dibuat</h3>
          <div className="mt-2 text-sm text-green-700 space-y-1">
            <p>Nama: <strong>{created.nama}</strong></p>
            <p>URL: <strong>https://{created.slug}.jurnalmadrasah.web.id</strong></p>
            <p>Email Admin: <strong>{created.admin_email}</strong></p>
            <p>Password awal: <strong>{created.admin_initial_password || created.admin_password}</strong></p>
            <p>Trial: <strong>Gratis satu bulan</strong></p>
          </div>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs text-green-600 underline">Tutup</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <h3 className="font-semibold text-lg">Tambah Lembaga Baru</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lembaga</label>
              <input type="text" required value={form.nama} onChange={e => setForm({...form, nama: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="SDIT Al-Fatih" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug (subdomain)</label>
              <div className="flex items-center">
                <input type="text" required value={form.slug} onChange={e => setForm({...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                  className="w-full px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="sdit-alfatih" />
                <span className="px-3 py-2 bg-gray-100 border border-l-0 rounded-r-lg text-sm text-gray-500">.jurnalmadrasah.web.id</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Admin</label>
              <input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="admin@sekolah.sch.id" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
              <input type="text" value={form.telepon} onChange={e => setForm({...form, telepon: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="08123456789" />
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Lembaga baru otomatis mendapat trial gratis selama satu bulan.
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maks Siswa</label>
              <input type="number" value={form.max_siswa} onChange={e => setForm({...form, max_siswa: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
          </div>
          <button type="submit" className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">Buat Lembaga</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lembaga</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subdomain</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Custom Domain</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{t.nama}</div>
                  <div className="text-xs text-gray-500">{t.email}</div>
                </td>
                <td className="px-4 py-3">
                  <a href={`https://${t.slug}.jurnalmadrasah.web.id`} target="_blank" rel="noreferrer" className="text-primary text-sm hover:underline">
                    {t.slug}.jurnalmadrasah.web.id
                  </a>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {t.domain_custom || <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.plan === 'trial' ? 'bg-amber-100 text-amber-700' : t.plan === 'pro' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {t.plan}
                  </span>
                  {(t.subscription_ends_at || t.trial_ends_at) && <div className="mt-1 whitespace-nowrap text-[11px] text-gray-500">s/d {new Date((t.subscription_ends_at || t.trial_ends_at) as string).toLocaleDateString('id-ID')}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.aktif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {t.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => toggleTenant(t.id, t.aktif)} className={`text-xs px-2 py-1 rounded ${t.aktif ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                      {t.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button onClick={() => setCustomDomain(t.id)} className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">Set Domain</button>
                    <button onClick={() => { setUnlock({ tenantId: t.id, tenantName: t.nama, plan: 'lite', months: 1 }); setGeneratedKey('') }} className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100">Buat Kunci</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {tenants.length === 0 && <div className="p-8 text-center text-gray-400">Belum ada lembaga terdaftar</div>}
      </div>

      {unlock && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setUnlock(null)}>
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
          <h2 className="text-lg font-bold text-gray-900">Kunci Langganan</h2>
          <p className="mt-1 text-sm text-gray-500">{unlock.tenantName}</p>
          {!generatedKey ? <div className="mt-5 space-y-4">
            <div><label className="mb-1 block text-sm font-medium">Paket</label><select value={unlock.plan} onChange={e => setUnlock({ ...unlock, plan: e.target.value as 'lite' | 'pro' })} className="w-full rounded-lg border px-3 py-2"><option value="lite">Lite — Rp50.000/bulan</option><option value="pro">Pro — Rp80.000/bulan</option></select></div>
            <div><label className="mb-1 block text-sm font-medium">Durasi (bulan)</label><input type="number" min="1" max="24" value={unlock.months} onChange={e => setUnlock({ ...unlock, months: Math.max(1, Math.min(24, Number(e.target.value))) })} className="w-full rounded-lg border px-3 py-2" /></div>
            <button disabled={generating} onClick={generateUnlockKey} className="w-full rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">{generating ? 'Membuat...' : 'Generate Kunci'}</button>
          </div> : <div className="mt-5">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center"><p className="text-xs text-green-700">Kunci hanya ditampilkan sekali</p><code className="mt-2 block break-all text-base font-bold text-green-900">{generatedKey}</code></div>
            <button onClick={copyUnlockKey} className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-white">Salin Kunci</button>
          </div>}
          <button onClick={() => setUnlock(null)} className="mt-3 w-full rounded-lg border px-4 py-2 text-gray-600">Tutup</button>
        </div>
      </div>}
    </div>
  )
}
