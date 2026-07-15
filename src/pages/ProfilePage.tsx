import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Camera, Save, Lock } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { roleLabel } from '../lib/roles'
import { compressImage } from '../lib/image'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const [form, setForm] = useState({ nama: user?.nama || '', email: user?.email || '' })
  const [saving, setSaving] = useState(false)
  const [avatar, setAvatar] = useState(user?.avatar || '')

  const handleSave = async () => {
    if (!form.nama.trim()) { toast.error('Nama wajib diisi'); return }
    setSaving(true)
    try {
      const res = await api.put('/auth/profile', form)
      updateUser(res.data)
      toast.success('Profil berhasil disimpan')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan profil')
    } finally { setSaving(false) }
  }

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file) // resize->512px, JPEG q0.82
    const fd = new FormData()
    fd.append('avatar', compressed)
    try {
      const res = await api.post('/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setAvatar(res.data.avatar)
      updateUser({ avatar: res.data.avatar })
      toast.success('Foto profil diperbarui')
    } catch { toast.error('Gagal mengunggah foto') }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Profil Saya</h1>
        <p className="text-gray-500 text-sm mt-1">Kelola foto, nama, dan email akun Anda</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center border">
              {avatar
                ? <img src={avatar} alt="Foto" className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold text-primary">{form.nama.charAt(0) || 'U'}</span>}
            </div>
            <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center cursor-pointer shadow hover:bg-primary-dark">
              <Camera size={14} />
              <input type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
            </label>
          </div>
          <div>
            <p className="font-semibold text-gray-800">{form.nama || 'User'}</p>
            <p className="text-sm text-gray-500">{roleLabel(user?.role)}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Nama Lengkap</label>
          <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full px-4 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2 border rounded-lg text-sm" />
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          <button onClick={() => navigate('change-password')} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
            <Lock size={16} /> Ubah Password
          </button>
        </div>
      </div>
    </div>
  )
}
