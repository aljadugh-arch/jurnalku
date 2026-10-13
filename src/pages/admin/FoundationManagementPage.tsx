import { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { Building2, Plus, Trash2, Pencil, Users, Save, X } from 'lucide-react'

interface Foundation {
  id: string
  nama: string
  alamat: string | null
  telepon: string | null
  email: string | null
}
interface Tenant {
  id: string
  slug: string
  nama: string
  domain_custom: string | null
  foundation_id: string | null
  aktif: number
}

// Kelola yayasan + pengelompokan lembaga (super_admin). Mengisi kolom
// tenants.foundation_id sehingga deteksi se-yayasan (FoundationTenantPicker,
// /api/foundation/*) langsung hidup. Lembaga hanya boleh tergabung di SATU yayasan.
export default function FoundationManagementPage() {
  const [foundations, setFoundations] = useState<Foundation[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  // Form buat yayasan
  const [nama, setNama] = useState('')
  const [alamat, setAlamat] = useState('')
  const [telepon, setTelepon] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)

  // Panel kelola anggota
  const [manageId, setManageId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // Edit nama
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNama, setEditNama] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [f, t] = await Promise.all([api.get('/foundations'), api.get('/tenants')])
      setFoundations(f.data)
      setTenants(t.data)
    } catch (e) { console.error(e); toast.error('Gagal memuat data') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const createFoundation = async () => {
    if (!nama.trim()) return toast.error('Nama yayasan wajib diisi')
    setCreating(true)
    try {
      await api.post('/foundations', { nama: nama.trim(), alamat: alamat.trim(), telepon: telepon.trim(), email: email.trim() })
      toast.success('Yayasan dibuat')
      setNama(''); setAlamat(''); setTelepon(''); setEmail('')
      await load()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal membuat yayasan') } finally { setCreating(false) }
  }

  const openManage = (f: Foundation) => {
    setManageId(f.id)
    setSelected(new Set(tenants.filter(t => t.foundation_id === f.id).map(t => t.id)))
  }
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }
  const saveAssign = async () => {
    if (!manageId) return
    setSaving(true)
    try {
      const { data } = await api.put(`/foundations/${manageId}/tenants`, { tenant_ids: [...selected] })
      toast.success(`${data.count} lembaga tergabung`)
      setManageId(null)
      await load()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan') } finally { setSaving(false) }
  }

  const deleteFoundation = async (f: Foundation) => {
    if (!window.confirm(`Hapus yayasan "${f.nama}"? Lembaga anggotanya akan dilepas (bukan dihapus).`)) return
    try { await api.delete(`/foundations/${f.id}`); toast.success('Yayasan dihapus'); await load() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menghapus') }
  }

  const startEdit = (f: Foundation) => { setEditingId(f.id); setEditNama(f.nama) }
  const saveEdit = async (id: string) => {
    if (!editNama.trim()) return toast.error('Nama tidak boleh kosong')
    try { await api.put(`/foundations/${id}`, { nama: editNama.trim() }); toast.success('Nama tersimpan'); setEditingId(null); await load() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan') }
  }

  const memberCount = (fid: string) => tenants.filter(t => t.foundation_id === fid).length
  const ungrouped = tenants.filter(t => !t.foundation_id).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800">Manajemen Yayasan</h1>
          <p className="text-sm text-gray-500 mt-1">Kelompokkan beberapa lembaga ke dalam satu yayasan untuk data lintas lembaga (Integrasi Se-Yayasan).</p>
        </div>
        <span className="text-xs text-gray-400">{ungrouped} lembaga belum tergabung</span>
      </div>

      {/* Buat yayasan */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Plus className="w-4 h-4" />Buat Yayasan Baru</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nama Yayasan <span className="text-red-500">*</span></label>
            <input value={nama} onChange={e => setNama(e.target.value)} placeholder="mis. Yayasan Sunan Drajat" className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Alamat</label>
            <input value={alamat} onChange={e => setAlamat(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telepon</label>
            <input value={telepon} onChange={e => setTelepon(e.target.value)} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} className="input" />
          </div>
        </div>
        <button onClick={createFoundation} disabled={creating} className="btn-primary flex items-center gap-2">
          <Building2 className="w-4 h-4" />{creating ? 'Membuat…' : 'Buat Yayasan'}
        </button>
      </div>

      {/* Daftar yayasan */}
      {loading ? (
        <div className="card p-10 text-center text-gray-400">Memuat…</div>
      ) : foundations.length === 0 ? (
        <div className="card py-14 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Belum ada yayasan. Buat yayasan dulu, lalu tautkan lembaga-lembaganya.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {foundations.map(f => (
            <div key={f.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  {editingId === f.id ? (
                    <div className="flex items-center gap-2">
                      <input value={editNama} onChange={e => setEditNama(e.target.value)} className="input" autoFocus />
                      <button onClick={() => void saveEdit(f.id)} className="btn-primary flex items-center gap-1 text-sm"><Save className="w-3.5 h-3.5" />Simpan</button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary text-sm">Batal</button>
                    </div>
                  ) : (
                    <h3 className="font-semibold text-gray-800 text-lg flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />{f.nama}</h3>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    {memberCount(f.id)} lembaga · {[f.alamat, f.telepon, f.email].filter(Boolean).join(' · ') || 'tanpa detail'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => openManage(f)} className="btn-secondary flex items-center gap-2"><Users className="w-4 h-4" />Kelola Lembaga ({memberCount(f.id)})</button>
                  <button onClick={() => startEdit(f)} className="btn-secondary flex items-center gap-2"><Pencil className="w-4 h-4" />Ubah Nama</button>
                  <button onClick={() => void deleteFoundation(f)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" />Hapus</button>
                </div>
              </div>

              {/* Panel kelola anggota */}
              {manageId === f.id && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500 mb-3">Centang lembaga yang tergabung di yayasan ini. Lembaga hanya bisa tergabung di satu yayasan (akan dipindah dari yayasan lain bila perlu).</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                    {tenants.map(t => (
                      <label key={t.id} className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer ${selected.has(t.id) ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-800 truncate">{t.nama}</span>
                          <span className="block text-xs text-gray-400 truncate">{t.slug}{t.aktif ? '' : ' · nonaktif'}{t.domain_custom ? ` · ${t.domain_custom}` : ''}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => void saveAssign()} disabled={saving} className="btn-primary flex items-center gap-2"><Save className="w-4 h-4" />{saving ? 'Menyimpan…' : 'Simpan Keanggotaan'}</button>
                    <button onClick={() => setManageId(null)} className="btn-secondary flex items-center gap-2"><X className="w-4 h-4" />Tutup</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
