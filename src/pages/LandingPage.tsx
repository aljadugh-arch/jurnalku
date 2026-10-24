import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  School, BookOpen, Users, Calendar, Shield, BarChart3, ArrowRight, CheckCircle,
  Zap, Clock, Moon, Sun, Wallet, MessageCircle, FileText, LayoutDashboard,
  Sparkles, TrendingUp, Lock, Smartphone, ChevronRight, ChevronDown, Star,
  Menu, X, CreditCard, GraduationCap, HeartHandshake, Building2, ScanLine,
  ClipboardCheck, Library, MonitorPlay, Landmark, BadgeCheck, PlayCircle,
  Database, Bell, Fingerprint, WalletCards, UserCheck, PieChart, Server,
  Megaphone, HelpCircle, Newspaper,
} from 'lucide-react'
import api from '../services/api'
import { labelFitur, fiturPembeda, URUTAN_FITUR } from '../lib/fiturPaket'
import { useSettingsStore } from '../stores/settingsStore'
import { useThemeStore } from '../stores/themeStore'

// ============================================================================
// LANDING PAGE — shell (navbar/hero/footer) mengikuti design system SISFO
// (krem + oranye, lihat src/styles/sisfo.css), sementara konten fitur/harga/
// peran/langkah/FAQ dipertahankan dari versi sebelumnya. Harga paket TIDAK ada
// di sini: diambil dari /api/publik/paket supaya selalu sama dengan yang
// benar-benar ditagih (admin bisa ubah lewat UI).
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
  { icon: Building2, peran: 'Yayasan & Kepala Sekolah', ringkas: 'Pantau seluruh unit dalam satu layar.', poin: ['Rekap gabungan semua unit', 'Laporan siap akreditasi', 'Kendali paket & pengguna', 'Arsip surat dan dokumen'], warna: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900', ikon: 'text-blue-600 dark:text-blue-400' },
  { icon: GraduationCap, peran: 'Guru & Staf', ringkas: 'Kerja administratif berkurang, waktu mengajar bertambah.', poin: ['Jurnal mengajar cepat', 'Absensi sekali tap', 'Input nilai tanpa Excel', 'Modul ajar dibantu AI'], warna: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900', ikon: 'text-emerald-600 dark:text-emerald-400' },
  { icon: UserCheck, peran: 'Siswa', ringkas: 'Jadwal, tugas, dan nilai dalam genggaman.', poin: ['Jadwal pelajaran harian', 'Kartu pelajar digital', 'Riwayat kehadiran', 'Nilai & catatan guru'], warna: 'bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900', ikon: 'text-violet-600 dark:text-violet-400' },
  { icon: HeartHandshake, peran: 'Wali Murid', ringkas: 'Tahu kabar anak tanpa harus datang ke sekolah.', poin: ['Notifikasi kehadiran via WA', 'Pantau nilai real-time', 'Bayar tagihan dari HP', 'Izin tidak hadir online'], warna: 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900', ikon: 'text-amber-600 dark:text-amber-400' },
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

const faq = [
  { t: 'Apa itu JURNALKU?', j: 'JURNALKU adalah sistem informasi manajemen lembaga pendidikan berbasis web. Satu platform untuk data siswa dan GTK, jadwal, absensi, jurnal mengajar, penilaian, rapor, keuangan, sampai notifikasi WhatsApp ke wali murid.' },
  { t: 'Apakah harus memasang aplikasi atau menyiapkan server?', j: 'Tidak. JURNALKU berjalan di browser — cukup buka alamat lembaga dari HP, tablet, atau laptop. Tidak ada instalasi dan tidak perlu menyiapkan server sendiri.' },
  { t: 'Lembaga jenis apa yang cocok memakainya?', j: 'RA/TK, SD/MI, SMP/MTs, SMA/MA/SMK, pesantren, sampai lembaga kursus dan bimbel. Program belajar juga tersedia khusus untuk lembaga nonformal.' },
  { t: 'Bagaimana dengan data dan keamanan?', j: 'Setiap lembaga memiliki database terpisah. Akses dipisah per peran (admin, guru, siswa, wali) sehingga setiap orang hanya melihat data yang menjadi haknya. Backup dapat dijalankan otomatis.' },
  { t: 'Apakah bisa memakai domain sendiri?', j: 'Bisa. Lembaga dapat memakai subdomain yang disediakan atau menghubungkan domain sendiri, sehingga alamat yang dibagikan ke wali murid adalah alamat resmi lembaga.' },
  { t: 'Bagaimana cara mencoba sebelum berlangganan?', j: 'Daftar dan masa uji coba langsung aktif. Coba gratis sekarang juga, dan bisa berhenti kapan saja tanpa biaya.' },
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
  // Portal summary: pengumuman + FAQ publik dari server (halaman publik baru).
  const [pengumuman, setPengumuman] = useState<any[]>([])
  const [faqPublik, setFaqPublik] = useState<any[]>([])

  useEffect(() => {
    let hidup = true
    api.get('/publik/paket')
      .then(r => { if (hidup) setPaket(Array.isArray(r.data?.plans) ? r.data.plans : []) })
      .catch(() => { if (hidup) setPaketGagal(true) })
    return () => { hidup = false }
  }, [])

  useEffect(() => {
    let hidup = true
    api.get('/publik/pengumuman', { timeout: 8000 })
      .then(({ data }) => { if (hidup) setPengumuman(Array.isArray(data?.pengumuman) ? data.pengumuman.slice(0, 3) : []) })
      .catch(() => {})
    api.get('/publik/faq', { timeout: 8000 })
      .then(({ data }) => { if (hidup) setFaqPublik(Array.isArray(data?.faq) ? data.faq.slice(0, 3) : []) })
      .catch(() => {})
    return () => { hidup = false }
  }, [])

  const paketBayar = useMemo(() => paket.filter(p => p.harga > 0), [paket])
  const paketTrial = useMemo(() => paket.find(p => p.harga === 0), [paket])
  const pembeda = useMemo(() => fiturPembeda(paket), [paket])
  const fiturPaket = (p: Paket) => {
    const kunci = pembeda[p.plan]?.length ? pembeda[p.plan] : p.fitur
    return kunci.filter(k => URUTAN_FITUR.includes(k) || true).map(k => labelFitur(k)).slice(0, 10)
  }

  const nav = [
    { label: 'Fitur', href: '#fitur' },
    { label: 'Untuk Siapa', href: '#peran' },
    { label: 'Cara Mulai', href: '#langkah' },
    { label: 'Harga', href: '#harga' },
    { label: 'Tanya Jawab', href: '#faq' },
  ]

  return (
    <div className="sk-root">
      {/* ================= NAVBAR (design system SISFO) ================= */}
      <nav className="sk-nav">
        <div className="sk-nav-inner">
          <Link to="/" className="sk-nav-brand">
            <img src={logo} alt={`Logo ${namaLembaga}`} />
            <span>{namaLembaga}</span>
          </Link>

          <div className="sk-nav-menu">
            {nav.map(n => (
              <a key={n.href} href={n.href} className="sk-nav-link">{n.label}</a>
            ))}
            <Link to="/pengumuman" className="sk-nav-link">Pengumuman</Link>
            <Link to="/faq" className="sk-nav-link">FAQ</Link>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={toggleDark} className="rounded-full p-2 text-slate-400 transition hover:bg-black/5" aria-label="Ganti mode gelap/terang">
              {dark ? <Sun size={17} className="text-amber-500" /> : <Moon size={17} />}
            </button>
            <Link to="/login" className="sk-btn sk-btn--ghost !min-h-0 !px-4 !py-2 text-sm">Masuk</Link>
            <Link to="/register" className="sk-btn !min-h-0 !px-4 !py-2 text-sm">Coba Gratis</Link>
            <button onClick={() => setMenuBuka(v => !v)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 lg:hidden" aria-label="Menu">
              {menuBuka ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {menuBuka && (
          <div className="border-t sk-border-soft px-5 py-2 lg:hidden">
            {nav.map(n => (
              <a key={n.href} href={n.href} onClick={() => setMenuBuka(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium sk-txt-muted">{n.label}</a>
            ))}
            <Link to="/pengumuman" onClick={() => setMenuBuka(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium sk-txt-muted">Pengumuman</Link>
            <Link to="/faq" onClick={() => setMenuBuka(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium sk-txt-muted">FAQ</Link>
            <Link to="/login" onClick={() => setMenuBuka(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold sk-txt-accent">Masuk</Link>
          </div>
        )}
      </nav>

      {/* ================= HERO ================= */}
      <main className="flex flex-1 items-center justify-center px-5 py-12 lg:py-16">
        <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
          <section className="min-w-0">
            <div className="sk-badge"><BadgeCheck size={14} /> Gratis 30 hari · coba gratis sekarang</div>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sk-txt sm:text-4xl">
              Administrasi Rapi,{' '}
              <span className="sk-txt-accent">Mengajar Tenang</span>
            </h1>
            <p className="mt-3 max-w-lg text-base leading-relaxed sk-txt-muted">
              Satu platform untuk seluruh administrasi lembaga. Wali murid dapat kabar lewat
              WhatsApp, guru berhenti lembur di Excel.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="sk-btn">
                Coba Gratis 30 Hari <ArrowRight size={16} />
              </Link>
              {/^(demo\.|demo-)/.test(window.location.hostname) && (
                <Link to="/login#demo" className="sk-btn sk-btn--ghost">
                  <PlayCircle size={18} /> Lihat Demo
                </Link>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm sk-txt-muted">
              {['Gratis 30 hari', 'Aktif dalam 1 menit', 'Data milik lembaga'].map(t => (
                <div key={t} className="flex items-center gap-1.5"><CheckCircle size={16} className="sk-txt-accent" /> <span>{t}</span></div>
              ))}
            </div>
          </section>

          {/* Grid layanan unggulan */}
          <section className="min-w-0">
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: GraduationCap, judul: 'PPDB', sub: 'Penerimaan Siswa Baru', to: '/ppdb' },
                { icon: MonitorPlay, judul: 'Ujian Online', sub: 'Computer Based Test', to: '/ujian-online' },
                { icon: BookOpen, judul: 'LMS', sub: 'Penugasan Digital', to: '/lms' },
                { icon: MessageCircle, judul: 'WhatsApp', sub: 'Kabar ke Wali Murid', to: '/whatsapp' },
              ].map(s => (
                <Link key={s.judul} to={s.to} className="sk-service">
                  <div className="sk-service-icon"><s.icon size={22} /></div>
                  <h3>{s.judul}</h3>
                  <p>{s.sub}</p>
                  <span className="sk-service-arrow">→</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* ================= PORTAL SUMMARY (pengumuman + FAQ) ================= */}
      <section className="mx-auto max-w-6xl px-5 pb-14">
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="sk-card--flat p-5">
            <header className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full sk-bg-soft sk-txt-accent"><Megaphone size={18} /></span>
                <h3 className="font-bold sk-txt">Pengumuman</h3>
              </div>
              <Link to="/pengumuman" className="text-sm font-semibold sk-txt-accent hover:underline">Lihat semua →</Link>
            </header>
            {pengumuman.length === 0 ? (
              <p className="text-sm sk-txt-muted">Belum ada pengumuman terbaru.</p>
            ) : (
              <ul className="space-y-2.5">
                {pengumuman.map(p => (
                  <li key={p.id} className="flex items-start gap-2.5">
                    <Newspaper size={16} className="mt-0.5 shrink-0 sk-txt-accent" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold sk-txt">{p.judul}</p>
                      {p.ringkas && <p className="line-clamp-1 text-xs sk-txt-muted">{p.ringkas}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="sk-card--flat p-5">
            <header className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full sk-bg-soft sk-txt-accent"><HelpCircle size={18} /></span>
                <h3 className="font-bold sk-txt">FAQ Populer</h3>
              </div>
              <Link to="/faq" className="text-sm font-semibold sk-txt-accent hover:underline">Lihat semua FAQ →</Link>
            </header>
            {faqPublik.length === 0 ? (
              <p className="text-sm sk-txt-muted">FAQ belum tersedia.</p>
            ) : (
              <ul className="space-y-2.5">
                {faqPublik.map(f => (
                  <li key={f.id} className="text-sm sk-txt">
                    <span className="font-semibold">{f.pertanyaan}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </section>

      {/* ================= JENJANG ================= */}
      <section className="border-y sk-border-soft bg-white py-10">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-5 text-center text-sm font-medium sk-txt-muted">Satu platform untuk semua jenjang pendidikan</p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {jenjang.map(j => (
              <span key={j} className="px-3 py-1 text-3xl font-bold text-slate-600 opacity-70">{j}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FITUR ================= */}
      <section id="fitur" className="mx-auto max-w-6xl px-4 py-16 scroll-mt-20">
        <div className="mb-10 text-center">
          <span className="text-sm font-bold uppercase tracking-wider sk-txt-accent">Fitur</span>
          <h2 className="mt-1 mb-2 text-2xl font-bold sk-txt sm:text-3xl">Kelola Lembaga Tanpa Aplikasi Terpisah</h2>
          <p className="mx-auto max-w-2xl text-base sk-txt-muted">Tidak perlu berlangganan banyak aplikasi berbeda. Setiap modul membaca data yang sama, jadi tidak ada pekerjaan input dua kali.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fiturUtama.map((f, i) => (
            <div key={i} className="group rounded-2xl border sk-border-soft bg-white p-6 shadow-[0_10px_30px_rgba(58,48,40,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(58,48,40,0.08)]">
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.warna} transition-transform group-hover:scale-110`}>
                <f.icon size={24} className="text-white" />
              </div>
              <h3 className="mb-1.5 text-lg font-bold sk-txt">{f.judul}</h3>
              <p className="text-sm leading-relaxed sk-txt-muted">{f.isi}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= UNTUK SIAPA ================= */}
      <section id="peran" className="border-y sk-border-soft sk-bg-section py-16 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <span className="text-sm font-bold uppercase tracking-wider sk-txt-accent">Untuk Siapa</span>
            <h2 className="mt-1 mb-2 text-2xl font-bold sk-txt sm:text-3xl">Setiap Peran Punya Tampilannya Sendiri</h2>
            <p className="mx-auto max-w-2xl text-base sk-txt-muted">Yayasan melihat rekap, guru melihat kelasnya, siswa melihat jadwalnya, wali melihat kabar anaknya. Dipercaya 100+ Lembaga pendidikan.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {perPeran.map((p, i) => (
              <div key={i} className="rounded-2xl border sk-border-soft bg-white p-6">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sk-bg-soft">
                    <p.icon size={22} className="sk-txt-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold sk-txt">{p.peran}</h3>
                    <p className="text-sm sk-txt-muted">{p.ringkas}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {p.poin.map(poin => (
                    <li key={poin} className="flex items-start gap-2 text-sm sk-txt-ink">
                      <CheckCircle size={15} className="mt-0.5 shrink-0 sk-txt-accent" />
                      <span>{poin}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= ALASAN (strip ringkas, bukan seksi penuh) ================= */}
      <section className="border-b sk-border-soft">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
            {alasan.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <a.icon size={17} className="mt-0.5 shrink-0 sk-txt-accent" />
                <div>
                  <p className="text-sm font-bold leading-tight sk-txt">{a.judul}</p>
                  <p className="mt-0.5 text-xs leading-snug sk-txt-muted">{a.isi}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CARA MULAI ================= */}
      <section id="langkah" className="mx-auto max-w-6xl px-4 py-16 scroll-mt-20">
        <div className="mb-10 text-center">
          <span className="text-sm font-bold uppercase tracking-wider sk-txt-accent">Cara Mulai</span>
          <h2 className="mt-1 mb-2 text-2xl font-bold sk-txt sm:text-3xl">Tiga Langkah, Selesai</h2>
          <p className="text-base sk-txt-muted">Tanpa pemasangan, tanpa pelatihan panjang.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {langkah.map((s, i) => (
            <div key={i} className="relative rounded-2xl border sk-border-soft bg-white p-6">
              <span className="absolute -left-3 -top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f47b20] text-sm font-bold text-white shadow-lg">{i + 1}</span>
              <s.icon size={26} className="mb-3 mt-2 sk-txt-accent" />
              <h3 className="mb-1.5 font-bold sk-txt">{s.judul}</h3>
              <p className="text-sm leading-relaxed sk-txt-muted">{s.isi}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= HARGA (dari API) ================= */}
      <section id="harga" className="border-t sk-border-soft sk-bg-section py-16 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <span className="text-sm font-bold uppercase tracking-wider sk-txt-accent">Harga</span>
            <h2 className="mt-1 mb-2 text-2xl font-bold sk-txt sm:text-3xl">Pilih Sesuai Kebutuhan Lembaga</h2>
            <p className="mx-auto max-w-2xl text-base sk-txt-muted">Semua paket berbayar dihitung per lembaga, bukan per pengguna. Jumlah guru dan siswa tidak menambah biaya.</p>
          </div>

          {paketGagal ? (
            <p className="text-center text-sm sk-txt-muted">Informasi paket sedang tidak dapat dimuat. Silakan hubungi kami untuk daftar harga terbaru.</p>
          ) : paketBayar.length === 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {[0, 1, 2].map(i => <div key={i} className="h-72 animate-pulse rounded-2xl bg-[#e7e4df]" />)}
            </div>
          ) : (
            <>
              <div className={`grid grid-cols-1 gap-5 ${paketBayar.length >= 3 ? 'md:grid-cols-3' : 'mx-auto max-w-3xl md:grid-cols-2'}`}>
                {paketBayar.map((p, i) => {
                  const disorot = i === Math.min(1, paketBayar.length - 1)
                  return (
                    <div key={p.plan} className={`relative flex flex-col rounded-2xl border-2 bg-white p-6 ${disorot ? 'border-[#f47b20] shadow-2xl shadow-[#f47b20]/15' : 'sk-border-soft'}`}>
                      {disorot && <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#f47b20] px-3 py-1 text-[11px] font-bold text-white">PALING BANYAK DIPILIH</span>}
                      <h3 className="text-lg font-bold sk-txt">{p.label}</h3>
                      <div className="mb-5 mt-3">
                        <span className="text-3xl font-extrabold sk-txt">{rupiah(p.harga)}</span>
                        <span className="text-sm sk-txt-muted">/{p.masa_satuan === 'bulan' ? 'bulan' : p.masa_satuan}</span>
                        <p className="mt-1 text-xs sk-txt-muted">per lembaga / {p.masa_nilai} {p.masa_satuan} · jumlah guru & siswa tidak menambah biaya</p>
                      </div>
                      <ul className="mb-6 flex-1 space-y-2">
                        {fiturPaket(p).map(f => (
                          <li key={f} className="flex items-start gap-2 text-sm sk-txt-ink">
                            <CheckCircle size={15} className="mt-0.5 shrink-0 sk-txt-accent" /><span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Link to="/register" className={`w-full rounded-xl px-5 py-3 text-center font-bold transition-all ${disorot ? 'bg-[#f47b20] text-white hover:bg-[#df6511]' : 'sk-bg-subtle sk-txt hover:bg-[#e7e4df]'}`}>
                        Mulai Paket {p.label}
                      </Link>
                    </div>
                  )
                })}
              </div>
              {paketTrial && (
                <p className="mt-6 text-center text-sm sk-txt-muted">
                  Belum yakin? Coba gratis sekarang juga selama <strong className="sk-txt">{paketTrial.masa_nilai} {paketTrial.masa_satuan}</strong> — bisa berhenti kapan saja.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16 scroll-mt-20">
        <div className="mb-9 text-center">
          <span className="text-sm font-bold uppercase tracking-wider sk-txt-accent">Tanya Jawab</span>
          <h2 className="mt-1 mb-2 text-2xl font-bold sk-txt sm:text-3xl">Pertanyaan yang Sering Diajukan</h2>
        </div>
        <div className="space-y-2.5">
          {faq.map((f, i) => {
            const buka = faqBuka === i
            return (
              <div key={i} className="sk-card--flat overflow-hidden">
                <button onClick={() => setFaqBuka(buka ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left" aria-expanded={buka}>
                  <span className="text-sm font-semibold sk-txt">{f.t}</span>
                  <ChevronDown size={18} className={`shrink-0 sk-txt-muted transition-transform ${buka ? 'rotate-180' : ''}`} />
                </button>
                {buka && <div className="px-5 pb-4"><p className="text-sm leading-relaxed sk-txt-muted">{f.j}</p></div>}
              </div>
            )
          })}
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="relative overflow-hidden rounded-3xl p-8 text-center text-white sm:p-12" style={{ background: 'linear-gradient(135deg, #ff9a20 0%, #f27513 100%)' }}>
          <div className="absolute -right-10 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <h2 className="mb-3 text-2xl font-extrabold sm:text-3xl">Digitalisasi Lembaga Anda Hari Ini</h2>
            <p className="mx-auto mb-7 max-w-xl text-base text-white/85">Daftar sekarang — aktif seketika, konfirmasi dikirim ke WhatsApp dan email Anda.</p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/register" className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-lg font-bold sk-txt-accent transition-all hover:scale-105 hover:bg-gray-100">Mulai Coba Gratis <ArrowRight size={20} /></Link>
              <Link to="/panduan" className="inline-flex items-center gap-2 rounded-xl border-2 border-white/40 px-8 py-3.5 font-semibold text-white hover:bg-white/10"><FileText size={18} /> Baca Panduan</Link>
            </div>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-sm text-white/75"><Clock size={14} /> Gratis 30 hari. Batal kapan saja.</p>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="sk-footer">
        <div className="sk-footer-inner">
          <span>Sistem aman &amp; terintegrasi</span>
          <div className="sk-footer-links">
            <Link to="/pengumuman">Pengumuman</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/kontak">Kontak</Link>
            <Link to="/login">Masuk</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
