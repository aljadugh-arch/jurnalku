import { useState, useEffect } from 'react'
import api from '../../services/api'

export default function TenantManagementPage() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ slug: '', nama: '', email: '', telepon: '', plan: 'free', max_siswa: 100, max_gtk: 20 })
  const [created, setCreated] = useState(null)

  useEffect(() => { loadTenants() }, [])

  const loadTenants = async () => {
    try {
      const { data } = await api.get('/tenants')
      setTenants(data)
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/tenants', form)
      setCreated(data)
      setShowForm(false)
      setForm({ slug: '', nama: '', email: '', telepon: '', plan: 'free', max_siswa: 100, max_gtk: 20 })
      loadTenants()
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal membuat tenant')
    }
  }

  const toggleTenant = async (id, aktif) => {
    try {
      await api.put(`/tenants/${id}`, { aktif: aktif ? 0 : 1 })
      loadTenants()
    } catch (e) { alert('Gagal update status') }
  }

  const setCustomDomain = async (id) => {
    const domain = prompt('Masukkan custom domain (contoh: jurnal.sekolahku.sch.id):')
    if (!domain) return
    try {
      await api.put(`/tenants/${id}/domain`, { domain_custom: domain })
      loadTenants()
    } catch (e) { alert(e.response?.data?.error || 'Gagal set domain') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  const totalTenants = tenants.length
  const activeTenants = tenants.filter(t => t.aktif).length
  const totalUsers = tenants.reduce((sum, t) => sum + (t.user_count || 0), 0)
  const totalSiswa = tenants.reduce((sum, t) => sum + (t.siswa_count || 0), 0)

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
            <p>URL: <strong>https://{created.slug}.jurnal.cc.cd</strong></p>
            <p>Email Admin: <strong>{created.admin_email}</strong></p>
            <p>Password: <strong>{created.admin_password}</strong></p>
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
                <span className="px-3 py-2 bg-gray-100 border border-l-0 rounded-r-lg text-sm text-gray-500">.jurnal.cc.cd</span>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
              <select value={form.plan} onChange={e => setForm({...form, plan: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
                <option value="free">Free (100 siswa)</option>
                <option value="basic">Basic (300 siswa)</option>
                <option value="pro">Pro (1000 siswa)</option>
                <option value="enterprise">Enterprise (unlimited)</option>
              </select>
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
                  <a href={`https://${t.slug}.jurnal.cc.cd`} target="_blank" rel="noreferrer" className="text-primary text-sm hover:underline">
                    {t.slug}.jurnal.cc.cd
                  </a>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {t.domain_custom || <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.plan === 'free' ? 'bg-gray-100 text-gray-600' : t.plan === 'pro' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.aktif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {t.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => toggleTenant(t.id, t.aktif)} className={`text-xs px-2 py-1 rounded ${t.aktif ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                      {t.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button onClick={() => setCustomDomain(t.id)} className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">
                      Set Domain
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {tenants.length === 0 && <div className="p-8 text-center text-gray-400">Belum ada lembaga terdaftar</div>}
      </div>
    </div>
  )
}
