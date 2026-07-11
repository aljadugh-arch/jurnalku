import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import {
  School, BookOpen, Users, Calendar, Shield, BarChart3, ArrowRight,
  CheckCircle, Zap, Clock, Globe, Menu, X, ChevronRight, Star, Smartphone, PlayCircle
} from 'lucide-react'

const features = [
  { icon: Users, title: 'Data Siswa & GTK', desc: 'Kelola ribuan data dalam satu dashboard. Cari, filter, ekspor — selesai.', color: 'from-blue-500 to-blue-600' },
  { icon: Calendar, title: 'Jadwal Cerdas', desc: 'Algoritma deteksi konflik jadwal otomatis. Atur KBM tanpa tabrakan.', color: 'from-violet-500 to-purple-600' },
  { icon: BookOpen, title: 'Jurnal & Modul AI', desc: 'Catat KBM harian, AI bantu buat modul ajar dalam hitungan detik.', color: 'from-emerald-500 to-green-600' },
  { icon: BarChart3, title: 'Keuangan Lengkap', desc: 'SPP, tagihan, tabungan, laporan — semua terintegrasi real-time.', color: 'from-amber-500 to-orange-600' },
  { icon: Shield, title: 'Absensi Multi-Metode', desc: 'QR Code, GPS Geolokasi, Selfie. Akurat, anti-titip absen.', color: 'from-rose-500 to-red-600' },
  { icon: Globe, title: 'Domain Custom', desc: 'Pakai domain sendiri: jurnal.sekolah-anda.id. Profesional & branded.', color: 'from-cyan-500 to-teal-600' },
]

const stats = [
  { value: '100+', label: 'Lembaga' },
  { value: '10K+', label: 'Siswa' },
  { value: '500+', label: 'GTK' },
  { value: '99.9%', label: 'Uptime' },
]

const testimonials = [
  { name: 'Ustadz Ahmad', role: 'Kepala MI Al-Hikmah', text: 'Dulu butuh 3 hari buat rekap absensi. Sekarang 5 menit. JURNALKU game changer!', avatar: 'A' },
  { name: 'Ibu Siti', role: 'Operator SDN 1 Bandung', text: 'Setup-nya gampang banget. Guru-guru langsung bisa pakai tanpa pelatihan.', avatar: 'S' },
  { name: 'Pak Budi', role: 'Wali Kelas 5 SD', text: 'Input nilai, jurnal harian, rapor — semua dari HP. Praktis sekali.', avatar: 'B' },
]

