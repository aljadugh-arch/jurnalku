import { useState, useEffect, useRef } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { MoreVertical, ExternalLink, Ban, CheckCircle2, Globe2, Link2, ArrowLeftRight, KeyRound, Repeat } from 'lucide-react'

type PlanRow = {
  plan: string
  label: string
  harga: number
  masa_nilai: number
  masa_satuan: 'bulan' | 'hari' | string
  aktif: 0 | 1
  urutan: number
  fitur?: string[]
}

const PLAN_DESC: Record<string, string> = {
  trial: 'Masa percobaan — otomatis terkunci saat masa aktif habis',
  lite: 'Berbayar dasar — tanpa Backup ke Drive & Kelola Website Lembaga',
  pro: 'Berbayar lengkap — semua fitur aktif, tidak ada batasan modul',
  premium: 'Paket tertinggi — semua fitur aktif tanpa batasan',
}

const rupiah = (n: number) => 'Rp' + Number(n || 0).toLocaleString('id-ID')
const masaText = (p: { masa_nilai: number; masa_satuan: string }) => `${p.masa_nilai} ${p.masa_satuan}`

// Cadangan bila daftar paket belum termuat — nilai harus sama dengan seed di server.
const FALLBACK_PLANS: PlanRow[] = [
  { plan: 'trial', label: 'Trial', harga: 0, masa_nilai: 1, masa_satuan: 'bulan', aktif: 1, urutan: 0 },
  { plan: 'lite', label: 'Lite', harga: 50000, masa_nilai: 1, masa_satuan: 'bulan', aktif: 1, urutan: 1 },
  { plan: 'pro', label: 'Pro', harga: 80000, masa_nilai: 1, masa_satuan: 'bulan', aktif: 1, urutan: 2 },
  { plan: 'premium', label: 'Premium', harga: 150000, masa_nilai: 1, masa_satuan: 'bulan', aktif: 1, urutan: 3 },
]

// Nama fitur (selaras dengan FeatureSettings) untuk editor fitur per paket.
const FEATURE_LABELS: Record<string, string> = {
  master_data: 'Data Master',
  jadwal: 'Jadwal',
  absensi: 'Absensi',
  jurnal: 'Jurnal Mengajar',
  penilaian: 'Penilaian & Rapor',
  keuangan: 'Keuangan',
  whatsapp: 'WhatsApp',
  posting: 'Posting',
  modul_ajar: 'Modul Ajar',
  backup_drive: 'Backup Google Drive',
  website: 'Website Lembaga',
  cashless: 'Cashless',
  ekantin: 'E-Kantin',
  rest_api: 'REST API Developer',
}

type PlanDraft = { label: string; harga: number; masa_nilai: number; masa_satuan: string; aktif: boolean; fitur: Record<string, boolean> }

