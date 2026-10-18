import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  School, BookOpen, Users, Calendar, Shield, BarChart3, ArrowRight, CheckCircle,
  Zap, Clock, Moon, Sun, Wallet, MessageCircle, FileText, LayoutDashboard,
  Sparkles, TrendingUp, Lock, Smartphone, ChevronRight, ChevronDown, Star,
  Menu, X, CreditCard, GraduationCap, HeartHandshake, Building2, ScanLine,
  ClipboardCheck, Library, MonitorPlay, Landmark, BadgeCheck, PlayCircle,
  Database, Bell, Fingerprint, WalletCards, UserCheck, PieChart, Server,
} from 'lucide-react'
import api from '../services/api'
import { useSettingsStore } from '../stores/settingsStore'
import { useThemeStore } from '../stores/themeStore'

// ============================================================================
// KONTEN LANDING PAGE — semua teks & daftar ada di sini.
//
// Kalau mau mengubah tampilan/isi, cukup edit array di bawah. Bagian yang
// dirender otomatis mengikuti, jadi tidak perlu menyentuh JSX di bawahnya.
// Harga paket TIDAK ada di sini: diambil dari /api/publik/paket supaya selalu
// sama dengan yang benar-benar ditagih (admin bisa ubah lewat UI).
// ============================================================================

const fiturUtama = [
  { icon: Users, judul: 'Data Siswa & GTK', isi: 'Ribuan data dalam satu tempat, lengkap dengan impor Excel, kartu pelajar, dan riwayat per kelas.', warna: 'from-blue-500 to-indigo-600' },
  { icon: ScanLine, judul: 'Absensi QR & RFID', isi: 'Tap kartu, pindai QR, atau kenali wajah. Titip absen jadi mustahil karena terikat waktu dan lokasi.', warna: 'from-emerald-500 to-teal-600' },
  { icon: BookOpen, judul: 'Jurnal Mengajar', isi: 'Guru mencatat KBM dalam hitungan detik. Rekap otomatis siap dipakai untuk supervisi dan akreditasi.', warna: 'from-violet-500 to-purple-600' },
  { icon: ClipboardCheck, judul: 'Nilai & Rapor', isi: 'Nilai harian, STS, SAS, sampai rapor siap cetak dengan tanda tangan digital. Tanpa hitung manual.', warna: 'from-amber-500 to-orange-600' },
  { icon: WalletCards, judul: 'Keuangan & QRIS', isi: 'SPP, tagihan, tabungan, dan pembayaran QRIS. Laporan masuk langsung, tanpa rekap buku kas.', warna: 'from-rose-500 to-pink-600' },
  { icon: Bell, judul: 'Notifikasi WhatsApp', isi: 'Wali murid menerima kabar kehadiran, nilai, dan tagihan langsung ke WhatsApp — tanpa pasang aplikasi.', warna: 'from-green-500 to-emerald-600' },
  { icon: Calendar, judul: 'Jadwal Anti Tabrakan', isi: 'Konflik jadwal terdeteksi otomatis. Penyusunan yang biasanya berhari-hari selesai dalam hitungan menit.', warna: 'from-cyan-500 to-blue-600' },
  { icon: Library, judul: 'Perpustakaan Digital', isi: 'Katalog buku, peminjaman, dan pengembalian tercatat rapi. Terhubung ke penyimpanan awan lembaga.', warna: 'from-indigo-500 to-violet-600' },
  { icon: MonitorPlay, judul: 'Ujian Online (CBT)', isi: 'Bank soal, paket ujian, token, dan penilaian otomatis. Hasil langsung terlihat tanpa koreksi manual.', warna: 'from-fuchsia-500 to-purple-600' },
]

