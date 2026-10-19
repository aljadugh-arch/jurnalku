import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, UserCheck, QrCode, MapPin,
  Layers, Activity, Globe, Sparkles, DollarSign, Settings, MessageSquare,
  FileText, ClipboardCheck, ScrollText, School, Wallet, Receipt, DatabaseBackup, Code2, ScanText,
  FileQuestion, Monitor, Star, Building2, CreditCard, Database, Mail, HeartHandshake, ArrowRightLeft, Library, Calculator, BookOpenCheck
} from 'lucide-react'

export interface MenuItem {
  label: string
  icon: React.ReactNode
  path?: string
  external?: string
  children?: { label: string; path: string; external?: string }[]
}

// Admin/operator/TU: urut sesuai alur input data — master data dulu, operasional, lalu pengaturan.
export const adminMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Monitoring Data', icon: <Activity size={20} />, path: '/admin/monitoring' },
  { label: 'Posting', icon: <FileText size={20} />, path: '/admin/posting' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'PPDB', icon: <ClipboardList size={20} />, path: '/admin/ppdb' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Mata Pelajaran', icon: <BookOpen size={20} />, path: '/admin/mapel' },
  { label: 'Rombongan Belajar', icon: <Layers size={20} />, path: '/admin/rombel' },
  { label: 'Kalender KBM', icon: <Calendar size={20} />, path: '/admin/kalender-kbm' },
  {
    label: 'Jadwal Pelajaran', icon: <Calendar size={20} />,
    children: [
      { label: 'Kelola Jadwal', path: '/admin/jadwal' },
      { label: 'Jadwal Ujian', path: '/admin/jadwal-ujian' },
      { label: 'Pengajar', path: '/admin/pengajar' },
    ]
  },
  {
    label: 'Absensi', icon: <UserCheck size={20} />,
    children: [
      { label: 'Presensi Siswa', path: '/admin/absensi-siswa' },
      { label: 'Absensi QR Siswa', path: '/admin/absensi-qr-siswa' },
      { label: 'Kartu RFID', path: '/admin/rfid' },
      { label: 'Panduan Alat Absensi', path: '/admin/panduan-absensi-alat' },
      { label: 'Absensi Guru (Geolokasi)', path: '/admin/absensi-guru' },
      { label: 'Rekapitulasi', path: '/admin/rekap-absensi' },
      { label: 'Ekstrakurikuler', path: '/admin/ekskul' },
      { label: 'Absensi Ekskul', path: '/admin/absensi-ekskul' },
      { label: 'Absensi Jamaah', path: '/admin/absensi-jamaah' },
      { label: 'Absensi Kokurikuler', path: '/admin/absensi-kokurikuler' },
      { label: 'Absensi Kegiatan', path: '/admin/absensi-kegiatan' },
    ]
  },
  { label: 'Ceklok & Rekap', icon: <MapPin size={20} />, path: '/admin/ceklok' },
  { label: 'Absensi Saya', icon: <UserCheck size={20} />, path: '/admin/absensi-saya' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/admin/jurnal' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
  { label: 'Ledger Nilai', icon: <ClipboardCheck size={20} />, path: '/admin/nilai-ledger' },
  { label: 'Rekap Nilai per Mapel', icon: <ClipboardCheck size={20} />, path: '/admin/rekap-nilai' },
  {
    label: 'Ujian & Bank Soal', icon: <FileQuestion size={20} />,
    children: [
      { label: 'Bank Soal', path: '/admin/bank-soal' },
      { label: 'Kisi-kisi Soal', path: '/admin/kisi-kisi' },
      { label: 'Paket Ujian', path: '/admin/paket-ujian' },
    ]
  },
  { label: 'Catatan Kepribadian', icon: <ScrollText size={20} />, path: '/admin/catatan-kepribadian' },
  { label: 'Bimbingan Konseling', icon: <HeartHandshake size={20} />, path: '/admin/bk' },
  { label: 'Alumni & Mutasi', icon: <ArrowRightLeft size={20} />, path: '/admin/mutasi' },
  { label: 'Sirkulasi Perpustakaan', icon: <Library size={20} />, path: '/admin/pustaka' },
  { label: 'Substitusi Guru', icon: <UserCheck size={20} />, path: '/admin/substitusi' },
  { label: 'Payroll & JTM', icon: <Wallet size={20} />, path: '/admin/payroll' },
  { label: 'RKAS & BOS', icon: <Calculator size={20} />, path: '/admin/rkas' },
  { label: 'Materi Ajar', icon: <BookOpenCheck size={20} />, path: '/admin/lms' },
  { label: 'Generator AI Guru', icon: <Sparkles size={20} />, path: '/admin/modul-ajar' },
  { label: 'Perpustakaan Digital', icon: <BookOpen size={20} />, path: '/admin/perpustakaan' },
  { label: 'Administrasi Surat', icon: <ScrollText size={20} />, path: '/admin/administrasi' },
  { label: 'Program Belajar', icon: <BookOpen size={20} />, path: '/admin/program-belajar' },
  { label: 'Tahun Ajaran', icon: <School size={20} />, path: '/admin/tahun-ajaran' },
  {
    label: 'Keuangan', icon: <DollarSign size={20} />,
    children: [
      { label: 'Tagihan & Pembayaran', path: '/admin/tagihan' },
      { label: 'Tabungan Siswa', path: '/admin/tabungan' },
      { label: 'Payment Gateway QRIS', path: '/admin/payment-gateway' },
    ]
  },
  {
    label: 'WhatsApp', icon: <MessageSquare size={20} />,
    children: [
      { label: 'Broadcast', path: '/admin/broadcast' },
      // Admin lembaga menyambungkan NOMOR LEMBAGA sendiri di sini. Nomor platform
      // (tenant `default`) dijaga di server: admin lembaga ditolak 403 bila
      // mencoba menyentuhnya, jadi QR platform tidak bisa tergantikan.
      { label: 'Sambungkan WA', path: '/admin/wa-gateway' },
      { label: 'Notifikasi Otomatis', path: '/admin/notif-settings' },
    ]
  },
  { label: 'Pengaturan', icon: <Settings size={20} />, path: '/admin/settings' },
  { label: 'SMTP & IMAP', icon: <Mail size={20} />, path: '/admin/smtp' },
  { label: 'REST API Developer', icon: <Code2 size={20} />, path: '/admin/developer-api' },
  { label: 'Manajemen Pengguna', icon: <UserCheck size={20} />, path: '/admin/users' },
  { label: 'Manajemen Lembaga', icon: <Globe size={20} />, path: '/admin/tenants' },
  { label: 'Integrasi Se-Yayasan', icon: <Users size={20} />, path: '/admin/foundation-sync' },
  { label: 'Backup & Restore', icon: <DatabaseBackup size={20} />, path: '/admin/backup-restore' },
  { label: 'Lihat Website Lembaga', icon: <Globe size={20} />, path: '/', external: '/' },
  {
    label: 'E-Kantin & Cashless', icon: <DollarSign size={20} />,
    children: [
      { label: 'Menu Kantin', path: '/admin/kantin-menu' },
      { label: 'Order Kantin', path: '/admin/kantin-orders' },
      { label: 'Verifikasi Topup Manual', path: '/admin/cashless-topup' },
      { label: 'Konfigurasi Bank Transfer', path: '/admin/cashless-bank-config' },
      { label: 'Kasir QR Scanner', path: '/admin/kantin-scanner' },
    ]
  },
]

export const guruMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/guru' },
  { label: 'Posting', icon: <FileText size={20} />, path: '/guru/posting' },
  {
    label: 'Mengajar', icon: <ClipboardList size={20} />,
    children: [
      { label: 'Jurnal Mengajar', path: '/guru/jurnal' },
      { label: 'Jadwal Saya', path: '/guru/jadwal' },
      { label: 'Penugasan', path: '/guru#tugas' },
    ]
  },
  {
    label: 'Absensi', icon: <UserCheck size={20} />,
    children: [
      { label: 'Absensi Harian', path: '/guru/absensi-siswa' },
      { label: 'Absensi Mapel', path: '/guru/absensi-mapel' },
      { label: 'Absensi Ekskul', path: '/guru/absensi-ekskul' },
      { label: 'Absensi Saya', path: '/guru/absensi-guru' },
    ]
  },
  {
    label: 'Penilaian', icon: <ClipboardCheck size={20} />,
    children: [
      { label: 'Penilaian Harian', path: '/guru/penilaian-harian' },
      { label: 'Penilaian Ekskul', path: '/guru/penilaian-ekskul' },
      { label: 'Nilai STS', path: '/guru/nilai-sts' },
      { label: 'Nilai SAS', path: '/guru/nilai-sas' },
      { label: 'Rekap Nilai per Mapel', path: '/guru/rekap-nilai' },
      { label: 'Koreksi Jawaban (AI+OCR)', path: '/guru/koreksi-jawaban' },
      { label: 'Catatan Kepribadian', path: '/guru/catatan-kepribadian' },
    ]
  },
  {
    label: 'Ujian & Bank Soal', icon: <FileQuestion size={20} />,
    children: [
      { label: 'Bank Soal', path: '/guru/bank-soal' },
      { label: 'Kisi-kisi Soal', path: '/guru/kisi-kisi' },
      { label: 'Paket Ujian', path: '/guru/paket-ujian' },
    ]
  },
  { label: 'Generator AI Guru', icon: <Sparkles size={20} />, path: '/guru/modul-ajar' },
  { label: 'Perpustakaan Digital', icon: <BookOpen size={20} />, path: '/guru/perpustakaan' },
]

