import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { School, Eye, EyeOff, Globe, Link2, CheckCircle, MessageCircle, Mail, Loader2, PartyPopper, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'

type DomainMode = 'subdomain' | 'custom'

type HasilRegistrasi = {
  namaLembaga: string
  url: string
  slug: string
  domainCustom: string | null
  domainStatus: string | null
  noHp: string
  email: string
}

export default function RegisterPage() {
  // Domain basis subdomain: daftar dari server (satu sumber dengan BASE_DOMAINS),
  // fallback ke domain host saat ini bila endpoint belum termuat.
  const [baseDomains, setBaseDomains] = useState<string[]>([])
  const SUBDOMAIN_BASE = useMemo(() => {
    const host = window.location.hostname
    // Utamakan domain yang sedang dibuka, bila termasuk daftar sah.
    const cocok = baseDomains.find(d => host === d || host.endsWith('.' + d))
    if (cocok) return cocok
    if (host === 'jurnalmadrasah.web.id' || host.endsWith('.jurnalmadrasah.web.id')) return 'jurnalmadrasah.web.id'
    return baseDomains[0] || 'jurnal.cc.cd'
  }, [baseDomains])
  const [pilihBase, setPilihBase] = useState('')
  const navigate = useNavigate()

  // Ambil daftar domain kanonik dari server (satu sumber dengan BASE_DOMAINS).
  useEffect(() => {
    api.get('/tenant/domains')
      .then(({ data }) => { if (Array.isArray(data?.domains) && data.domains.length) setBaseDomains(data.domains.map((d: any) => d.domain)) })
      .catch(() => { /* fallback ke domain host */ })
  }, [])
  const login = useAuthStore(s => s.login)
  const [domainMode, setDomainMode] = useState<DomainMode>('subdomain')
  const [slugTouched, setSlugTouched] = useState(false)
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
  const [hasil, setHasil] = useState<HasilRegistrasi | null>(null)

  const slugify = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const handleNamaLembaga = (val: string) => {
    setForm(f => ({
      ...f,
      nama_lembaga: val,
      // Slug hanya di-auto-generate dari nama lembaga selagi user BELUM pernah
      // mengedit kolom slug secara manual. Begitu user mengetik langsung di
      // kolom subdomain, auto-generate berhenti agar pilihan mereka tidak tertimpa.
      slug: (domainMode === 'subdomain' && !slugTouched) ? slugify(val) : f.slug,
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
        payload.base_domain = pilihBase || SUBDOMAIN_BASE
      } else {
        // `domain_type: 'custom'` WAJIB dikirim — tanpa ini server mengabaikan
        // `domain_custom` dan lembaga diam-diam jatuh ke subdomain platform.
        payload.domain_type = 'custom'
        payload.domain_custom = form.domain_custom
      }

      const res = await api.post('/auth/register', payload)

      // Simpan data untuk layar konfirmasi (berisi status notifikasi WA + email).
      setHasil({
        namaLembaga: form.nama_lembaga || form.nama,
        url: res.data.url || '',
        slug: res.data.slug || form.slug,
        domainCustom: res.data.domain_custom || null,
        domainStatus: res.data.domain_status || null,
        noHp: form.no_hp,
        email: form.email,
      })

      if (res.data.token && res.data.user) {
        login(res.data.user, res.data.token)
        await useSettingsStore.getState().loadSettings()
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal registrasi')
    } finally { setLoading(false) }
  }

  // ── Layar konfirmasi setelah registrasi berhasil ──────────────────────────
  if (hasil) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
              <PartyPopper size={32} className="text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 font-display">Pendaftaran Berhasil!</h1>
            <p className="mt-2 text-sm text-gray-500">
              Lembaga <strong className="text-gray-700">{hasil.namaLembaga}</strong> sudah terdaftar dan masa uji coba 30 hari aktif.
            </p>

            {hasil.url && (
              <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4 text-left">
                <p className="text-xs font-medium text-gray-500">Alamat akses lembaga</p>
                <p className="mt-1 break-all text-sm font-semibold text-primary">{hasil.url}</p>
                {hasil.domainCustom && hasil.domainStatus !== 'active' && (
                  <p className="mt-2 text-xs text-amber-600">
                    Domain masih menunggu DNS. Buat record A ke server, lalu klik Verifikasi di menu Pengaturan Domain.
                  </p>
                )}
              </div>
            )}

            {/* Status notifikasi — inilah yang diminta: pemberitahuan ke WA + email */}
            <div className="mt-4 space-y-2 text-left">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <MessageCircle size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Pemberitahuan WhatsApp</p>
                  <p className="text-xs text-emerald-700">
                    {hasil.noHp
                      ? `Dikirim ke nomor ${hasil.noHp}. Jika belum masuk, tunggu beberapa saat atau cek kembali nanti.`
                      : 'Nomor WhatsApp tidak diisi, jadi pemberitahuan WA dilewati.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                <Mail size={18} className="mt-0.5 shrink-0 text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">Pemberitahuan Email</p>
                  <p className="text-xs text-blue-700">
                    Dikirim ke {hasil.email}. Cek juga folder Spam/Promosi bila belum terlihat.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/admin')}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
              >
                Masuk ke Dashboard <ArrowRight size={16} />
              </button>
              <Link
                to="/login"
                className="inline-flex flex-1 items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Ke Halaman Masuk
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-primary/10 shadow-sm overflow-hidden">
              <img src={useSettingsStore.getState().settings.logo || '/logo-jurnalku-256.png'} alt="Logo" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 font-display">JURNALKU</h1>
          </div>
          <p className="text-gray-500 text-sm">Daftar akun baru untuk mengelola lembaga Anda</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Buat Akun Baru</h2>
          <p className="mb-5 text-xs text-gray-500">
            Gratis 30 hari, aktif seketika. Konfirmasi dikirim ke WhatsApp dan email Anda.
          </p>

          {/* Domain mode selector */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 mb-2">Pilih Jenis Domain</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Subdomain */}
              <button
                type="button"
                onClick={() => setDomainMode('subdomain')}
                className={`min-w-0 flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors ${
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
                  {domainMode === 'subdomain' && <CheckCircle size={14} className="text-primary" />}
                </div>
                <span className="text-xs text-gray-400 leading-tight">{`*.${SUBDOMAIN_BASE}`}</span>
                <span className="text-xs text-gray-400 leading-tight">Gratis, langsung aktif</span>
              </button>

              {/* Custom domain */}
              <button
                type="button"
                onClick={() => setDomainMode('custom')}
                className={`min-w-0 flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors ${
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
                  {domainMode === 'custom' && <CheckCircle size={14} className="text-primary" />}
                </div>
                <span className="text-xs text-gray-400 leading-tight break-all">jurnal.lembagaku.sch.id</span>
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
                  <div className="min-w-0 flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
                    <input
                      value={form.slug}
                      onChange={e => { setSlugTouched(true); setForm({ ...form, slug: slugify(e.target.value) }) }}
                      placeholder="nama-lembaga"
                      className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
                    />
                    <select
                      value={pilihBase || SUBDOMAIN_BASE}
                      onChange={e => setPilihBase(e.target.value)}
                      className="px-2 py-2 bg-gray-50 text-gray-600 text-sm border-l outline-none max-w-[150px] whitespace-nowrap"
                      title="Pilih domain lembaga"
                    >
                      {(baseDomains.length ? baseDomains : [SUBDOMAIN_BASE]).map(d => (
                        <option key={d} value={d}>.{d}</option>
                      ))}
                    </select>
                  </div>
                  {form.slug && (
                    <p className="text-xs text-primary mt-1">
                      Akses: {`https://${form.slug}.${pilihBase || SUBDOMAIN_BASE}`}
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
                    placeholder="jurnal.lembagaku.sch.id"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-amber-600 mt-1">
                    Arahkan DNS domain ke server kami, lalu Verifikasi di menu Pengaturan Domain.
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lembaga</label>
              <input
                value={form.nama_lembaga}
                onChange={e => handleNamaLembaga(e.target.value)}
                placeholder="MI/MTs/MA/SMP/SMA ..."
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
              <input
                value={form.nama}
                onChange={e => setForm({ ...form, nama: e.target.value })}
                placeholder="Nama admin"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="admin@lembaga.id"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-[11px] text-gray-400">Konfirmasi pendaftaran dikirim ke email ini.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">No WhatsApp</label>
              <input
                value={form.no_hp}
                onChange={e => setForm({ ...form, no_hp: e.target.value })}
                placeholder="08xxxxxxxxxx"
                inputMode="tel"
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-[11px] text-gray-400">Konfirmasi pendaftaran juga dikirim ke nomor WhatsApp ini.</p>
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
                  aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
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
              className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 mt-2 inline-flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Mendaftar…</> : 'Daftar Sekarang'}
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