const perPeran = [
  {
    icon: Building2, peran: 'Yayasan & Kepala Sekolah',
    ringkas: 'Pantau seluruh unit dalam satu layar.',
    poin: ['Rekap gabungan semua unit', 'Laporan siap akreditasi', 'Kendali paket & pengguna', 'Arsip surat dan dokumen'],
    warna: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900', ikon: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: GraduationCap, peran: 'Guru & Staf',
    ringkas: 'Kerja administratif berkurang, waktu mengajar bertambah.',
    poin: ['Jurnal mengajar cepat', 'Absensi sekali tap', 'Input nilai tanpa Excel', 'Modul ajar dibantu AI'],
    warna: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900', ikon: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    icon: UserCheck, peran: 'Siswa',
    ringkas: 'Jadwal, tugas, dan nilai dalam genggaman.',
    poin: ['Jadwal pelajaran harian', 'Kartu pelajar digital', 'Riwayat kehadiran', 'Nilai & catatan guru'],
    warna: 'bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900', ikon: 'text-violet-600 dark:text-violet-400',
  },
  {
    icon: HeartHandshake, peran: 'Wali Murid',
    ringkas: 'Tahu kabar anak tanpa harus datang ke sekolah.',
    poin: ['Notifikasi kehadiran via WA', 'Pantau nilai real-time', 'Bayar tagihan dari HP', 'Izin tidak hadir online'],
    warna: 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900', ikon: 'text-amber-600 dark:text-amber-400',
  },
]

const alasan = [
  { icon: Database, judul: 'Satu Data, Tidak Dobel', isi: 'Semua modul membaca data yang sama. Ubah sekali di satu tempat, berubah di seluruh sistem — tidak ada input ulang.' },
  { icon: Server, judul: 'Data Milik Lembaga', isi: 'Database terpisah untuk setiap lembaga, backup otomatis, dan kendali penuh atas domain sendiri.' },
  { icon: Zap, judul: 'Langsung Pakai', isi: 'Tanpa instalasi, tanpa server sendiri. Buka browser di HP atau laptop, langsung bekerja.' },
  { icon: Lock, judul: 'Akses Berlapis', isi: 'Peran admin, guru, siswa, dan wali dipisah tegas. Setiap orang hanya melihat yang menjadi haknya.' },
  { icon: PieChart, judul: 'Laporan Siap Pakai', isi: 'Rekap kehadiran, nilai, dan keuangan tersedia tanpa perlu menyusun sendiri di Excel.' },
  { icon: Smartphone, judul: 'Ringan di HP', isi: 'Dirancang untuk jaringan sekolah apa adanya. Tetap responsif walau sinyal pas-pasan.' },
]

const langkah = [
  { icon: LayoutDashboard, judul: 'Daftar Lembaga', isi: 'Isi nama lembaga, admin, email, dan WhatsApp. Selesai kurang dari satu menit.' },
  { icon: Sparkles, judul: 'Akun Aktif Seketika', isi: 'Masa uji coba langsung berjalan. Konfirmasi dikirim ke WhatsApp dan email.' },
  { icon: TrendingUp, judul: 'Mulai Kelola', isi: 'Impor data siswa & GTK, susun jadwal, lalu jalankan absensi dan keuangan.' },
]

const jenjang = ['RA / TK', 'SD / MI', 'SMP / MTs', 'SMA / MA / SMK', 'Pesantren', 'Kursus & Bimbel', 'Yayasan']

// Label manusiawi untuk kode fitur dari API paket.
const LABEL_FITUR: Record<string, string> = {
  master_data: 'Data siswa, GTK, mapel, rombel',
  jadwal: 'Jadwal pelajaran & kalender KBM',
  absensi: 'Absensi QR / RFID / GPS',
  jurnal: 'Jurnal mengajar guru',
  penilaian: 'Nilai, rapor, catatan kepribadian',
  keuangan: 'Tagihan, tabungan, beasiswa',
  whatsapp: 'Notifikasi & broadcast WhatsApp',
  posting: 'Postingan / feed lembaga',
  modul_ajar: 'Generator modul ajar (AI)',
  backup_drive: 'Backup otomatis Google Drive',
  website: 'Domain sendiri & website publik',
  rest_api: 'REST API untuk integrasi',
  cashless: 'Cashless penuh',
  ekantin: 'Modul kantin & pesanan',
  ppdb: 'PPDB online',
  administrasi: 'Administrasi surat menyurat',
  perpustakaan: 'Perpustakaan digital',
  ujian: 'Bank soal & ujian online (CBT)',
  program_belajar: 'Program & level (lembaga kursus)',
  smtp: 'Email dari domain lembaga',
  monitoring: 'Monitoring data & ledger nilai',
  foundation: 'Integrasi se-yayasan',
}