export const proktorMenuItems: MenuItem[] = [
  { label: 'Monitor Ujian', icon: <Monitor size={20} />, path: '/proktor' },
]

export const siswaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/siswa' },
  { label: 'Absensi Saya', icon: <QrCode size={20} />, path: '/siswa/absensi' },
  { label: 'Jadwal', icon: <Calendar size={20} />, path: '/siswa/jadwal' },
  { label: 'Ekskul', icon: <Activity size={20} />, path: '/siswa/ekskul' },
  { label: 'Ujian', icon: <FileQuestion size={20} />, path: '/siswa/ujian' },
  { label: 'Perpustakaan Digital', icon: <BookOpen size={20} />, path: '/siswa/perpustakaan' },
]

// Bendahara: hanya modul keuangan, dashboard, dan perpustakaan — tidak boleh
// mengakses data akademik/administrasi lain milik admin.
export const bendaharaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  {
    label: 'Keuangan', icon: <DollarSign size={20} />,
    children: [
      { label: 'Tagihan & Pembayaran', path: '/admin/tagihan' },
      { label: 'Tabungan Siswa', path: '/admin/tabungan' },
      { label: 'Payment Gateway QRIS', path: '/admin/payment-gateway' },
    ]
  },
  { label: 'Perpustakaan Digital', icon: <BookOpen size={20} />, path: '/admin/perpustakaan' },
]

