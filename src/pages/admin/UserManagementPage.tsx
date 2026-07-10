import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { UserPlus, Trash2, Shield, GraduationCap, KeyRound } from 'lucide-react'
import api from '../../services/api'
import { roleLabel } from '../../lib/roles'
import type { User } from '../../types'

const CREATABLE = [
  { value: 'kepala', label: 'Kepala Madrasah / Sekolah (read-only)' },
  { value: 'admin', label: 'Admin Lembaga / Operator (akses penuh)' },
  { value: 'guru', label: 'Guru' },
  { value: 'wali_kelas', label: 'Wali Kelas' },
]

type GtkTanpaAkun = { id: string; nip: string | null; nama: string; email: string | null; no_hp: string | null; jabatan: string | null }

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ nama: '', email: '', password: '', role: 'kepala' })
  const [saving, setSaving] = useState(false)
  const [gtkList, setGtkList] = useState<GtkTanpaAkun[]>([])
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [pwd, setPwd] = useState<Record<string, string>>({})
  const [genRole, setGenRole] = useState('guru')
  const [genning, setGenning] = useState(false)

  const load = async () => {
    try { setUsers((await api.get('/users')).data) }
    catch { toast.error('Gagal memuat daftar pengguna') }
  }
  const loadGtk = async () => {
    try { setGtkList((await api.get('/gtk/tanpa-akun')).data) }
    catch { /* endpoint optional */ }
  }
  useEffect(() => { load(); loadGtk() }, [])

  const create = async () => {
    if (!form.nama.trim() || !form.email.trim() || form.password.length < 6) {
      toast.error('Lengkapi data (password min 6 karakter)'); return
    }
    setSaving(true)
    try {
      await api.post('/users', form)
      toast.success('Pengguna dibuat')
      setForm({ nama: '', email: '', password: '', role: 'kepala' })
      load()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal membuat pengguna') }
    finally { setSaving(false) }
  }

  const toggleAll = (on: boolean) => {
    const next: Record<string, boolean> = {}
    if (on) gtkList.forEach(g => { next[g.id] = true })
    setSel(next)
  }

  const buatAkun = async () => {
    const items = gtkList.filter(g => sel[g.id]).map(g => ({
      gtk_id: g.id, role: genRole, password: pwd[g.id]?.trim() || undefined,
    }))
    if (!items.length) { toast.error('Pilih minimal satu guru'); return }
    setGenning(true)
    try {
      const res = (await api.post('/users/from-gtk', { items })).data
      const defaults = (res.created || []).filter((c: any) => c.password_default)
      toast.success(`${res.dibuat} akun dibuat${res.dilewati ? `, ${res.dilewati} dilewati` : ''}`)
      if (defaults.length) {
        toast(`Password default (= NIP/HP): ${defaults.map((c: any) => `${c.nama}=${c.password_default}`).join(', ')}`, { duration: 10000, icon: '🔑' })
      }
      if (res.skipped?.length) res.skipped.forEach((s: any) => toast.error(`${s.nama || s.gtk_id}: ${s.alasan}`, { duration: 6000 }))
      setSel({}); setPwd({}); load(); loadGtk()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal membuat akun') }
    finally { setGenning(false) }
  }

  const remove = async (u: User) => {
    if (!confirm(`Hapus akun ${u.nama}?`)) return
    try { await api.delete(`/users/${u.id}`); toast.success('Dihapus'); load() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menghapus') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Manajemen Pengguna</h1>
        <p className="text-gray-500 text-sm mt-1">Kelola akun & role: Kepala Madrasah (pimpinan, read-only) dan Admin/Operator (akses penuh)</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><UserPlus size={18} /> Tambah Pengguna</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <input placeholder="Nama lengkap" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full min-w-0 px-4 py-2 border rounded-lg text-sm" />
          <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full min-w-0 px-4 py-2 border rounded-lg text-sm" />
          <input placeholder="Password (min 6)" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full min-w-0 px-4 py-2 border rounded-lg text-sm" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full min-w-0 px-4 py-2 border rounded-lg text-sm">
            {CREATABLE.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <button onClick={create} disabled={saving} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Tambah'}
        </button>
      </div>

      {/* Buat akun dari data guru */}
      {gtkList.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-1 flex items-center gap-2"><GraduationCap size={18} /> Buat Akun dari Data Guru</h2>
          <p className="text-gray-500 text-xs mb-4">{gtkList.length} guru belum punya akun. Kosongkan password untuk pakai default (= NIP, atau No. HP jika NIP kosong). Guru wajib ganti password sendiri setelah login.</p>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button onClick={() => toggleAll(true)} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">Pilih Semua</button>
            <button onClick={() => toggleAll(false)} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">Kosongkan</button>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Role:</span>
              <select value={genRole} onChange={e => setGenRole(e.target.value)} className="px-2 py-1.5 border rounded-lg">
                <option value="guru">Guru</option>
                <option value="kepala">Kepala (read-only)</option>
              </select>
            </div>
            <button onClick={buatAkun} disabled={genning} className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
              <KeyRound size={15} /> {genning ? 'Membuat...' : 'Buat Akun Terpilih'}
            </button>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">NIP</th>
                  <th className="px-3 py-2">Password (opsional)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {gtkList.map(g => (
                  <tr key={g.id} className={sel[g.id] ? 'bg-green-50/50' : ''}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={!!sel[g.id]} onChange={e => setSel({ ...sel, [g.id]: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800">{g.nama}</td>
                    <td className="px-3 py-2 text-gray-500">{g.nip || <span className="text-amber-600 text-xs">tanpa NIP</span>}</td>
                    <td className="px-3 py-2">
                      <input placeholder={g.nip || g.no_hp || 'wajib isi (min 6)'} value={pwd[g.id] || ''} onChange={e => setPwd({ ...pwd, [g.id]: e.target.value })}
                        className="w-40 px-2 py-1 border rounded text-xs" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 w-16"></th></tr>
            </thead>
            <tbody className="divide-y">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-gray-800">{u.nama}</td>
                  <td className="px-4 py-3 text-gray-600 break-all">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-primary/10 text-primary whitespace-nowrap">
                      <Shield size={12} /> {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(u)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="sm:hidden divide-y">
          {users.map(u => (
            <div key={u.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 truncate">{u.nama}</p>
                <p className="text-xs text-gray-500 break-all">{u.email}</p>
                <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                  <Shield size={11} /> {roleLabel(u.role)}
                </span>
              </div>
              <button onClick={() => remove(u)} className="text-gray-400 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
