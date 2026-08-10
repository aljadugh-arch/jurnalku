import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { UserPlus, Trash2, Shield } from 'lucide-react'
import api from '../../services/api'
import { roleLabel } from '../../lib/roles'
import type { User } from '../../types'

const CREATABLE = [
  { value: 'kepala', label: 'Kepala Madrasah / Sekolah (read-only)' },
  { value: 'admin', label: 'Admin Lembaga / Operator (akses penuh)' },
  { value: 'guru', label: 'Guru' },
  { value: 'wali_kelas', label: 'Wali Kelas' },
]

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ nama: '', email: '', password: '', role: 'kepala' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try { setUsers((await api.get('/users')).data) }
    catch { toast.error('Gagal memuat daftar pengguna') }
  }
  useEffect(() => { load() }, [])

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
          <input placeholder="Nama lengkap" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="px-4 py-2 border rounded-lg text-sm" />
          <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-4 py-2 border rounded-lg text-sm" />
          <input placeholder="Password (min 6)" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="px-4 py-2 border rounded-lg text-sm" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="px-4 py-2 border rounded-lg text-sm">
            {CREATABLE.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <button onClick={create} disabled={saving} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Tambah'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 w-16"></th></tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-gray-800">{u.nama}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-primary/10 text-primary">
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
    </div>
  )
}
