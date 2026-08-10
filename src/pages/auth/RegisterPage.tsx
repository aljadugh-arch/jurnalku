import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { School, Eye, EyeOff, Globe, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'

type DomainMode = 'subdomain' | 'custom'

export default function RegisterPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [domainMode, setDomainMode] = useState<DomainMode>('subdomain')
  const [form, setForm] = useState({
    nama_lembaga: '',
    slug: '',
    domain_custom: '',
    nama: '',
    email: '',
    password: '',
    password_confirm: '',
    no_hp: '',
  })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const slugify = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const handleNamaLembaga = (val: string) => {
    setForm(f => ({
      ...f,
      nama_lembaga: val,
      slug: domainMode === 'subdomain' ? slugify(val) : f.slug,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nama || !form.email || !form.password) {
      toast.error('Nama, email, dan password wajib diisi'); return
    }
    if (form.password.length < 6) {
      toast.error('Password minimal 6 karakter'); return
    }
    if (form.password !== form.password_confirm) {
      toast.error('Konfirmasi password tidak cocok'); return
    }
    if (domainMode === 'subdomain' && !form.slug) {
      toast.error('Subdomain wajib diisi'); return
    }
    if (domainMode === 'custom' && !form.domain_custom) {
      toast.error('Domain custom wajib diisi'); return
    }

    setLoading(true)
    try {
      const payload: Record<string, string> = {
        nama_lembaga: form.nama_lembaga,
        nama: form.nama,
        email: form.email,
        password: form.password,
        no_hp: form.no_hp,
      }
      if (domainMode === 'subdomain') {
        payload.slug = form.slug
      } else {
        payload.domain_custom = form.domain_custom
      }

      const res = await api.post('/auth/register', payload)
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
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <School size={32} className="text-primary" />
            <h1 className="text-2xl font-bold text-gray-800 font-display">JURNALKU</h1>
          </div>
          <p className="text-gray-500 text-sm">Daftar akun baru untuk mengelola sekolah Anda</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Buat Akun Baru</h2>

          {/* Domain mode selector */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 mb-2">Pilih Jenis Domain</label>
            <div className="grid grid-cols-2 gap-3">
              {/* Subdomain */}
              <button
                type="button"
                onClick={() => setDomainMode('subdomain')}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors ${
                  domainMode === 'subdomain'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Link2 size={16} className={domainMode === 'subdomain' ? 'text-primary' : 'text-gray-400'} />
                  <span className={`text-sm font-semibold ${domainMode === 'subdomain' ? 'text-primary' : 'text-gray-700'}`}>
                    Subdomain
                  </span>
                </div>
                <span className="text-xs text-gray-400 leading-tight">*.jurnal.cc.cd</span>
                <span className="text-xs text-gray-400 leading-tight">Gratis, langsung aktif</span>
              </button>

              {/* Custom domain */}
              <button
                type="button"
                onClick={() => setDomainMode('custom')}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors ${
                  domainMode === 'custom'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe size={16} className={domainMode === 'custom' ? 'text-primary' : 'text-gray-400'} />
                  <span className={`text-sm font-semibold ${domainMode === 'custom' ? 'text-primary' : 'text-gray-700'}`}>
                    Domain Sendiri
                  </span>
                </div>
                <span className="text-xs text-gray-400 leading-tight">jurnal.sekolahku.sch.id</span>
                <span className="text-xs text-gray-400 leading-tight">Domain milik lembaga</span>
              </button>
            </div>

            {/* Domain input */}
            <div className="mt-3">
              {domainMode === 'subdomain' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Subdomain <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
                    <input
                      value={form.slug}
                      onChange={e => setForm({ ...form, slug: slugify(e.target.value) })}
                      placeholder="nama-sekolah"
                      className="flex-1 px-3 py-2 text-sm outline-none"
                    />
                    <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-l whitespace-nowrap">.jurnal.cc.cd</span>
                  </div>
                  {form.slug && (
                    <p className="text-xs text-primary mt-1">
                      Akses: https://{form.slug}.jurnal.cc.cd
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Domain Custom <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.domain_custom}
                    onChange={e => setForm({ ...form, domain_custom: e.target.value.toLowerCase().trim() })}
                    placeholder="jurnal.sekolahku.sch.id"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-amber-600 mt-1">
                    Pastikan DNS domain sudah diarahkan ke server kami sebelum mendaftar.
                  </p>
                  {form.domain_custom && (
                    <p className="text-xs text-primary mt-1">
                      Akses: https://{form.domain_custom}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lembaga/Sekolah</label>
              <input
                value={form.nama_lembaga}
                onChange={e => handleNamaLembaga(e.target.value)}
                placeholder="MI/MTs/MA ..."
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
              <input
                value={form.nama}
                onChange={e => setForm({ ...form, nama: e.target.value })}
                placeholder="Admin Sekolah"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="admin@sekolah.id"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">No HP</label>
              <input
                value={form.no_hp}
                onChange={e => setForm({ ...form, no_hp: e.target.value })}
                placeholder="08xxxxxxxxxx"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-4 py-2 border rounded-lg text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Konfirmasi Password <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={form.password_confirm}
                onChange={e => setForm({ ...form, password_confirm: e.target.value })}
                placeholder="Ulangi password"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 mt-2"
            >
              {loading ? 'Mendaftar...' : 'Daftar Sekarang →'}
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
