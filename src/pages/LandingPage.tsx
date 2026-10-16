import { Link } from 'react-router-dom'
import {
  School, BookOpen, Users, Calendar, Shield, BarChart3, ArrowRight, CheckCircle,
  Zap, Clock, Moon, Sun, Wallet, MessageCircle, FileText, LayoutDashboard,
  Sparkles, TrendingUp, Lock, Smartphone, ChevronRight, Star,
} from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useThemeStore } from '../stores/themeStore'

const features = [
  { icon: Users, title: 'Data Siswa & GTK Terpusat', desc: 'Kelola ribuan data dalam satu klik, lengkap dengan impor Excel dan kartu pelajar.' },
  { icon: Calendar, title: 'Jadwal Anti Tabrakan', desc: 'Deteksi konflik jadwal otomatis. Penyusunan jadwal yang biasanya berhari-hari jadi hitungan menit.' },
  { icon: BookOpen, title: 'Jurnal & Modul AI', desc: 'Dokumentasi mengajar otomatis, dibantu AI untuk menyusun bahan ajar dan modul.' },
  { icon: Wallet, title: 'Keuangan Terintegrasi', desc: 'SPP, tagihan, tabungan, dan QRIS dalam satu platform dengan laporan real-time.' },
  { icon: Shield, title: 'Absensi Multi-Metode', desc: 'QR Code, RFID, GPS, dan selfie. Titip absen dan manipulasi data jadi mustahil.' },
  { icon: BarChart3, title: 'Rapor & Nilai Otomatis', desc: 'Nilai harian, STS, SAS, sampai rapor siap cetak PDF dengan tanda tangan digital.' },
  { icon: MessageCircle, title: 'Notifikasi WhatsApp', desc: 'Wali murid menerima kabar absensi, nilai, dan tagihan langsung ke WhatsApp.' },
  { icon: School, title: 'Multi-Lembaga & Yayasan', desc: 'Satu platform untuk banyak unit dalam satu yayasan, dengan laporan gabungan.' },
  { icon: Lock, title: 'Domain & Data Sendiri', desc: 'Lembaga punya alamat sendiri dan kendali penuh atas datanya, termasuk backup otomatis.' },
]

const benefits = [
  'Hemat waktu administrasi hingga 70%',
  'Data aman di server sendiri dengan backup otomatis',
  'Notifikasi WhatsApp untuk wali murid dan guru',
  'Laporan lengkap siap akreditasi',
  'Bisa dipakai di HP tanpa pasang aplikasi',
  'Update fitur gratis selamanya',
]

const jenjang = ['RA / TK', 'SD / MI', 'SMP / MTs', 'SMA / MA', 'Pesantren', 'Kursus', 'Yayasan']

const langkah = [
  { icon: LayoutDashboard, title: 'Daftar', desc: 'Isi data lembaga, nama admin, email, dan nomor WhatsApp. Selesai dalam satu menit.' },
  { icon: Sparkles, title: 'Langsung Aktif', desc: 'Masa uji coba 30 hari aktif seketika. Notifikasi dikirim ke WhatsApp dan email Anda.' },
  { icon: TrendingUp, title: 'Mulai Kelola', desc: 'Impor data siswa dan GTK, susun jadwal, lalu jalankan absensi dan keuangan.' },
]

const modul = [
  { label: 'Dashboard & Monitoring', icon: LayoutDashboard },
  { label: 'Data Siswa & GTK', icon: Users },
  { label: 'Jadwal & Kalender', icon: Calendar },
  { label: 'Absensi QR / RFID', icon: Shield },
  { label: 'Jurnal Mengajar', icon: BookOpen },
  { label: 'Nilai & Rapor', icon: FileText },
  { label: 'Keuangan & QRIS', icon: Wallet },
  { label: 'Notifikasi WhatsApp', icon: MessageCircle },
]

