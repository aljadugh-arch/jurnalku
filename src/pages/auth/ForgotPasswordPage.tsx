import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useSettingsStore } from '../../stores/settingsStore'

export default function ForgotPasswordPage() {
  const { settings } = useSettingsStore()
  const logo = settings.logo || '/logo-jurnalku-256.png'
  const namaLembaga = settings.nama_lembaga || 'JURNALKU'
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
      <div className="sk-root flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="sk-card p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full sk-bg-soft">
              <CheckCircle size={32} className="sk-txt-accent" />
            </div>
            <h2 className="mb-2 text-lg font-bold sk-txt">Email Terkirim!</h2>
            <p className="mb-6 text-sm sk-txt-muted">
              Kami telah mengirim instruksi reset password ke <strong className="sk-txt">{email}</strong>. 
              Silakan cek inbox atau folder spam Anda.
            </p>
            <Link to="/login" className="sk-btn inline-flex">
              <ArrowLeft size={16} /> Kembali ke Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sk-root flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl sk-card overflow-hidden">
              <img src={logo} alt="Logo" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold sk-txt">{namaLembaga}</h1>
          </div>
          <p className="sk-txt-muted text-sm">Reset password akun Anda</p>
        </div>

        <div className="sk-card p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full sk-bg-soft">
            <Mail size={24} className="sk-txt-accent" />
          </div>
          <h2 className="mb-2 text-center text-lg font-bold sk-txt">Lupa Password?</h2>
          <p className="mb-4 text-center text-sm sk-txt-muted">
            Masukkan email yang terdaftar. Kami akan mengirimkan link untuk reset password.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="sk-form-label">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@sekolah.id" className="sk-form-input" />
            </div>
            <button type="submit" disabled={loading} className="sk-btn w-full">
              {loading ? 'Mengirim...' : 'Kirim Link Reset'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm sk-txt-muted">
            <Link to="/login" className="sk-txt-accent inline-flex items-center gap-1 font-medium hover:underline">
              <ArrowLeft size={14} /> Kembali ke Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
