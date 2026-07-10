import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { School, Eye, EyeOff, Globe, Server, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [form, setForm] = useState({
    nama_lembaga: '', nama: '', email: '', password: '', password_confirm: '', no_hp: '',
    slug: '', domain_type: 'subdomain' as 'subdomain' | 'custom', custom_domain: ''
  })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nama || !form.email || !form.password) { toast.error('Nama, email, dan password wajib diisi'); return }
    if (form.password.length < 6) { toast.error('Password minimal 6 karakter'); return }
    if (form.password !== form.password_confirm) { toast.error('Konfirmasi password tidak cocok'); return }
    if (form.domain_type === 'custom' && !form.custom_domain.trim()) { toast.error('Domain wajib diisi'); return }
    setLoading(true)
    try {
      const payload: Record<string, string> = {
        nama_lembaga: form.nama_lembaga, nama: form.nama, email: form.email,
        password: form.password, no_hp: form.no_hp,
        domain_type: form.domain_type
      }
      if (form.domain_type === 'subdomain' && form.slug) payload.slug = form.slug
      if (form.domain_type === 'custom') payload.custom_domain = form.custom_domain.trim()

      const res = await api.post('/auth/register', payload)
      if (res.data.token && res.data.user) {
        login(res.data.user, res.data.token)
        await useSettingsStore.getState().loadSettings()
        toast.success(res.data.message || 'Registrasi berhasil!')
        if (res.data.domain_status === 'pending') {
          // Custom domain: show setup instructions on dashboard
          navigate('/admin/domain-setup')
        } else {
          navigate('/admin')
        }
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

            {/* === DOMAIN CHOICE === */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Pilih Alamat Aplikasi</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => set('domain_type', 'subdomain')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs transition ${form.domain_type === 'subdomain' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  <Server size={20} />
                  <span className="font-medium">Subdomain</span>
                  <span className="text-[10px] opacity-70">slug.jurnal.cc.cd</span>
                </button>
                <button type="button" onClick={() => set('domain_type', 'custom')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs transition ${form.domain_type === 'custom' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  <Globe size={20} />
                  <span className="font-medium">Domain Sendiri</span>
                  <span className="text-[10px] opacity-70">jurnal.sekolah.id</span>
                </button>
              </div>
            </div>

            {/* === SUBDOMAIN: editable slug === */}
            {form.domain_type === 'subdomain' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subdomain</label>
                <div className="flex items-center gap-0">
                  <input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder={form.nama_lembaga ? form.nama_lembaga.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) : 'misal: miftahul-ulum'}
                    className="flex-1 px-3 py-2 border rounded-l-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-0" />
                  <span className="px-3 py-2 bg-gray-100 border border-l-0 rounded-r-lg text-xs text-gray-500 whitespace-nowrap">.jurnal.cc.cd</span>
                </div>
              </div>
            )}

            {/* === CUSTOM DOMAIN: input + DNS instructions === */}
            {form.domain_type === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Domain Lembaga</label>
                <input value={form.custom_domain} onChange={e => set('custom_domain', e.target.value)}
                  placeholder="jurnal.sekolah-anda.id"
                  className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">⚠️ Sebelum mendaftar, atur DNS domain Anda:</p>
                  <ol className="list-decimal ml-4 space-y-0.5">
                    <li>Buka panel DNS domain Anda</li>
                    <li>Tambah record: <code className="bg-amber-100 px-1 rounded font-mono">Type=A, Name=jurnal, Value=129.226.82.94</code></li>
                    <li>Simpan, tunggu ~5 menit agar DNS propagasi</li>
                  </ol>
                  <p className="mt-1 text-amber-600">Setelah daftar, buka <b>Pengaturan → Aktifkan Domain</b> untuk verifikasi & pasang SSL otomatis.</p>
                </div>
              </div>
            )}

            {/* === ACCOUNT INFO === */}
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lembaga/Sekolah</label>
              <input value={form.nama_lembaga} onChange={e => set('nama_lembaga', e.target.value)}
                placeholder="MI/MTs/MA ..." className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap *</label>
              <input value={form.nama} onChange={e => set('nama', e.target.value)}
                placeholder="Admin Sekolah" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="admin@sekolah.id" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">No HP</label>
              <input value={form.no_hp} onChange={e => set('no_hp', e.target.value)}
                placeholder="08xxxxxxxxxx" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
                  placeholder="Minimal 6 karakter" className="w-full px-4 py-2 border rounded-lg text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Konfirmasi Password *</label>
              <input type="password" value={form.password_confirm} onChange={e => set('password_confirm', e.target.value)}
                placeholder="Ulangi password" className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 mt-2 flex items-center justify-center gap-2">
              {loading ? 'Mendaftar...' : 'Daftar Sekarang'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Sudah punya akun?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">Masuk</Link>
        </p>
      </div>
    </div>
  )
}