interface Tenant {
  id: string
  slug: string
  nama: string
  domain_custom?: string | null
  domain_status?: string | null
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
  const [domainMode, setDomainMode] = useState<'subdomain' | 'custom'>('subdomain')
  const [form, setForm] = useState({ slug: '', nama: '', email: '', telepon: '', max_siswa: 100, max_gtk: 20, base_domain: 'jurnal.cc.cd', domain_custom: '' })
  const [created, setCreated] = useState<any>(null)
  const [unlock, setUnlock] = useState<{ tenantId: string; tenantName: string; plan: string; months: number } | null>(null)
  const [generatedKey, setGeneratedKey] = useState('')
  const [generating, setGenerating] = useState(false)
  const [changePlan, setChangePlan] = useState<{ tenantId: string; tenantName: string; plan: string; mode: 'extend' | 'set'; masaNilai: number; masaSatuan: string; sampai: string } | null>(null)
  const [savingPlan, setSavingPlan] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [planDraft, setPlanDraft] = useState<Record<string, PlanDraft>>({})
  const [savingPlans, setSavingPlans] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const planRow = (name: string) => plans.find(p => p.plan === name)
  const planLabel = (name: string) => planRow(name)?.label || name
  const planInfo = (name: string) => {
    const p = planRow(name)
    return p ? `${rupiah(p.harga)} / ${masaText(p)}` : ''
  }
  // Paket yang bisa dipilih: hanya yang aktif. Paket non-aktif tetap ikut
  // ditampilkan bila lembaga sedang memakainya, agar kondisinya terlihat.
  const selectablePlans = (current?: string) => {
    const list = plans.length ? plans : FALLBACK_PLANS
    return list.filter(p => p.aktif || p.plan === current)
  }
  // Jumlah lembaga yang memakai sebuah paket — dipakai untuk memperingatkan
  // sebelum paket dinonaktifkan (menonaktifkan = memblokir pemakainya).
  const tenantCountForPlan = (plan: string) => tenants.filter(t => (t.plan || 'trial') === plan).length

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => { loadTenants(); loadPlans() }, [])

  const loadPlans = async () => {
    try {
      const { data } = await api.get('/subscription/plans')
      setPlans(Array.isArray(data?.plans) ? data.plans : [])
    } catch { /* daftar paket opsional untuk tampilan harga */ }
  }

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
      const payload: Record<string, unknown> = { ...form }
      if (domainMode === 'custom') {
        if (!form.domain_custom.trim()) { alert('Domain custom wajib diisi'); return }
        // Domain sendiri: subdomain platform tidak dipakai sebagai alamat publik,
        // tapi backend tetap butuh slug unik sebagai identifier internal.
        if (!payload.slug) payload.slug = form.domain_custom.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
        payload.domain_custom = form.domain_custom.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
        // Dibuat langsung oleh superadmin (bukan lewat verify-domain self-service),
        // jadi domain_status di-set 'active' langsung — DNS/Caddy diasumsikan
        // sudah/akan dipasang manual oleh superadmin sebelum diberitahukan ke lembaga.
        payload.domain_status = 'active'
      } else {
        delete payload.domain_custom
      }
      const { data } = await api.post('/tenants', payload)
      setCreated(data)
      setShowForm(false)
      setDomainMode('subdomain')
      setForm({ slug: '', nama: '', email: '', telepon: '', max_siswa: 100, max_gtk: 20, base_domain: 'jurnal.cc.cd', domain_custom: '' })
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

  const saveChangePlan = async () => {
    if (!changePlan) return
    setSavingPlan(true)
    try {
      const body: Record<string, unknown> = { plan: changePlan.plan }
      if (changePlan.mode === 'extend') {
        body.mode = 'extend'
        if (changePlan.masaNilai) body.masa_nilai = changePlan.masaNilai
        body.masa_satuan = changePlan.masaSatuan
      } else {
        body.mode = 'set'
        if (changePlan.sampai) body.sampai = changePlan.sampai
      }
      const { data } = await api.put(`/subscription/tenant/${changePlan.tenantId}`, body)
      const akhir = data?.ends_at ? new Date(data.ends_at).toLocaleDateString('id-ID') : '-'
      toast.success(`Paket "${changePlan.tenantName}" → ${planLabel(changePlan.plan)} s/d ${akhir}`)
      setChangePlan(null)
      loadTenants()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal mengubah paket langganan') }
    finally { setSavingPlan(false) }
  }

  const openChangePlan = (t: Tenant) => {
    const row = plans.find(p => p.plan === t.plan)
    setChangePlan({
      tenantId: t.id, tenantName: t.nama, plan: t.plan || 'trial',
      mode: 'extend', masaNilai: row?.masa_nilai || 1, masaSatuan: row?.masa_satuan || 'bulan', sampai: '',
    })
    setOpenMenuId(null)
  }

  const openUnlock = (t: Tenant) => {
    setUnlock({ tenantId: t.id, tenantName: t.nama, plan: t.plan || 'lite', months: 1 })
    setGeneratedKey('')
    setOpenMenuId(null)
  }

  const openPlanEditor = () => {
    const draft: Record<string, PlanDraft> = {}
    for (const p of plans) {
      const on = new Set(p.fitur || [])
      draft[p.plan] = {
        label: p.label, harga: p.harga, masa_nilai: p.masa_nilai, masa_satuan: p.masa_satuan,
        aktif: !!p.aktif,
        fitur: Object.fromEntries(Object.keys(FEATURE_LABELS).map(k => [k, on.has(k)])),
      }
    }
    setPlanDraft(draft)
    setShowPlanEditor(true)
  }

  const savePlanEditor = async () => {
    setSavingPlans(true)
    try {
      for (const [plan, d] of Object.entries(planDraft)) {
        await api.put(`/subscription/plans/${plan}`, {
          label: d.label, harga: Number(d.harga) || 0,
          masa_nilai: Number(d.masa_nilai) || 1, masa_satuan: d.masa_satuan,
          aktif: d.aktif, fitur: d.fitur,
        })
      }
      toast.success('Pengaturan paket tersimpan')
      setShowPlanEditor(false)
      loadPlans()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan paket') }
    finally { setSavingPlans(false) }
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
    <div className="space-y-4">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
        <div className="flex items-center gap-2">
          <button onClick={openPlanEditor} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            Pengaturan Paket &amp; Harga
          </button>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">
            {showForm ? 'Batal' : '+ Tambah Lembaga'}
          </button>
        </div>
      </div>

      {created && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800">Lembaga Berhasil Dibuat</h3>
          <div className="mt-2 text-sm text-green-700 space-y-1">
            <p>Nama: <strong>{created.nama}</strong></p>
            <p>URL: <strong>https://{created.domain_custom || `${created.slug}.${created.base_domain || 'jurnal.cc.cd'}`}</strong></p>
            {created.domain_custom && <p className="text-amber-700 text-xs">Pastikan DNS domain ini sudah diarahkan (A record) ke server sebelum diberikan ke lembaga.</p>}
            <p>Email Admin: <strong>{created.admin_email}</strong></p>
            <p>Password awal: <strong>{created.admin_initial_password || created.admin_password}</strong></p>
            <p>Trial: <strong>Gratis satu bulan</strong></p>
          </div>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs text-green-600 underline">Tutup</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
          <h3 className="font-semibold text-lg">Tambah Lembaga Baru</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Domain</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" onClick={() => setDomainMode('subdomain')}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors ${domainMode === 'subdomain' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                <span className={`text-sm font-semibold ${domainMode === 'subdomain' ? 'text-primary' : 'text-gray-700'}`}>Subdomain Platform</span>
                <span className="text-xs text-gray-400">*.jurnal.cc.cd atau *.jurnalmadrasah.web.id — gratis, langsung aktif</span>
              </button>
              <button type="button" onClick={() => setDomainMode('custom')}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors ${domainMode === 'custom' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                <span className={`text-sm font-semibold ${domainMode === 'custom' ? 'text-primary' : 'text-gray-700'}`}>Domain Sendiri</span>
                <span className="text-xs text-gray-400">Domain milik lembaga sendiri — subdomain platform tidak dipakai</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lembaga</label>
              <input type="text" required value={form.nama} onChange={e => setForm({...form, nama: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="SDIT Al-Fatih" />
            </div>
            {domainMode === 'subdomain' ? (
              <>
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
              </>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain Sendiri</label>
                <input type="text" required value={form.domain_custom} onChange={e => setForm({...form, domain_custom: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="jurnal.sekolahku.sch.id" />
                <p className="text-xs text-amber-600 mt-1">
                  Pastikan DNS domain ini (A record) sudah/akan diarahkan ke server sebelum diberikan ke lembaga. Subdomain platform (*.jurnal.cc.cd) tidak akan aktif untuk lembaga ini.
                </p>
              </div>
            )}
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
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nama Lembaga</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Subdomain</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom Domain</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenants.map(t => (
              <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-3 py-2.5 align-top">
                  <div className="font-medium text-gray-900">{t.nama}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{t.email}</div>
                </td>
                <td className="px-3 py-2.5 align-top">
                  {t.domain_custom && t.domain_status === 'active' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400 line-through decoration-gray-300" title="Nonaktif — lembaga sudah pakai domain sendiri">
                      {t.slug}.{t.base_domain || 'jurnal.cc.cd'}
                    </span>
                  ) : (
                    <a href={`https://${t.slug}.${t.base_domain || 'jurnal.cc.cd'}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                      {t.slug}.{t.base_domain || 'jurnal.cc.cd'}
                      <ExternalLink size={12} className="shrink-0 opacity-60" />
                    </a>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top text-sm text-gray-600">
                  {t.domain_custom ? (
                    <div>
                      <a href={`https://${t.domain_custom}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                        {t.domain_custom}
                        <ExternalLink size={12} className="shrink-0 opacity-60" />
                      </a>
                      <div className={`text-[11px] mt-0.5 ${t.domain_status === 'active' ? 'text-green-600' : t.domain_status === 'pending' ? 'text-amber-600' : 'text-red-500'}`}>
                        {t.domain_status === 'active' ? 'Aktif (alamat resmi)' : t.domain_status === 'pending' ? 'Menunggu verifikasi DNS' : t.domain_status || 'Belum aktif'}
                      </div>
                    </div>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${t.plan === 'trial' ? 'bg-amber-50 text-amber-700' : t.plan === 'pro' ? 'bg-blue-50 text-blue-700' : t.plan === 'premium' ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'}`}>
                    {planLabel(t.plan)}
                  </span>
                  {planInfo(t.plan) && <div className="mt-1 whitespace-nowrap text-[11px] text-gray-500">{planInfo(t.plan)}</div>}
                  {(t.subscription_ends_at || t.trial_ends_at) && <div className="mt-1 whitespace-nowrap text-[11px] text-gray-400">s/d {new Date((t.subscription_ends_at || t.trial_ends_at) as string).toLocaleDateString('id-ID')}</div>}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${t.aktif ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${t.aktif ? 'bg-green-500' : 'bg-red-500'}`} />
                    {t.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-top text-right relative">
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
                        onClick={() => openUnlock(t)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <KeyRound size={15} className="text-purple-600" />
                        Buat Kunci Langganan
                      </button>
                      <button
                        onClick={() => openChangePlan(t)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Repeat size={15} className="text-indigo-600" />
                        Ubah Paket Langganan
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
            <div><label className="mb-1 block text-sm font-medium">Paket</label>
              <select value={unlock.plan} onChange={e => setUnlock({ ...unlock, plan: e.target.value })} className="w-full rounded-lg border px-3 py-2">
                {selectablePlans(unlock.plan).map(p => (
                  <option key={p.plan} value={p.plan}>{p.label} — {rupiah(p.harga)}/{p.masa_satuan}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Harga &amp; masa aktif default paket bisa diubah di "Pengaturan Paket &amp; Harga".</p>
            </div>
            <div><label className="mb-1 block text-sm font-medium">Durasi (bulan)</label><input type="number" min="1" max="120" value={unlock.months} onChange={e => setUnlock({ ...unlock, months: Math.max(1, Math.min(120, Number(e.target.value))) })} className="w-full rounded-lg border px-3 py-2" /></div>
            <button disabled={generating} onClick={generateUnlockKey} className="w-full rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">{generating ? 'Membuat...' : 'Generate Kunci'}</button>
          </div> : <div className="mt-5">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center"><p className="text-xs text-green-700">Kunci hanya ditampilkan sekali</p><code className="mt-2 block break-all text-base font-bold text-green-900">{generatedKey}</code></div>
            <button onClick={copyUnlockKey} className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-white">Salin Kunci</button>
          </div>}
          <button onClick={() => setUnlock(null)} className="mt-3 w-full rounded-lg border px-4 py-2 text-gray-600">Tutup</button>
        </div>
      </div>}

      {changePlan && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setChangePlan(null)}>
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
          <h2 className="text-lg font-bold text-gray-900">Ubah Paket Langganan</h2>
          <p className="mt-1 text-sm text-gray-500">{changePlan.tenantName}</p>
          <div className="mt-5 space-y-2">
            {selectablePlans(changePlan.plan).map(p => (
              <label
                key={p.plan}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${changePlan.plan === p.plan ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <input
                  type="radio"
                  name="plan"
                  className="mt-1"
                  checked={changePlan.plan === p.plan}
                  onChange={() => setChangePlan({ ...changePlan, masaNilai: p.masa_nilai, masaSatuan: p.masa_satuan, plan: p.plan })}
                />
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="font-medium text-gray-900">{p.label}</span>
                    <span className="text-xs font-semibold text-primary">{p.harga > 0 ? `${rupiah(p.harga)}/${p.masa_satuan}` : 'Gratis'}</span>
                  </span>
                  <span className="block text-xs text-gray-500">{PLAN_DESC[p.plan] || ''}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 p-3">
            <div className="text-sm font-medium text-gray-800">Masa aktif</div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setChangePlan({ ...changePlan, mode: 'extend' })}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${changePlan.mode === 'extend' ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-gray-200 text-gray-600'}`}>
                Perpanjang dari aktif sekarang
              </button>
              <button type="button" onClick={() => setChangePlan({ ...changePlan, mode: 'set' })}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${changePlan.mode === 'set' ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-gray-200 text-gray-600'}`}>
                Set mulai hari ini
              </button>
            </div>
            {changePlan.mode === 'extend' ? (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-gray-500">Lama</label>
                  <input type="number" min="1" max="3650" value={changePlan.masaNilai}
                    onChange={e => setChangePlan({ ...changePlan, masaNilai: Math.max(1, Number(e.target.value)) })}
                    className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs text-gray-500">Satuan</label>
                  <select value={changePlan.masaSatuan} onChange={e => setChangePlan({ ...changePlan, masaSatuan: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm">
                    <option value="bulan">Bulan</option>
                    <option value="hari">Hari</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-gray-500">Berlaku sampai (kosongkan = pakai masa aktif default paket)</label>
                <input type="date" value={changePlan.sampai}
                  onChange={e => setChangePlan({ ...changePlan, sampai: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">
              "Perpanjang" menambah dari tanggal berakhir yang masih berlaku; "Set mulai hari ini" menghitung ulang dari hari ini.
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={savingPlan} onClick={saveChangePlan} className="flex-1 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">{savingPlan ? 'Menyimpan...' : 'Simpan'}</button>
            <button onClick={() => setChangePlan(null)} className="flex-1 rounded-lg border px-4 py-2 text-gray-600">Batal</button>
          </div>
        </div>
      </div>}
      {showPlanEditor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPlanEditor(false)}>
        <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
          <h2 className="text-lg font-bold text-gray-900">Pengaturan Paket &amp; Harga</h2>
          <p className="mt-1 text-sm text-gray-500">Ubah harga dan masa aktif tiap paket. Berlaku untuk seluruh platform.</p>
          <div className="mt-4 space-y-3">
            {(plans.length ? plans : FALLBACK_PLANS).map(p => {
              const d = planDraft[p.plan] || { label: p.label, harga: p.harga, masa_nilai: p.masa_nilai, masa_satuan: p.masa_satuan }
              const set = (patch: Partial<typeof d>) => setPlanDraft({ ...planDraft, [p.plan]: { ...d, ...patch } })
              return (
                <div key={p.plan} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">{p.label}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] uppercase text-gray-500">{p.plan}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-1 block text-xs text-gray-500">Nama paket</label>
                      <input value={d.label} onChange={e => set({ label: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-1 block text-xs text-gray-500">Harga (Rp) / satuan</label>
                      <input type="number" min="0" value={d.harga} onChange={e => set({ harga: Number(e.target.value) })} className="w-full rounded-lg border px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Masa aktif</label>
                      <input type="number" min="1" max="3650" value={d.masa_nilai} onChange={e => set({ masa_nilai: Number(e.target.value) })} className="w-full rounded-lg border px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Satuan</label>
                      <select value={d.masa_satuan} onChange={e => set({ masa_satuan: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm">
                        <option value="bulan">Bulan</option>
                        <option value="hari">Hari</option>
                      </select>
                    </div>
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={d.aktif} onChange={e => set({ aktif: e.target.checked })} />
                    <span>
                      Paket aktif (bisa dipilih saat mengubah langganan lembaga)
                      {d.aktif ? (
                        <span className="block text-xs text-gray-400">{tenantCountForPlan(p.plan)} lembaga memakai paket ini</span>
                      ) : (
                        <span className="block text-xs font-medium text-amber-600">
                          Non-aktif — {tenantCountForPlan(p.plan)} lembaga yang memakai paket ini akan TERKUNCI (tidak bisa memakai aplikasi)
                        </span>
                      )}
                    </span>
                  </label>
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">Fitur yang diizinkan</span>
                      <div className="flex gap-2 text-[11px]">
                        <button type="button" className="text-primary hover:underline"
                          onClick={() => set({ fitur: Object.fromEntries(Object.keys(FEATURE_LABELS).map(k => [k, true])) })}>Pilih semua</button>
                        <button type="button" className="text-gray-500 hover:underline"
                          onClick={() => set({ fitur: Object.fromEntries(Object.keys(FEATURE_LABELS).map(k => [k, false])) })}>Kosongkan</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {Object.entries(FEATURE_LABELS).map(([key, name]) => (
                        <label key={key} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5 text-xs text-gray-700">
                          <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={!!d.fitur[key]}
                            onChange={e => set({ fitur: { ...d.fitur, [key]: e.target.checked } })} />
                          {name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={savingPlans} onClick={savePlanEditor} className="flex-1 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">{savingPlans ? 'Menyimpan...' : 'Simpan Semua Paket'}</button>
            <button onClick={() => setShowPlanEditor(false)} className="flex-1 rounded-lg border px-4 py-2 text-gray-600">Batal</button>
          </div>
        </div>
      </div>}
    </div>
  )
}
