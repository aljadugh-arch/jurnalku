import { useState, useEffect, useRef } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { MoreVertical, ExternalLink, Ban, CheckCircle2, Globe2, Link2, ArrowLeftRight, KeyRound } from 'lucide-react'

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
  base_domain?: string | null
  [key: string]: unknown
}

const BASE_DOMAIN_OPTIONS = ['jurnal.cc.cd', 'jurnalmadrasah.web.id']

export default function TenantManagementPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ slug: '', nama: '', email: '', telepon: '', max_siswa: 100, max_gtk: 20, base_domain: 'jurnal.cc.cd' })
  const [created, setCreated] = useState<any>(null)
  const [unlock, setUnlock] = useState<{ tenantId: string; tenantName: string; plan: 'lite' | 'pro'; months: number } | null>(null)
  const [generatedKey, setGeneratedKey] = useState('')
  const [generating, setGenerating] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

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
      setForm({ slug: '', nama: '', email: '', telepon: '', max_siswa: 100, max_gtk: 20, base_domain: 'jurnal.cc.cd' })
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

  const changeSlug = async (t: Tenant) => {
    const currentBase = t.base_domain || 'jurnal.cc.cd'
    const newSlug = window.prompt(
      `Ganti subdomain untuk "${t.nama}"\nSubdomain saat ini: ${t.slug}.${currentBase}\n\nMasukkan slug baru (huruf kecil, angka, dash saja):`,
      t.slug
    )
    if (!newSlug || newSlug.trim() === '' || newSlug === t.slug) return
    try {
      await api.put(`/tenants/${t.id}`, { slug: newSlug })
      alert(`Subdomain diganti menjadi: ${newSlug}.${currentBase}\n\nBeri tahu pengguna lembaga untuk memakai URL baru ini.`)
      loadTenants()
    } catch (e: any) { alert(e.response?.data?.error || 'Gagal ganti subdomain') }
  }

  const changeBaseDomain = async (t: Tenant) => {
    const next = t.base_domain === 'jurnal.cc.cd' ? 'jurnalmadrasah.web.id' : 'jurnal.cc.cd'
    if (!window.confirm(`Pindahkan domain utama "${t.nama}" ke ${next}?\n\nURL baru: https://${t.slug}.${next}`)) return
    try {
      await api.put(`/tenants/${t.id}`, { base_domain: next })
      loadTenants()
    } catch (e: any) { alert(e.response?.data?.error || 'Gagal ganti domain utama') }
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
            <p>URL: <strong>https://{created.slug}.{created.base_domain || 'jurnal.cc.cd'}</strong></p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain Utama</label>
              <select value={form.base_domain} onChange={e => setForm({...form, base_domain: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
                {BASE_DOMAIN_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug (subdomain)</label>
              <div className="flex items-center">
                <input type="text" required value={form.slug} onChange={e => setForm({...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                  className="w-full px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="sdit-alfatih" />
                <span className="px-3 py-2 bg-gray-100 border border-l-0 rounded-r-lg text-sm text-gray-500">.{form.base_domain}</span>
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
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nama Lembaga</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Subdomain</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom Domain</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenants.map(t => (
              <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-4 py-3.5 align-top">
                  <div className="font-medium text-gray-900">{t.nama}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{t.email}</div>
                </td>
                <td className="px-4 py-3.5 align-top">
                  <a href={`https://${t.slug}.${t.base_domain || 'jurnal.cc.cd'}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    {t.slug}.{t.base_domain || 'jurnal.cc.cd'}
                    <ExternalLink size={12} className="shrink-0 opacity-60" />
                  </a>
                </td>
                <td className="px-4 py-3.5 align-top text-sm text-gray-600">
                  {t.domain_custom || <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3.5 align-top">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${t.plan === 'trial' ? 'bg-amber-50 text-amber-700' : t.plan === 'pro' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                    {t.plan}
                  </span>
                  {(t.subscription_ends_at || t.trial_ends_at) && <div className="mt-1 whitespace-nowrap text-[11px] text-gray-400">s/d {new Date((t.subscription_ends_at || t.trial_ends_at) as string).toLocaleDateString('id-ID')}</div>}
                </td>
                <td className="px-4 py-3.5 align-top">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${t.aktif ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${t.aktif ? 'bg-green-500' : 'bg-red-500'}`} />
                    {t.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3.5 align-top text-right relative">
                  <button
                    onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    aria-label="Aksi lembaga"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {openMenuId === t.id && (
                    <div ref={menuRef} className="absolute right-4 top-11 z-20 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 text-left">
                      <button
                        onClick={() => { toggleTenant(t.id, t.aktif); setOpenMenuId(null) }}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-gray-50 ${t.aktif ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {t.aktif ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                        {t.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        onClick={() => { setCustomDomain(t.id); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Globe2 size={15} className="text-blue-600" />
                        Set Custom Domain
                      </button>
                      <button
                        onClick={() => { changeSlug(t); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Link2 size={15} className="text-amber-600" />
                        Ganti Subdomain
                      </button>
                      <button
                        onClick={() => { changeBaseDomain(t); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <ArrowLeftRight size={15} className="text-teal-600" />
                        Pindah Domain Utama
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        onClick={() => { setUnlock({ tenantId: t.id, tenantName: t.nama, plan: 'lite', months: 1 }); setGeneratedKey(''); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <KeyRound size={15} className="text-purple-600" />
                        Buat Kunci Langganan
                      </button>
                    </div>
                  )}
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