const faq = [
  { t: 'Apa itu JURNALKU?', j: 'JURNALKU adalah sistem informasi manajemen lembaga pendidikan berbasis web. Satu platform untuk data siswa dan GTK, jadwal, absensi, jurnal mengajar, penilaian, rapor, keuangan, sampai notifikasi WhatsApp ke wali murid.' },
  { t: 'Apakah harus memasang aplikasi atau menyiapkan server?', j: 'Tidak. JURNALKU berjalan di browser — cukup buka alamat lembaga dari HP, tablet, atau laptop. Tidak ada instalasi dan tidak perlu menyiapkan server sendiri.' },
  { t: 'Lembaga jenis apa yang cocok memakainya?', j: 'RA/TK, SD/MI, SMP/MTs, SMA/MA/SMK, pesantren, sampai lembaga kursus dan bimbel. Program belajar juga tersedia khusus untuk lembaga nonformal.' },
  { t: 'Bagaimana dengan data dan keamanan?', j: 'Setiap lembaga memiliki database terpisah. Akses dipisah per peran (admin, guru, siswa, wali) sehingga setiap orang hanya melihat data yang menjadi haknya. Backup dapat dijalankan otomatis.' },
  { t: 'Apakah bisa memakai domain sendiri?', j: 'Bisa. Lembaga dapat memakai subdomain yang disediakan atau menghubungkan domain sendiri, sehingga alamat yang dibagikan ke wali murid adalah alamat resmi lembaga.' },
  { t: 'Apakah orang tua perlu akun?', j: 'Untuk memantau, ya — satu akun wali terhubung ke anaknya. Tapi notifikasi penting seperti kehadiran dan tagihan tetap dikirim lewat WhatsApp tanpa perlu membuka aplikasi.' },
  { t: 'Bagaimana cara mencoba sebelum berlangganan?', j: 'Daftar dan masa uji coba langsung aktif. Tidak perlu kartu kredit, dan bisa berhenti kapan saja tanpa biaya.' },
  { t: 'Apakah ada pendampingan saat mulai?', j: 'Ada. Panduan penggunaan tersedia di dalam aplikasi, dan tim dapat membantu proses awal seperti impor data siswa dan penyusunan jadwal.' },
]

const rupiah = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID')

type Paket = { plan: string; label: string; harga: number; masa_nilai: number; masa_satuan: string; urutan: number; fitur: string[] }