// Kepala Madrasah/Sekolah = pimpinan, tetap punya ceklok sendiri karena masuk kategori GTK.
export const kepalaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Monitoring Data', icon: <Activity size={20} />, path: '/admin/monitoring' },
  { label: 'Posting', icon: <FileText size={20} />, path: '/admin/posting' },
  { label: 'Ceklok & Rekap', icon: <MapPin size={20} />, path: '/admin/ceklok' },
  { label: 'Absensi Saya', icon: <UserCheck size={20} />, path: '/admin/absensi-saya' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'PPDB', icon: <ClipboardList size={20} />, path: '/admin/ppdb' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
  { label: 'Catatan Kepribadian', icon: <ScrollText size={20} />, path: '/admin/catatan-kepribadian' },
  { label: 'Bimbingan Konseling', icon: <HeartHandshake size={20} />, path: '/admin/bk' },
  { label: 'Rombongan Belajar', icon: <Layers size={20} />, path: '/admin/rombel' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/admin/jurnal' },
  { label: 'Supervisi', icon: <ClipboardCheck size={20} />, path: '/admin/supervisi' },
  { label: 'Administrasi Surat', icon: <ScrollText size={20} />, path: '/admin/administrasi' },
  { label: 'Program Belajar', icon: <BookOpen size={20} />, path: '/admin/program-belajar' },
  { label: 'Perpustakaan Digital', icon: <BookOpen size={20} />, path: '/admin/perpustakaan' },
  {
    label: 'Absensi', icon: <UserCheck size={20} />,
    children: [
      { label: 'Presensi Siswa', path: '/admin/absensi-siswa' },
      { label: 'Absensi QR Siswa', path: '/admin/absensi-qr-siswa' },
      { label: 'Kartu RFID', path: '/admin/rfid' },
      { label: 'Panduan Alat Absensi', path: '/admin/panduan-absensi-alat' },
      { label: 'Absensi Guru (Geolokasi)', path: '/admin/absensi-guru' },
      { label: 'Rekapitulasi', path: '/admin/rekap-absensi' },
    ]
  },
  { label: 'Kalender KBM', icon: <Calendar size={20} />, path: '/admin/kalender-kbm' },
  {
    label: 'Keuangan', icon: <DollarSign size={20} />,
    children: [
      { label: 'Tagihan & Pembayaran', path: '/admin/tagihan' },
      { label: 'Tabungan Siswa', path: '/admin/tabungan' },
    ]
  },
]

// Pilih daftar menu sesuai role.
const restrictedAdminPaths = new Set([
  '/admin/developer-api', '/admin/users', '/admin/settings', '/admin/backup-restore',
  '/admin/wa-gateway', '/admin/notif-settings', '/admin/tenants', '/admin/nilai-ledger', '/admin/rekap-nilai',
])

function filterRoleItems(items: MenuItem[], role?: string): MenuItem[] {
  const isLimitedStaff = role === 'operator' || role === 'tata_usaha' || role === 'tu'
  return items.flatMap(item => {
    if (item.path === '/admin/tenants' && role !== 'super_admin') return []
    if (isLimitedStaff && item.path && restrictedAdminPaths.has(item.path)) return []
    if (!item.children) return [item]
    const children = isLimitedStaff ? item.children.filter(child => !restrictedAdminPaths.has(child.path)) : item.children
    return children.length ? [{ ...item, children }] : []
  })
}

// Super admin platform hanya mengelola lembaga/tenant, bukan operasional akademik
// satu sekolah — sidebar-nya sengaja dipangkas ke 5 menu inti saja.
export const superAdminMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Manajemen Lembaga', icon: <Globe size={20} />, path: '/admin/tenants' },
  { label: 'Invoice Langganan', icon: <Receipt size={20} />, path: '/admin/invoice' },
  { label: 'Manajemen Yayasan', icon: <Building2 size={20} />, path: '/admin/foundations' },
  { label: 'Manajemen Pengguna', icon: <UserCheck size={20} />, path: '/admin/users' },
  { label: 'Backup & Restore', icon: <DatabaseBackup size={20} />, path: '/admin/backup-restore' },
  { label: 'Manajemen Data', icon: <Database size={20} />, path: '/admin/manajemen-data' },
  // WhatsApp platform: sesi tenant `default` = nomor superadmin. Tanpa menu ini
  // superadmin tidak punya cara memindai QR untuk notifikasi platform.
  {
    label: 'WhatsApp Platform', icon: <MessageSquare size={20} />,
    children: [
      { label: 'Sambungkan WA Platform', path: '/admin/wa-gateway' },
      { label: 'Notifikasi Otomatis', path: '/admin/notif-settings' },
    ]
  },
  { label: 'SMTP & IMAP', icon: <Mail size={20} />, path: '/admin/smtp' },
  { label: 'REST API Developer', icon: <Code2 size={20} />, path: '/admin/developer-api' },
  { label: 'Pengaturan', icon: <Settings size={20} />, path: '/admin/settings' },
]

