import { Link } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { School, BookOpen, Users, Calendar, Shield, BarChart3, ArrowRight, CheckCircle, Zap, Clock } from 'lucide-react'

const features = [
  { icon: Users, title: 'Data Siswa & GTK Terpusat', desc: 'Kelola ribuan data dalam satu klik. Tidak ada lagi Excel berantakan!' },
  { icon: Calendar, title: 'Jadwal Anti Tabrakan', desc: 'Algoritma pintar deteksi konflik jadwal. Hemat waktu 80% dalam penyusunan.' },
  { icon: BookOpen, title: 'Jurnal & Modul AI', desc: 'Dokumentasi otomatis. AI bantu buat RPP dalam hitungan menit.' },
  { icon: BarChart3, title: 'Keuangan Terintegrasi', desc: 'SPP, tagihan, tabungan dalam satu platform. Laporan real-time kapan saja.' },
  { icon: Shield, title: 'Absensi Multi-Metode', desc: 'QR Code, GPS, Selfie. Tidak ada lagi titip absen atau manipulasi data.' },
  { icon: School, title: 'Multi-Tenant', desc: 'Satu platform untuk semua unit. SD, SMP, SMA dalam satu sistem.' },
]

const benefits = [
  'Hemat waktu administrasi hingga 70%',
  'Data tersimpan aman di cloud dengan backup otomatis',
  'Integrasi WhatsApp untuk notifikasi instant',
  'Laporan lengkap siap untuk akreditasi',
  'Support 24/7 via WhatsApp',
  'Update fitur gratis selamanya'
]

export default function LandingPage() {
  const { settings } = useSettingsStore()
  const logo = settings.logo || '/logo-jurnalku-256.png'
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Navbar */}
      <nav className="bg-white/90 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-primary/10 overflow-hidden">
              <img src={logo} alt="Logo Jurnalku" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-xl font-bold text-gray-900 font-display">JURNALKU</span>
              <p className="text-xs text-gray-500">SIMS/M Terpadu</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark shadow-lg shadow-primary/30 transition-all">Masuk</Link>
            <Link to="/register" className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-primary transition-colors">Mulai Coba Gratis</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-full text-sm font-medium mb-4">
            <Zap size={16} /> Dipercaya 100+ Lembaga Pendidikan
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 font-display leading-tight mb-4">
            Kelola Lembaga Jadi<br />
            <span className="bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent">10x Lebih Cepat!</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto mb-3 leading-relaxed">
            <strong>Bosan dengan administrasi manual yang makan waktu?</strong><br />
            JURNALKU adalah solusi SIMS/M terlengkap yang menghemat waktu Anda hingga <span className="text-primary font-bold">70%</span>.
          </p>
          <p className="text-base text-gray-500 max-w-2xl mx-auto mb-6">
            Data siswa, guru, jadwal, absensi, keuangan, jurnal, sampai rapor — semua terintegrasi dalam satu platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-dark shadow-2xl shadow-primary/40 transition-all hover:scale-105">
              Mulai Gratis Sekarang <ArrowRight size={20} />
            </Link>
            <Link to="/login#demo" className="inline-flex items-center gap-2 px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all">
              Lihat Demo
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <CheckCircle size={16} className="text-green-500" />
              <span>Gratis 30 hari</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle size={16} className="text-green-500" />
              <span>Tanpa kartu kredit</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle size={16} className="text-green-500" />
              <span>Setup 15 menit</span>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white py-10 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 font-display">Mengapa 100+ Lembaga Memilih JURNALKU?</h2>
            <p className="text-base text-gray-600">Karena kami paham betapa sibuknya Anda</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 font-medium">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 font-display">Fitur Lengkap, Semua dalam Satu Platform</h2>
          <p className="text-base text-gray-600">Tidak perlu langganan 10 aplikasi berbeda. JURNALKU = All-in-One.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-xl hover:border-primary/30 transition-all group">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-indigo-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <f.icon size={24} className="text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1.5 text-lg">{f.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-gray-50 py-10 border-y border-gray-200">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 font-display">Bergabung dengan Lembaga-Lembaga Terbaik</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center opacity-60">
            <div className="text-3xl font-bold text-gray-600">SD</div>
            <div className="text-3xl font-bold text-gray-600">SMP</div>
            <div className="text-3xl font-bold text-gray-600">SMA</div>
            <div className="text-3xl font-bold text-gray-600">MA</div>
          </div>
          <p className="text-gray-500 mt-6 text-sm">Dipercaya oleh 100+ lembaga pendidikan di seluruh Indonesia</p>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-gradient-to-r from-primary via-indigo-600 to-purple-600 rounded-3xl p-8 sm:p-12 text-center text-white shadow-2xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3 font-display">Digitalisasi Lembaga Anda Hari Ini!</h2>
          <p className="text-lg text-white/90 mb-2 max-w-2xl mx-auto">
            Jangan biarkan administrasi manual menghabiskan waktu berharga Anda.
          </p>
          <p className="text-base text-white/80 mb-6 max-w-xl mx-auto">
            Mulai coba gratis sekarang. Setup 15 menit. Langsung pakai.
          </p>
          <Link to="/register" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary rounded-xl font-bold text-lg hover:bg-gray-100 shadow-2xl transition-all hover:scale-105">
            Mulai Coba Gratis <ArrowRight size={20} />
          </Link>
          <p className="text-sm text-white/70 mt-4">
            <Clock size={14} className="inline mr-1" />
            Gratis 30 hari. Batal kapan saja.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-sidebar text-white py-6 border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2 text-center">
          <p className="text-sm text-gray-400">
            Design by <span className="font-semibold text-white">aljadugh</span> — All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