export default function LandingPage() {
  const { settings } = useSettingsStore()
  const logo = settings.logo || '/logo-jurnalku-256.png'
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar — sticky, blur on scroll */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled || mobileOpen ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center border border-gray-200 shadow-sm overflow-hidden">
                <img src={logo} alt="Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-lg font-extrabold text-gray-900 tracking-tight">JURNALKU</span>
            </div>
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#fitur" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Fitur</a>
              <Link to="/panduan" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Panduan</Link>
              <a href="#testimoni" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Testimoni</a>
              <a href="#demo" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Demo</a>
              <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Masuk</Link>
              <Link to="/register" className="px-5 py-2 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 transition-all shadow-sm">
                Daftar Gratis
              </Link>
            </div>
            {/* Mobile toggle */}
            <button className="md:hidden p-2 text-gray-600" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
          {/* Mobile menu */}
          {mobileOpen && (
            <div className="md:hidden -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-4 space-y-2 border-t border-gray-100 pt-3 bg-white shadow-lg">
              <a href="#fitur" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileOpen(false)}>Fitur</a>
              <Link to="/panduan" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileOpen(false)}>Panduan</Link>
              <a href="#testimoni" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileOpen(false)}>Testimoni</a>
              <a href="#demo" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileOpen(false)}>Demo</a>
              <Link to="/login" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileOpen(false)}>Masuk</Link>
              <Link to="/register" className="block px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold text-center" onClick={() => setMobileOpen(false)}>Daftar Gratis</Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-primary/5 to-indigo-100/50 rounded-full blur-3xl translate-x-1/3 -translate-y-1/4" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-violet-50 to-primary/5 rounded-full blur-3xl -translate-x-1/3 translate-y-1/4" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600 mb-6">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Platform SIMS/M #1 untuk Madrasah & Sekolah
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.1] mb-6">
              Kelola Sekolah,{' '}
              <span className="bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent">Tanpa Ribet.</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-500 leading-relaxed mb-8 max-w-2xl mx-auto">
              Data siswa, jadwal, absensi, keuangan, jurnal KBM, sampai rapor — semua terintegrasi dalam satu platform modern. Gratis untuk memulai.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
              <Link to="/register" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-gray-900 text-white rounded-full font-semibold text-base hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/20">
                Daftar Gratis Coba Sekarang <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-gray-300 text-gray-700 rounded-full font-semibold text-base hover:bg-gray-50 transition-all">
                Masuk
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
              <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-green-500" />Gratis 30 hari</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-green-500" />Setup 15 menit</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 text-center">
            {stats.map(s => (
              <div key={s.label}>
                <div className="text-3xl sm:text-4xl font-extrabold text-gray-900">{s.value}</div>
                <div className="text-sm text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Semua yang Anda Butuhkan</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">Tidak perlu 10 aplikasi berbeda. JURNALKU mencakup seluruh kebutuhan manajemen sekolah dalam satu platform.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div key={i} className="group relative bg-white border border-gray-200 rounded-2xl p-6 hover:border-gray-300 hover:shadow-lg transition-all duration-300">
                <div className={`w-11 h-11 bg-gradient-to-br ${f.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm`}>
                  <f.icon size={22} className="text-white" />
                </div>
                <h3 className="font-bold text-gray-900 text-base mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Panduan & Video (#16) */}
      <section id="panduan" className="py-16 sm:py-24 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Panduan Penggunaan</h2>
            <p className="text-lg text-gray-500">Mulai gunakan JURNALKU dalam 4 langkah mudah</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Video */}
            <div className="relative rounded-2xl overflow-hidden shadow-lg border border-gray-200 aspect-video bg-gray-900 flex flex-col items-center justify-center text-center p-6">
              <PlayCircle size={48} className="text-red-500 mb-3" />
              <p className="text-white font-semibold">Video Tutorial YouTube</p>
              <p className="text-gray-400 text-sm mt-1">Coming Soon</p>
            </div>
            {/* Steps */}
            <div className="space-y-4">
              {[
                { t: 'Daftar & Buat Akun Lembaga', d: 'Registrasi gratis, lengkapi data sekolah/madrasah Anda.' },
                { t: 'Input Data Master', d: 'Tambahkan data siswa, GTK, mata pelajaran, dan rombel — bisa impor Excel.' },
                { t: 'Kelola Jurnal & Absensi', d: 'Guru mencatat jurnal mengajar, absensi siswa dan kegiatan secara digital.' },
                { t: 'Pantau & Laporan', d: 'Kepala sekolah melakukan supervisi, admin memantau keuangan dan rekap.' },
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-4 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-primary text-white font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{s.t}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{s.d}</p>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 mt-2">
                <a href="/register" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors">
                  Daftar Gratis Coba Sekarang
                </a>
                <Link to="/panduan" className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                  Baca Panduan Lengkap <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimoni" className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Apa Kata Mereka</h2>
            <p className="text-lg text-gray-500">Cerita nyata dari sekolah yang sudah pakai JURNALKU</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-200 hover:shadow-md transition-all">
                <div className="flex items-center gap-0.5 mb-3">
                  {[...Array(5)].map((_, j) => <Star key={j} size={14} className="fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coba Demo */}
      <section id="demo" className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Coba Demo</h2>
            <p className="text-lg text-gray-500">Rasakan langsung fitur JURNALKU tanpa perlu daftar</p>
          </div>
          <div className="max-w-lg mx-auto bg-white rounded-2xl border border-gray-200 shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Akun Demo</h3>
              <p className="text-sm text-gray-500">Pilih role, login dan jelajahi semua fitur JURNALKU</p>
              <p className="text-xs text-gray-400 mt-1">URL: <a href="https://demo.jurnal.cc.cd" target="_blank" rel="noreferrer" className="font-mono font-semibold text-primary hover:underline">demo.jurnal.cc.cd</a> · Password: <span className="font-mono font-semibold text-gray-700">demo123</span></p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2 text-sm">
              {[
                { role: 'Admin Lembaga', email: 'admin@jurnal.cc.cd', pwd: 'admin123', badge: 'bg-indigo-100 text-indigo-700' },
                { role: 'Kepala Sekolah', email: 'kepala@jurnal.cc.cd', pwd: 'demo123', badge: 'bg-purple-100 text-purple-700' },
                { role: 'Guru', email: 'guru@jurnal.cc.cd', pwd: 'demo123', badge: 'bg-blue-100 text-blue-700' },
                { role: 'Wali Kelas', email: 'walikelas@jurnal.cc.cd', pwd: 'demo123', badge: 'bg-teal-100 text-teal-700' },
                { role: 'Siswa', email: 'siswa@jurnal.cc.cd', pwd: 'demo123', badge: 'bg-green-100 text-green-700' },
              ].map(a => (
                <div key={a.email} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 last:border-0">
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${a.badge}`}>{a.role}</span>
                  <span className="font-mono text-xs text-gray-700 truncate flex-1 text-right">{a.email}</span>
                </div>
              ))}
            </div>
            <a href="https://demo.jurnal.cc.cd/login" target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-all shadow-sm">
              Buka Demo <ArrowRight size={18} />
            </a>
            <p className="text-xs text-gray-400 text-center mt-4">Data demo di-reset secara berkala</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gray-900 rounded-3xl p-8 sm:p-14 text-center overflow-hidden">
            <div className="absolute inset-0 -z-0">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-60 h-60 bg-indigo-500/20 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">Siap Digitalisasi Sekolah Anda?</h2>
              <p className="text-lg text-gray-300 max-w-xl mx-auto mb-8">
                Daftar gratis sekarang. Setup 15 menit. Langsung pakai.
              </p>
              <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-gray-900 rounded-full font-bold text-base hover:bg-gray-100 shadow-2xl transition-all hover:scale-105">
                Daftar Gratis — Tanpa Kartu Kredit <ArrowRight size={18} />
              </Link>
              <p className="text-sm text-gray-500 mt-4">
                <Clock size={14} className="inline mr-1" /> Gratis 30 hari. Batal kapan saja.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 dark:bg-black border-t border-gray-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-400">Design by <span className="font-semibold text-white">aljadugh</span> all right's reserved @ 2026</p>
        </div>
      </footer>
    </div>
  )
}