export function menuForRole(role?: string): MenuItem[] {
  if (role === 'super_admin') return superAdminMenuItems
  const items = role === 'kepala' ? kepalaMenuItems
    : role === 'bendahara' ? bendaharaMenuItems
    : ['admin', 'operator', 'tata_usaha', 'tu'].includes(role || '') ? adminMenuItems
    : role === 'guru' || role === 'wali_kelas' ? guruMenuItems
    : role === 'proktor' ? proktorMenuItems
    : siswaMenuItems
  const visible = filterRoleItems(items, role)
  return role === 'wali_kelas'
    ? [
        ...visible,
        { label: 'Ledger Nilai', icon: <ClipboardCheck size={20} />, path: '/guru/nilai-ledger' },
        { label: 'Kelas Wali Saya', icon: <Layers size={20} />, path: '/guru/rombel' },
      ]
    : visible
}

// Ratakan menu (parent + anak submenu) jadi daftar link datar untuk grid ikon.
export interface FlatMenu { label: string; path: string; icon: React.ReactNode; external?: string }
export function flattenMenu(items: MenuItem[]): FlatMenu[] {
  const out: FlatMenu[] = []
  for (const it of items) {
    if (it.children) {
      for (const c of it.children) out.push({ label: c.label, path: c.path, icon: it.icon, external: c.external })
    } else if (it.path) {
      out.push({ label: it.label, path: it.path, icon: it.icon, external: it.external })
    }
  }
  return out
}