export default function LandingPage() {
  const { settings } = useSettingsStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const logo = settings.logo || '/logo-jurnalku-256.png'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-gray-100 transition-colors">
      {/* Navbar */}
      <nav className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-slate-200 dark:border-gray-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white dark:bg-gray-900 rounded-lg flex items-center justify-center border border-primary/10 dark:border-gray-800 overflow-hidden">
              <img src={logo} alt="Logo Jurnalku" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-xl font-bold text-slate-900 dark:text-white font-display">JURNALKU</span>
              <p className="text-xs text-slate-500 dark:text-gray-400">SIMS/M Terpadu</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleDark}
              className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-800 transition"
              aria-label={dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              title={dark ? 'Mode Terang' : 'Mode Gelap'}
            >
              {dark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} />}
            </button>
            <Link to="/login" className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark shadow-lg shadow-primary/30 transition-all">Masuk</Link>
            <Link to="/register" className="hidden sm:inline px-4 py-2 text-sm font-medium text-slate-700 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors">Mulai Coba Gratis</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Latar dekoratif: blob lembut + pola titik halus */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-16 w-80 h-80 bg-primary/15 dark:bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute top-24 right-0 w-96 h-96 bg-indigo-500/15 dark:bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-emerald-400/10 dark:bg-emerald-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-14 pb-16 sm:pt-20 sm:pb-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Kiri: pesan */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-medium mb-5">
                <Zap size={16} /> Dipercaya 100+ Lembaga Pendidikan
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-slate-900 dark:text-white font-display leading-[1.1] mb-5">
                Kelola Lembaga Jadi{' '}
                <span className="bg-gradient-to-r from-primary via-indigo-500 to-purple-500 bg-clip-text text-transparent">10x Lebih Cepat</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-gray-300 max-w-xl mx-auto lg:mx-0 mb-6 leading-relaxed">
                Administrasi manual menghabiskan waktu Anda. JURNALKU menyatukan data siswa, guru, jadwal,
                absensi, keuangan, jurnal, dan rapor dalam satu platform yang rapi — hemat hingga{' '}
                <span className="text-primary font-bold">70% waktu</span>.
              </p>
              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 mb-7">
                <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-dark shadow-2xl shadow-primary/40 transition-all hover:scale-105">
                  Mulai Gratis Sekarang <ArrowRight size={20} />
                </Link>
                <Link to="/login#demo" className="inline-flex items-center gap-2 px-8 py-4 border-2 border-slate-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 rounded-xl font-semibold hover:bg-white dark:hover:bg-gray-800 transition-all">
                  Lihat Demo
                </Link>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-gray-400">
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={16} className="text-emerald-500" />
                  <span>Gratis 30 hari</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={16} className="text-emerald-500" />
                  <span>Tanpa kartu kredit</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={16} className="text-emerald-500" />
                  <span>Aktif dalam 1 menit</span>
                </div>
              </div>
            </div>

            {/* Kanan: mockup dashboard ringkas (CSS murni, tanpa gambar) */}
            <div className="relative">
              <div className="absolute -inset-3 bg-gradient-to-tr from-primary/20 via-indigo-500/10 to-transparent rounded-[28px] blur-2xl" />
              <div className="relative rounded-3xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
                {/* Bar jendela */}
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-900/80 px-4 py-3">
                  <span className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                  <div className="ml-3 flex-1 rounded-md bg-white dark:bg-gray-800 px-3 py-1 text-[11px] text-slate-400 border border-slate-100 dark:border-gray-700">
                    jurnal.lembaga-anda.sch.id
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {/* Kartu ringkas */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/10 p-3">
                      <Users size={16} className="text-primary mb-1" />
                      <p className="text-lg font-bold text-slate-800 dark:text-gray-100">486</p>
                      <p className="text-[10px] text-slate-500 dark:text-gray-400">Siswa aktif</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 p-3">
                      <Shield size={16} className="text-emerald-600 mb-1" />
                      <p className="text-lg font-bold text-slate-800 dark:text-gray-100">98%</p>
                      <p className="text-[10px] text-slate-500 dark:text-gray-400">Hadir hari ini</p>
                    </div>
                    <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 p-3">
                      <Wallet size={16} className="text-indigo-600 mb-1" />
                      <p className="text-lg font-bold text-slate-800 dark:text-gray-100">Lunas</p>
                      <p className="text-[10px] text-slate-500 dark:text-gray-400">SPP bulan ini</p>
                    </div>
                  </div>
                  {/* Baris jadwal */}
                  {[
                    { jam: '07:00', mapel: 'Matematika', kelas: 'VII-A', warna: 'bg-primary' },
                    { jam: '08:20', mapel: 'Bahasa Indonesia', kelas: 'VIII-B', warna: 'bg-indigo-500' },
                    { jam: '09:40', mapel: 'IPA Terpadu', kelas: 'IX-C', warna: 'bg-emerald-500' },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-gray-800 p-3">
                      <span className={`h-9 w-1.5 rounded-full ${r.warna}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-gray-100">{r.mapel}</p>
                        <p className="text-[11px] text-slate-500 dark:text-gray-400">{r.kelas} · {r.jam}</p>
                      </div>
                      <CheckCircle size={16} className="shrink-0 text-emerald-500" />
                    </div>
                  ))}
                  {/* Notifikasi WA */}
                  <div className="flex items-start gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 p-3">
                    <MessageCircle size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                      <strong>Notifikasi terkirim.</strong> Wali murid menerima kabar kehadiran anaknya lewat WhatsApp.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white dark:bg-gray-900 py-12 border-y border-slate-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 font-display">Mengapa 100+ Lembaga Memilih JURNALKU?</h2>
            <p className="text-base text-slate-600 dark:text-gray-400">Karena kami paham betapa sibuknya Anda</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900">
                <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-700 dark:text-gray-200 font-medium">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="text-center mb-9">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 font-display">Fitur Lengkap, Semua dalam Satu Platform</h2>
          <p className="text-base text-slate-600 dark:text-gray-400">Tidak perlu langganan banyak aplikasi berbeda. JURNALKU = All-in-One.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm dark:shadow-none border border-slate-100 dark:border-gray-800 hover:shadow-xl hover:border-primary/30 dark:hover:border-primary/50 hover:-translate-y-0.5 transition-all group">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-indigo-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <f.icon size={24} className="text-white" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-1.5 text-lg">{f.title}</h3>
              <p className="text-slate-600 dark:text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cara mulai */}
      <section className="bg-slate-100/70 dark:bg-gray-900/60 py-14 border-y border-slate-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-9">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 font-display">Mulai dalam Tiga Langkah</h2>
            <p className="text-base text-slate-600 dark:text-gray-400">Tanpa pemasangan, tanpa pelatihan panjang.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {langkah.map((s, i) => (
              <div key={i} className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 border border-slate-100 dark:border-gray-800 shadow-sm">
                <span className="absolute -top-3 -left-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/30">
                  {i + 1}
                </span>
                <s.icon size={26} className="text-primary mb-3 mt-2" />
                <h3 className="font-bold text-slate-900 dark:text-white mb-1.5">{s.title}</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-white dark:bg-gray-950 py-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2 font-display">Satu Platform untuk Semua Jenjang</h2>
          <p className="text-slate-500 dark:text-gray-400 mb-7 text-sm">Dipakai lembaga formal, madrasah, pesantren, sampai lembaga kursus.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {jenjang.map((j, i) => (
              <span key={i} className="text-3xl font-bold text-slate-600 dark:text-gray-400 opacity-70 dark:opacity-60 px-3 py-1">
                {j}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-slate-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <Star size={16} className="text-amber-500" />
              <span>Dipakai setiap hari untuk absensi, nilai, dan keuangan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Smartphone size={16} className="text-primary" />
              <span>Berjalan lancar di HP guru dan wali murid</span>
            </div>
          </div>
        </div>
      </section>

      {/* Modul ringkas */}
      <section className="max-w-6xl mx-auto px-4 pb-14">
        <div className="rounded-3xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 font-display">Modul yang tersedia</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {modul.map((m, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-gray-800/60 border border-slate-100 dark:border-gray-800 px-3 py-2.5">
                <m.icon size={16} className="shrink-0 text-primary" />
                <span className="text-xs font-medium text-slate-700 dark:text-gray-200 leading-tight">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="relative overflow-hidden bg-gradient-to-r from-primary via-indigo-600 to-purple-600 rounded-3xl p-8 sm:p-12 text-center text-white shadow-2xl">
          <div className="absolute -top-16 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3 font-display">Digitalisasi Lembaga Anda Hari Ini</h2>
            <p className="text-lg text-white/90 mb-2 max-w-2xl mx-auto">
              Jangan biarkan administrasi manual menghabiskan waktu berharga Anda.
            </p>
            <p className="text-base text-white/80 mb-7 max-w-xl mx-auto">
              Mulai coba gratis sekarang — aktif seketika, dan konfirmasi dikirim ke WhatsApp serta email Anda.
            </p>
            <Link to="/register" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary rounded-xl font-bold text-lg hover:bg-gray-100 shadow-2xl transition-all hover:scale-105">
              Mulai Coba Gratis <ArrowRight size={20} />
            </Link>
            <p className="text-sm text-white/70 mt-5 flex items-center justify-center gap-1.5">
              <Clock size={14} /> Gratis 30 hari. Batal kapan saja.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 dark:bg-black text-white py-8 border-t border-slate-800 dark:border-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 overflow-hidden rounded-lg bg-white/10 flex items-center justify-center">
                <img src={logo} alt="Logo" className="h-full w-full object-contain" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold">JURNALKU</p>
                <p className="text-[11px] text-slate-400">SIMS/M Terpadu</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <Link to="/register" className="text-slate-300 hover:text-white transition-colors inline-flex items-center gap-1">
                Daftar <ChevronRight size={14} />
              </Link>
              <Link to="/login" className="text-slate-300 hover:text-white transition-colors">Masuk</Link>
              <Link to="/login#demo" className="text-slate-300 hover:text-white transition-colors">Demo</Link>
              <Link to="/panduan" className="text-slate-300 hover:text-white transition-colors">Panduan</Link>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-800 dark:border-gray-900 pt-5 text-center">
            <p className="text-sm text-slate-400 dark:text-gray-500">
              Design by <span className="font-semibold text-white">aljadugh</span> — All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
