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

  // Buka dashboard di alamat resmi lembaga. Saat domain sendiri sudah aktif,
  // arahkan ke domain milik lembaga (BUKAN tetap di platform jurnal.cc.cd),
  // membawa token lewat fragment URL supaya sesi login tidak hilang saat
  // berpindah origin (localStorage tidak dibagikan antar-origin).
  const bukaDashboard = () => {
    if (!hasil) return
    const token = localStorage.getItem('jurnalku_token')
    const tujuan = (origin: string) =>
      token ? `${origin}/admin#token=${encodeURIComponent(token)}` : `${origin}/admin`
    if (hasil.domainCustom && hasil.domainStatus === 'active') {
      window.location.href = tujuan(`https://${hasil.domainCustom}`)
      return
    }
    // Domain custom belum aktif (pending) — jangan arahkan ke domain yang DNS-nya
    // belum tersambung; tetap di platform sampai pengguna verifikasi di Pengaturan.
    if (hasil.domainCustom) {
      navigate('/admin')
      return
    }
    // Subdomain: arahkan ke alamat subdomain tenant bila berbeda host dari halaman ini.
    if (hasil.url) {
      try {
        const target = new URL(hasil.url)
        if (target.host !== window.location.host) {
          window.location.href = tujuan(target.origin)
          return
        }
      } catch { /* URL tidak valid — jatuh ke navigasi SPA */ }
    }
    navigate('/admin')
  }

  // ── Layar konfirmasi setelah registrasi berhasil ──────────────────────────
  if (hasil) {
    return (
      <div className="sk-root flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="sk-card p-6 text-center sm:p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl sk-bg-soft">
              <PartyPopper size={32} className="sk-txt-accent" />
            </div>
            <h1 className="text-2xl font-bold sk-txt">Pendaftaran Berhasil!</h1>
            <p className="mt-2 text-sm sk-txt-muted">
              Lembaga <strong className="sk-txt">{hasil.namaLembaga}</strong> sudah terdaftar dan masa uji coba 30 hari aktif.
            </p>

            {hasil.url && (
              <div className="mt-5 rounded-xl border sk-border-soft sk-bg-subtle p-4 text-left">
                <p className="text-xs font-medium sk-txt-muted">Alamat akses lembaga</p>
                <p className="mt-1 break-all text-sm font-semibold sk-txt-accent">{hasil.url}</p>
                {hasil.domainCustom && hasil.domainStatus !== 'active' && (
                  <p className="mt-2 text-xs sk-txt-muted">
                    Domain masih menunggu DNS. Buat record A ke server, lalu klik Verifikasi di menu Pengaturan Domain.
                  </p>
                )}
              </div>
            )}

            {/* Status notifikasi — inilah yang diminta: pemberitahuan ke WA + email */}
            <div className="mt-4 space-y-2 text-left">
              <div className="flex items-start gap-3 rounded-xl border sk-border-soft sk-bg-soft p-3">
                <MessageCircle size={18} className="mt-0.5 shrink-0 sk-txt-accent" />
                <div>
                  <p className="text-sm font-semibold sk-txt">Pemberitahuan WhatsApp</p>
                  <p className="text-xs sk-txt-muted">
                    {hasil.noHp
                      ? `Dikirim ke nomor ${hasil.noHp}. Jika belum masuk, tunggu beberapa saat atau cek kembali nanti.`
                      : 'Nomor WhatsApp tidak diisi, jadi pemberitahuan WA dilewati.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border sk-border-soft sk-bg-subtle p-3">
                <Mail size={18} className="mt-0.5 shrink-0 sk-txt-accent" />
                <div>
                  <p className="text-sm font-semibold sk-txt">Pemberitahuan Email</p>
                  <p className="text-xs sk-txt-muted">
                    Dikirim ke {hasil.email}. Cek juga folder Spam/Promosi bila belum terlihat.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={bukaDashboard}
                className="sk-btn flex-1"
              >
                Masuk ke Dashboard <ArrowRight size={16} />
              </button>
              <Link
                to="/login"
                className="sk-btn sk-btn--ghost flex-1"
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
    <div className="sk-root flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl sk-card overflow-hidden">
              <img src={useSettingsStore.getState().settings.logo || '/logo-jurnalku-256.png'} alt="Logo" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold sk-txt">JURNALKU</h1>
          </div>
          <p className="sk-txt-muted text-sm">Daftar akun baru untuk mengelola lembaga Anda</p>
        </div>

        <div className="sk-card p-6">
          <h2 className="text-lg font-bold sk-txt mb-1">Buat Akun Baru</h2>
          <p className="mb-5 text-xs sk-txt-muted">
            Gratis 30 hari, aktif seketika. Konfirmasi dikirim ke WhatsApp dan email Anda.
          </p>

          {/* Domain mode selector */}
          <div className="mb-5">
            <label className="sk-form-label">Pilih Jenis Domain</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Subdomain */}
              <button
                type="button"
                onClick={() => setDomainMode('subdomain')}
                className={`min-w-0 flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors ${
                  domainMode === 'subdomain'
                    ? 'sk-border-accent sk-bg-soft'
                    : 'sk-border-soft hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Link2 size={16} className={domainMode === 'subdomain' ? 'sk-txt-accent' : 'sk-txt-muted'} />
                  <span className={`text-sm font-semibold ${domainMode === 'subdomain' ? 'sk-txt-accent' : 'sk-txt'}`}>
                    Subdomain
                  </span>
                  {domainMode === 'subdomain' && <CheckCircle size={14} className="sk-txt-accent" />}
                </div>
                <span className="text-xs sk-txt-muted leading-tight">{`*.${SUBDOMAIN_BASE}`}</span>
                <span className="text-xs sk-txt-muted leading-tight">Gratis, langsung aktif</span>
              </button>

              {/* Custom domain */}
              <button
                type="button"
                onClick={() => setDomainMode('custom')}
                className={`min-w-0 flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-colors ${
                  domainMode === 'custom'
                    ? 'sk-border-accent sk-bg-soft'
                    : 'sk-border-soft hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe size={16} className={domainMode === 'custom' ? 'sk-txt-accent' : 'sk-txt-muted'} />
                  <span className={`text-sm font-semibold ${domainMode === 'custom' ? 'sk-txt-accent' : 'sk-txt'}`}>
                    Domain Sendiri
                  </span>
                  {domainMode === 'custom' && <CheckCircle size={14} className="sk-txt-accent" />}
                </div>
                <span className="text-xs sk-txt-muted leading-tight break-all">jurnal.lembagaku.sch.id</span>
                <span className="text-xs sk-txt-muted leading-tight">Domain milik lembaga</span>
              </button>
            </div>

            {/* Domain input */}
            <div className="mt-3">
              {domainMode === 'subdomain' ? (
                <div>
                  <label className="sk-form-label">
                    Subdomain <span className="text-red-500">*</span>
                  </label>
                  <div className="min-w-0 flex items-center border rounded-lg overflow-hidden sk-input-wrap">
                    <input
                      value={form.slug}
                      onChange={e => { setSlugTouched(true); setForm({ ...form, slug: slugify(e.target.value) }) }}
                      placeholder="nama-lembaga"
                      className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
                    />
                    <select
                      value={pilihBase || SUBDOMAIN_BASE}
                      onChange={e => setPilihBase(e.target.value)}
                      className="px-2 py-2 sk-bg-subtle sk-txt-muted text-sm border-l outline-none max-w-[150px] whitespace-nowrap"
                      title="Pilih domain lembaga"
                    >
                      {(baseDomains.length ? baseDomains : [SUBDOMAIN_BASE]).map(d => (
                        <option key={d} value={d}>.{d}</option>
                      ))}
                    </select>
                  </div>
                  {form.slug && (
                    <p className="text-xs sk-txt-accent mt-1">
                      Akses: {`https://${form.slug}.${pilihBase || SUBDOMAIN_BASE}`}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="sk-form-label">
                    Domain Custom <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.domain_custom}
                    onChange={e => setForm({ ...form, domain_custom: e.target.value.toLowerCase().trim() })}
                    placeholder="jurnal.lembagaku.sch.id"
                    className="sk-form-input"
                  />
                  <p className="text-xs sk-txt-muted mt-1">
                    Arahkan DNS domain ke server kami, lalu Verifikasi di menu Pengaturan Domain.
                  </p>
                  {form.domain_custom && (
                    <p className="text-xs sk-txt-accent mt-1">
                      Akses: https://{form.domain_custom}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="sk-form-label">Nama Lembaga</label>
              <input
                value={form.nama_lembaga}
                onChange={e => handleNamaLembaga(e.target.value)}
                placeholder="MI/MTs/MA/SMP/SMA ..."
                className="sk-form-input"
              />
            </div>
            <div>
              <label className="sk-form-label">Nama Lengkap <span className="text-red-500">*</span></label>
              <input
                value={form.nama}
                onChange={e => setForm({ ...form, nama: e.target.value })}
                placeholder="Nama admin"
                className="sk-form-input"
              />
            </div>
            <div>
              <label className="sk-form-label">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="admin@lembaga.id"
                className="sk-form-input"
              />
              <p className="mt-1 text-[11px] sk-txt-muted">Konfirmasi pendaftaran dikirim ke email ini.</p>
            </div>
            <div>
              <label className="sk-form-label">No WhatsApp</label>
              <input
                value={form.no_hp}
                onChange={e => setForm({ ...form, no_hp: e.target.value })}
                placeholder="08xxxxxxxxxx"
                inputMode="tel"
                className="sk-form-input"
              />
              <p className="mt-1 text-[11px] sk-txt-muted">Konfirmasi pendaftaran juga dikirim ke nomor WhatsApp ini.</p>
            </div>
            <div>
              <label className="sk-form-label">Password <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimal 6 karakter"
                  className="sk-form-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 sk-txt-muted"
                  aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="sk-form-label">Konfirmasi Password <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={form.password_confirm}
                onChange={e => setForm({ ...form, password_confirm: e.target.value })}
                placeholder="Ulangi password"
                className="sk-form-input"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="sk-btn w-full mt-2"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Mendaftar…</> : 'Daftar Sekarang'}
            </button>
          </form>

          <p className="text-center text-sm sk-txt-muted mt-4">
            Sudah punya akun? <Link to="/login" className="sk-txt-accent font-medium hover:underline">Masuk</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
