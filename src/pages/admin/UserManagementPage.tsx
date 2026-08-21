import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { UserPlus, Trash2, Shield, Search, Download, Copy } from 'lucide-react'
import api from '../../services/api'
import { roleLabel } from '../../lib/roles'
import type { User } from '../../types'

const CREATABLE = [
  { value: 'kepala', label: 'Kepala Madrasah / Sekolah (read-only)' },
  { value: 'admin', label: 'Admin Lembaga / Operator (akses penuh)' },
  { value: 'bendahara', label: 'Bendahara' },
  { value: 'guru', label: 'Guru' },
  { value: 'wali_kelas', label: 'Wali Kelas' },
]

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ nama: '', email: '', password: '', role: 'kepala' })
  const [saving, setSaving] = useState(false)
  const [gtk, setGtk] = useState<any[]>([])
  const [siswa, setSiswa] = useState<any[]>([])
  const [gtkSearch, setGtkSearch] = useState('')
  const [siswaSearch, setSiswaSearch] = useState('')

  useEffect(() => {
    api.get('/gtk').then(r => setGtk(r.data)).catch(() => {})
    api.get('/siswa').then(r => setSiswa(r.data)).catch(() => {})
  }, [])

  const filteredGtk = gtk.filter(g => g.nama?.toLowerCase().includes(gtkSearch.toLowerCase()) || (g.nip||'').includes(gtkSearch)).slice(0,8)
  const filteredSiswa = siswa.filter(s => s.nama?.toLowerCase().includes(siswaSearch.toLowerCase()) || (s.nis||'').includes(siswaSearch)).slice(0,8)

  const pickGtk = (g: any) => { setForm(f => ({ ...f, nama: g.nama, email: g.email || f.email, role: 'guru' })); setGtkSearch('') }
  const pickSiswa = (s: any) => { setForm(f => ({ ...f, nama: s.nama, email: f.email, role: 'siswa' })); setSiswaSearch('') }

  const exportUsers = () => {
    const lines = users.map(u => `${u.email}\t${u.nama}\t${u.role}`).join('\n')
    const blob = new Blob(['Email\tNama\tRole\n' + lines], { type: 'text/plain' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'daftar-pengguna.txt'; a.click()
  }
  const copyWA = () => {
    const lines = users.map(u => `• ${u.nama} (${u.role}): ${u.email}`).join('\n')
    navigator.clipboard.writeText('*Daftar Akun Pengguna*\n\n' + lines).then(() => toast.success('Disalin ke clipboard'))
  }

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
    <div className="min-w-0 space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-800 font-display">Manajemen Pengguna</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <button onClick={exportUsers} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs hover:bg-gray-200"><Download size={13}/>Ekspor TXT</button>
          <button onClick={copyWA} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs hover:bg-green-100"><Copy size={13}/>Salin WA</button>
        </div>
        <p className="text-gray-500 text-sm mt-1">Kelola akun & role: Kepala Madrasah (pimpinan, read-only) dan Admin/Operator (akses penuh)</p>
      </div>

      <div className="min-w-0 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><UserPlus size={18} /> Tambah Pengguna</h2>
        <div className="grid md:grid-cols-2 gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cari & pilih GTK</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={gtkSearch} onChange={e => setGtkSearch(e.target.value)} placeholder="Nama atau NIP guru..." className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm" />
            </div>
            {gtkSearch && filteredGtk.map(g => <button key={g.id} type="button" onClick={() => pickGtk(g)} className="block w-full text-left px-3 py-1.5 text-xs bg-white border-b hover:bg-blue-50 rounded">{g.nama} {g.nip ? '('+g.nip+')' : ''}</button>)}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cari & pilih Siswa</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={siswaSearch} onChange={e => setSiswaSearch(e.target.value)} placeholder="Nama atau NIS siswa..." className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm" />
            </div>
            {siswaSearch && filteredSiswa.map(sw => <button key={sw.id} type="button" onClick={() => pickSiswa(sw)} className="block w-full text-left px-3 py-1.5 text-xs bg-white border-b hover:bg-blue-50 rounded">{sw.nama} ({sw.nis})</button>)}
          </div>
        </div>
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
        <div className="sm:hidden divide-y">
          {users.map(u => <div key={u.id} className="p-4 flex items-start gap-3"><div className="min-w-0 flex-1"><p className="font-medium text-gray-800 break-words">{u.nama}</p><p className="mt-1 text-sm text-gray-600 break-all">{u.email}</p><span className="mt-2 inline-flex max-w-full items-center gap-1 px-2 py-1 rounded-full text-xs bg-primary/10 text-primary"><Shield size={12} className="shrink-0"/><span className="break-words">{roleLabel(u.role)}</span></span></div><button aria-label={`Hapus ${u.nama}`} onClick={() => remove(u)} className="shrink-0 p-2 text-gray-400 hover:text-red-500"><Trash2 size={16}/></button></div>)}
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left"><tr><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 w-16"></th></tr></thead>
            <tbody className="divide-y">{users.map(u => <tr key={u.id}><td className="px-4 py-3 font-medium text-gray-800 break-words">{u.nama}</td><td className="px-4 py-3 text-gray-600 break-all">{u.email}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-primary/10 text-primary"><Shield size={12}/>{roleLabel(u.role)}</span></td><td className="px-4 py-3"><button aria-label={`Hapus ${u.nama}`} onClick={() => remove(u)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