// 7 ikon utama grid 4x2 mobile (slot ke-8 = Lainnya).
// Admin/kepala pakai daftar tetap sesuai permintaan; role lain ambil 7 pertama.
const adminPrimaryGrid: FlatMenu[] = [
  { label: 'Kelola Jadwal', path: '/admin/jadwal', icon: <Calendar size={20} /> },
  { label: 'Absensi QR Siswa', path: '/admin/absensi-qr-siswa', icon: <QrCode size={20} /> },
  { label: 'Absensi Guru (Geolokasi)', path: '/admin/absensi-guru', icon: <MapPin size={20} /> },
  { label: 'Posting', path: '/admin/posting', icon: <FileText size={20} /> },
  { label: 'Rekapitulasi', path: '/admin/rekap-absensi', icon: <ClipboardList size={20} /> },
  { label: 'Tagihan & Pembayaran', path: '/admin/tagihan', icon: <DollarSign size={20} /> },
  { label: 'Tabungan Siswa', path: '/admin/tabungan', icon: <School size={20} /> },
]

export function primaryGridForRole(role?: string): FlatMenu[] {
  if (role === 'admin' || role === 'kepala' || role === 'super_admin' || role === 'operator') return adminPrimaryGrid
  if (role === 'siswa') return [
    { label: 'Kehadiran', path: '/siswa#kehadiran', icon: <UserCheck size={20} /> },
    { label: 'Tabungan', path: '/siswa#tabungan', icon: <Wallet size={20} /> },
    { label: 'Tagihan', path: '/siswa#tagihan', icon: <Receipt size={20} /> },
    { label: 'Nilai', path: '/siswa#nilai', icon: <BookOpen size={20} /> },
    { label: 'Jadwal Hari Ini', path: '/siswa#jadwal', icon: <Calendar size={20} /> },
    { label: 'Tugas', path: '/siswa#tugas', icon: <ClipboardCheck size={20} /> },
  ]
  return flattenMenu(menuForRole(role))
    .filter(item => !['/admin', '/guru', '/siswa'].includes(item.path))
    .slice(0, 7)
}
