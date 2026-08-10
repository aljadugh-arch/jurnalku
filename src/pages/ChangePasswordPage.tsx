import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { Lock } from 'lucide-react'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (form.new_password !== form.confirm_password) {
      setError('Password baru tidak cocok')
      return
    }
    
    if (form.new_password.length < 6) {
      setError('Password baru minimal 6 karakter')
      return
    }

    setLoading(true)
    try {
      await api.put('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password
      })
      setSuccess(true)
      setTimeout(() => {
        navigate(-1)
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal mengubah password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border max-w-md w-full p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
            <Lock className="text-primary" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-800">Ubah Password</h1>
            <p className="text-sm text-gray-500">Ganti password akun Anda</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            Password berhasil diubah. Mengarahkan kembali...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password Lama</label>
            <input
              type="password"
              required
              value={form.current_password}
              onChange={e => setForm({...form, current_password: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Masukkan password lama"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru</label>
            <input
              type="password"
              required
              value={form.new_password}
              onChange={e => setForm({...form, new_password: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Minimal 6 karakter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password Baru</label>
            <input
              type="password"
              required
              value={form.confirm_password}
              onChange={e => setForm({...form, confirm_password: e.target.value})}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Ketik ulang password baru"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : 'Ubah Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
