import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { School, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [form, setForm] = useState({ nama_lembaga: '', nama: '', email: '', password: '', password_confirm: '', no_hp: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nama || !form.email || !form.password) { toast.error('Nama, email, dan password wajib diisi'); return }
    if (form.password.length < 6) { toast.error('Password minimal 6 karakter'); return }
    if (form.password !== form.password_confirm) { toast.error('Konfirmasi password tidak cocok'); return }
    setLoading(true)
    try {
      const res = await api.post('/auth/register', { nama_lembaga: form.nama_lembaga, nama: form.nama, email: form.email, password: form.password, no_hp: form.no_hp })
      if (res.data.token && res.data.user) {
        login(res.data.user, res.data.token)
        await useSettingsStore.getState().loadSettings()
        toast.success('Registrasi berhasil! Selamat datang.')
        navigate('/admin')
      } else {
        toast.success('Registrasi berhasil! Silakan login.')
        navigate('/login')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal registrasi')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <School size={32} className="text-primary" />
            <h1 className="text-2xl font-bold text-gray-800 font-display">JURNALKU</h1>
          </div>
          <p className="text-gray-500 text-sm">Daftar akun baru untuk mengelola sekolah Anda</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Buat Akun Baru</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lembaga/Sekolah</label>
              <input value={form.nama_lembaga} onChange={e => setForm({...form, nama_lembaga: e.target.value})} placeholder="MI/MTs/MA ..." className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap *</label>
              <input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} placeholder="Admin Sekolah" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="admin@sekolah.id" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">No HP</label>
              <input value={form.no_hp} onChange={e => setForm({...form, no_hp: e.target.value})} placeholder="08xxxxxxxxxx" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Minimal 6 karakter" className="w-full px-4 py-2 border rounded-lg text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Konfirmasi Password *</label>
              <input type="password" value={form.password_confirm} onChange={e => setForm({...form, password_confirm: e.target.value})} placeholder="Ulangi password" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 mt-2">
              {loading ? 'Mendaftar...' : 'Daftar Sekarang'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Sudah punya akun? <Link to="/login" className="text-primary font-medium hover:underline">Masuk</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