export default function LandingPage() {
  const { settings } = useSettingsStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const logo = settings.logo || '/logo-jurnalku-256.png'
  const namaLembaga = (settings as any).nama_lembaga || 'JURNALKU'

  const [menuBuka, setMenuBuka] = useState(false)
  const [faqBuka, setFaqBuka] = useState<number | null>(0)
  const [paket, setPaket] = useState<Paket[]>([])
  const [paketGagal, setPaketGagal] = useState(false)

  // Harga diambil dari server. Kalau gagal, seksi harga disembunyikan daripada
  // menampilkan angka karangan yang bisa berbeda dari tagihan sebenarnya.
  useEffect(() => {
    let hidup = true
    api.get('/publik/paket')
      .then(r => { if (hidup) setPaket(Array.isArray(r.data?.plans) ? r.data.plans : []) })
      .catch(() => { if (hidup) setPaketGagal(true) })
    return () => { hidup = false }
  }, [])

  const paketBayar = useMemo(() => paket.filter(p => p.harga > 0), [paket])
  const paketTrial = useMemo(() => paket.find(p => p.harga === 0), [paket])

  // Fitur yang membedakan tiap paket, untuk ditampilkan sebagai daftar centang.
  const fiturPaket = (p: Paket) => {
    const label = p.fitur.map(k => LABEL_FITUR[k]).filter(Boolean)
    return label.slice(0, 8)
  }

  const nav = [
    { label: 'Fitur', href: '#fitur' },
    { label: 'Untuk Siapa', href: '#peran' },
    { label: 'Cara Mulai', href: '#langkah' },
    { label: 'Harga', href: '#harga' },
    { label: 'Tanya Jawab', href: '#faq' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-gray-100 transition-colors">

      {/* ================= NAVBAR ================= */}
      <nav className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-slate-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-10 h-10 bg-white dark:bg-gray-900 rounded-xl flex items-center justify-center border border-primary/10 dark:border-gray-800 overflow-hidden">
              <img src={logo} alt={`Logo ${namaLembaga}`} className="w-full h-full object-contain" />
            </div>
            <div className="leading-tight">
              <span className="text-lg font-bold text-slate-900 dark:text-white font-display">JURNALKU</span>
              <p className="text-[11px] text-slate-500 dark:text-gray-400">SIMS/M Terpadu</p>
            </div>
          </Link>

          {/* Menu desktop */}
          <div className="hidden lg:flex items-center gap-1">
            {nav.map(n => (
              <a key={n.href} href={n.href} className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
                {n.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleDark}
              className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-800 transition"
              aria-label={dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
            >
              {dark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} />}
            </button>
            <Link to="/login" className="hidden sm:inline-flex px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-gray-200 hover:text-primary dark:hover:text-primary transition-colors">
              Masuk
            </Link>
            <Link to="/register" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark shadow-lg shadow-primary/30 transition-all">
              Coba Gratis <ArrowRight size={15} />
            </Link>
            <button
              onClick={() => setMenuBuka(v => !v)}
              className="lg:hidden p-2.5 rounded-lg text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
              aria-label="Menu"
            >
              {menuBuka ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Menu mobile */}
        {menuBuka && (
          <div className="lg:hidden border-t border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col">
              {nav.map(n => (
                <a key={n.href} href={n.href} onClick={() => setMenuBuka(false)} className="py-2.5 text-sm font-medium text-slate-700 dark:text-gray-200 hover:text-primary border-b border-slate-100 dark:border-gray-800 last:border-0">
                  {n.label}
                </a>
              ))}
              <Link to="/login" onClick={() => setMenuBuka(false)} className="py-2.5 text-sm font-semibold text-primary">Masuk ke akun</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-16 w-80 h-80 bg-primary/15 dark:bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute top-24 right-0 w-96 h-96 bg-indigo-500/15 dark:bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-emerald-400/10 dark:bg-emerald-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-14 pb-16 sm:pt-20 sm:pb-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-medium mb-5">
                <BadgeCheck size={16} /> Dipakai lembaga formal, madrasah, pesantren & kursus
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.3rem] font-extrabold text-slate-900 dark:text-white font-display leading-[1.1] mb-5">
                Administrasi Rapi,{' '}
                <span className="bg-gradient-to-r from-primary via-indigo-500 to-purple-500 bg-clip-text text-transparent">Mengajar Tenang</span>
              </h1>
              <p className="text-sm font-semibold text-primary mb-2">Kelola Lembaga · Dipercaya 100+ Lembaga</p>
              <p className="text-lg text-slate-600 dark:text-gray-300 max-w-xl mx-auto lg:mx-0 mb-6 leading-relaxed">
                Data siswa, jadwal, absensi, jurnal, nilai, rapor, dan keuangan dalam satu platform.
                Wali murid dapat kabar lewat WhatsApp. Guru tidak lagi lembur di Excel.
              </p>
              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 mb-7">
                <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-dark shadow-2xl shadow-primary/40 transition-all hover:scale-105">
                  Mulai Gratis Sekarang <ArrowRight size={20} />
                </Link>
                <Link to="/login#demo" className="inline-flex items-center gap-2 px-8 py-4 border-2 border-slate-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 rounded-xl font-semibold hover:bg-white dark:hover:bg-gray-800 transition-all">
                  <PlayCircle size={19} /> Lihat Demo
                </Link>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-gray-400">
                {['Gratis 30 hari', 'Tanpa kartu kredit', 'Aktif dalam 1 menit'].map(t => (
                  <div key={t} className="flex items-center gap-1.5">
                    <CheckCircle size={16} className="text-emerald-500" /> <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mockup dashboard — CSS murni, tanpa gambar */}
            <div className="relative">
              <div className="absolute -inset-3 bg-gradient-to-tr from-primary/20 via-indigo-500/10 to-transparent rounded-[28px] blur-2xl" />
              <div className="relative rounded-3xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-900/80 px-4 py-3">
                  <span className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                  <div className="ml-3 flex-1 rounded-md bg-white dark:bg-gray-800 px-3 py-1 text-[11px] text-slate-400 border border-slate-100 dark:border-gray-700">
                    jurnal.lembaga-anda.sch.id
                  </div>
                </div>
                <div className="p-4 space-y-3">
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

      {/* ================= JENJANG ================= */}
      <section className="bg-white dark:bg-gray-900 py-10 border-y border-slate-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-center text-sm font-medium text-slate-500 dark:text-gray-400 mb-5">
            Satu platform untuk semua jenjang pendidikan
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {jenjang.map(j => (
              <span key={j} className="text-3xl font-bold text-slate-600 dark:text-gray-400 opacity-70 dark:opacity-60 px-3 py-1">
                {j}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FITUR ================= */}
      <section id="fitur" className="max-w-6xl mx-auto px-4 py-16 scroll-mt-20">
        <div className="text-center mb-10">
          <span className="text-sm font-bold text-primary uppercase tracking-wider">Fitur</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 mt-1 font-display">
            Semua yang Dibutuhkan, Tanpa Aplikasi Terpisah
          </h2>
          <p className="text-base text-slate-600 dark:text-gray-400 max-w-2xl mx-auto">
            Tidak perlu berlangganan banyak aplikasi berbeda. Setiap modul membaca data yang sama,
            jadi tidak ada pekerjaan input dua kali.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fiturUtama.map((f, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-gray-800 hover:shadow-xl hover:border-primary/30 dark:hover:border-primary/50 hover:-translate-y-0.5 transition-all group">
              <div className={`w-12 h-12 bg-gradient-to-br ${f.warna} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <f.icon size={24} className="text-white" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-1.5 text-lg">{f.judul}</h3>
              <p className="text-slate-600 dark:text-gray-400 text-sm leading-relaxed">{f.isi}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= UNTUK SIAPA ================= */}
      <section id="peran" className="bg-slate-100/70 dark:bg-gray-900/60 py-16 border-y border-slate-200 dark:border-gray-800 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Untuk Siapa</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 mt-1 font-display">
              Setiap Peran Punya Tampilannya Sendiri
            </h2>
            <p className="text-base text-slate-600 dark:text-gray-400 max-w-2xl mx-auto">
              Yayasan melihat rekap, guru melihat kelasnya, siswa melihat jadwalnya,
              wali melihat kabar anaknya. Tidak ada yang kebanjiran menu.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {perPeran.map((p, i) => (
              <div key={i} className={`rounded-2xl border p-6 ${p.warna}`}>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-white/70 dark:bg-gray-900/70 flex items-center justify-center shrink-0">
                    <p.icon size={22} className={p.ikon} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{p.peran}</h3>
                    <p className="text-sm text-slate-600 dark:text-gray-300">{p.ringkas}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {p.poin.map(poin => (
                    <li key={poin} className="flex items-start gap-2 text-sm text-slate-700 dark:text-gray-200">
                      <CheckCircle size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{poin}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= ALASAN ================= */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <span className="text-sm font-bold text-primary uppercase tracking-wider">Alasan</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 mt-1 font-display">
            Mengapa Lembaga Memilih JURNALKU
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {alasan.map((a, i) => (
            <div key={i} className="flex items-start gap-3.5 p-5 bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800">
              <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                <a.icon size={19} className="text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-1 text-sm">{a.judul}</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">{a.isi}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= CARA MULAI ================= */}
      <section id="langkah" className="bg-white dark:bg-gray-950 py-16 border-y border-slate-200 dark:border-gray-800 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Cara Mulai</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 mt-1 font-display">Tiga Langkah, Selesai</h2>
            <p className="text-base text-slate-600 dark:text-gray-400">Tanpa pemasangan, tanpa pelatihan panjang.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {langkah.map((s, i) => (
              <div key={i} className="relative bg-slate-50 dark:bg-gray-900 rounded-2xl p-6 border border-slate-100 dark:border-gray-800">
                <span className="absolute -top-3 -left-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/30">
                  {i + 1}
                </span>
                <s.icon size={26} className="text-primary mb-3 mt-2" />
                <h3 className="font-bold text-slate-900 dark:text-white mb-1.5">{s.judul}</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">{s.isi}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HARGA (dari API, bukan hardcoded) ================= */}
      <section id="harga" className="max-w-6xl mx-auto px-4 py-16 scroll-mt-20">
        <div className="text-center mb-10">
          <span className="text-sm font-bold text-primary uppercase tracking-wider">Harga</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 mt-1 font-display">
            Pilih Sesuai Kebutuhan Lembaga
          </h2>
          <p className="text-base text-slate-600 dark:text-gray-400 max-w-2xl mx-auto">
            Semua paket berbayar dihitung per lembaga, bukan per pengguna. Jumlah guru dan siswa tidak menambah biaya.
          </p>
        </div>

        {paketGagal ? (
          <p className="text-center text-sm text-slate-500 dark:text-gray-400">
            Informasi paket sedang tidak dapat dimuat. Silakan hubungi kami untuk daftar harga terbaru.
          </p>
        ) : paketBayar.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-72 rounded-2xl bg-slate-100 dark:bg-gray-800/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-1 gap-5 ${paketBayar.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 max-w-3xl mx-auto'}`}>
              {paketBayar.map((p, i) => {
                const disorot = i === Math.min(1, paketBayar.length - 1)
                return (
                  <div key={p.plan} className={`relative rounded-2xl border-2 p-6 flex flex-col ${disorot ? 'border-primary bg-white dark:bg-gray-900 shadow-2xl shadow-primary/15' : 'border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900'}`}>
                    {disorot && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white text-[11px] font-bold rounded-full whitespace-nowrap">
                        PALING BANYAK DIPILIH
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{p.label}</h3>
                    <div className="mt-3 mb-5">
                      <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{rupiah(p.harga)}</span>
                      <span className="text-sm text-slate-500 dark:text-gray-400">
                        /{p.masa_satuan === 'bulan' ? 'bulan' : p.masa_satuan}
                      </span>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                        per lembaga · {p.masa_nilai} {p.masa_satuan}
                      </p>
                    </div>
                    <ul className="space-y-2 mb-6 flex-1">
                      {fiturPaket(p).map(f => (
                        <li key={f} className="flex items-start gap-2 text-sm text-slate-700 dark:text-gray-300">
                          <CheckCircle size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link to="/register" className={`w-full text-center px-5 py-3 rounded-xl font-bold transition-all ${disorot ? 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/30' : 'bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-gray-100 hover:bg-slate-200 dark:hover:bg-gray-700'}`}>
                      Mulai Paket {p.label}
                    </Link>
                  </div>
                )
              })}
            </div>
            {paketTrial && (
              <p className="text-center text-sm text-slate-500 dark:text-gray-400 mt-6">
                Belum yakin? Coba dulu <strong className="text-slate-700 dark:text-gray-200">{paketTrial.masa_nilai} {paketTrial.masa_satuan}</strong> tanpa biaya —
                tanpa kartu kredit, bisa berhenti kapan saja.
              </p>
            )}
          </>
        )}
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="bg-white dark:bg-gray-900 py-16 border-y border-slate-200 dark:border-gray-800 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-9">
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Tanya Jawab</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2 mt-1 font-display">
              Pertanyaan yang Sering Diajukan
            </h2>
          </div>
          <div className="space-y-2.5">
            {faq.map((f, i) => {
              const buka = faqBuka === i
              return (
                <div key={i} className="rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-slate-50 dark:bg-gray-950/50">
                  <button
                    onClick={() => setFaqBuka(buka ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={buka}
                  >
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">{f.t}</span>
                    <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${buka ? 'rotate-180' : ''}`} />
                  </button>
                  {buka && (
                    <div className="px-5 pb-4 -mt-1">
                      <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">{f.j}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="relative overflow-hidden bg-gradient-to-r from-primary via-indigo-600 to-purple-600 rounded-3xl p-8 sm:p-12 text-center text-white shadow-2xl">
          <div className="absolute -top-16 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3 font-display">Digitalisasi Lembaga Anda Hari Ini</h2>
            <p className="text-lg text-white/90 mb-2 max-w-2xl mx-auto">
              Berhenti mengejar administrasi. Biarkan sistem yang merapikan.
            </p>
            <p className="text-base text-white/80 mb-7 max-w-xl mx-auto">
              Daftar sekarang — aktif seketika, konfirmasi dikirim ke WhatsApp dan email Anda.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary rounded-xl font-bold text-lg hover:bg-gray-100 shadow-2xl transition-all hover:scale-105">
                Mulai Coba Gratis <ArrowRight size={20} />
              </Link>
              <Link to="/panduan" className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/40 text-white rounded-xl font-semibold hover:bg-white/10 transition-all">
                <FileText size={18} /> Baca Panduan
              </Link>
            </div>
            <p className="text-sm text-white/70 mt-5 flex items-center justify-center gap-1.5">
              <Clock size={14} /> Gratis 30 hari. Batal kapan saja.
            </p>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="bg-slate-900 dark:bg-black text-white pt-12 pb-8 border-t border-slate-800 dark:border-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-10 w-10 overflow-hidden rounded-xl bg-white/10 flex items-center justify-center">
                  <img src={logo} alt="Logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-base font-bold">JURNALKU</p>
                  <p className="text-[11px] text-slate-400">SIMS/M Terpadu</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed max-w-md">
                Sistem informasi manajemen untuk lembaga pendidikan — madrasah, pesantren, dan kursus:
                data siswa, absensi, jurnal mengajar, penilaian, rapor, keuangan, dan notifikasi WhatsApp.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold mb-3 text-white">Produk</p>
              <ul className="space-y-2 text-sm">
                <li><a href="#fitur" className="text-slate-400 hover:text-white transition-colors">Fitur</a></li>
                <li><a href="#harga" className="text-slate-400 hover:text-white transition-colors">Harga</a></li>
                <li><a href="#peran" className="text-slate-400 hover:text-white transition-colors">Untuk Siapa</a></li>
                <li><a href="#faq" className="text-slate-400 hover:text-white transition-colors">Tanya Jawab</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold mb-3 text-white">Mulai</p>
              <ul className="space-y-2 text-sm">
                <li><Link to="/register" className="text-slate-400 hover:text-white transition-colors inline-flex items-center gap-1">Daftar Lembaga <ChevronRight size={13} /></Link></li>
                <li><Link to="/login" className="text-slate-400 hover:text-white transition-colors">Masuk</Link></li>
                <li><Link to="/panduan" className="text-slate-400 hover:text-white transition-colors">Panduan</Link></li>
                <li><Link to="/ppdb" className="text-slate-400 hover:text-white transition-colors">PPDB</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 dark:border-gray-900 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} {namaLembaga === 'JURNALKU' ? 'JURNALKU' : namaLembaga}. Hak cipta dilindungi.
            </p>
            <p className="text-xs text-slate-500">
              Design by <span className="font-semibold text-slate-300">aljadugh</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
