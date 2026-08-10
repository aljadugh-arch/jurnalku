import { useState } from 'react'
import { Link } from 'react-router-dom'
import { School, ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { toast.error('Masukkan email Anda'); return }
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim reset link')
    } finally { setLoading(false) }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Email Terkirim!</h2>
            <p className="text-sm text-gray-500 mb-6">
              Kami telah mengirim instruksi reset password ke <strong>{email}</strong>. 
              Silakan cek inbox atau folder spam Anda.
            </p>
            <Link to="/login" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
              <ArrowLeft size={16} /> Kembali ke Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <School size={32} className="text-primary" />
            <h1 className="text-2xl font-bold text-gray-800 font-display">JURNALKU</h1>
          </div>
          <p className="text-gray-500 text-sm">Reset password akun Anda</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail size={24} className="text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 text-center mb-2">Lupa Password?</h2>
          <p className="text-sm text-gray-500 text-center mb-4">
            Masukkan email yang terdaftar. Kami akan mengirimkan link untuk reset password.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@sekolah.id" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50">
              {loading ? 'Mengirim...' : 'Kirim Link Reset'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            <Link to="/login" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
              <ArrowLeft size={14} /> Kembali ke Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
