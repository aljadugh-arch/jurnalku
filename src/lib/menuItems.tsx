import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar,
  ClipboardList, UserCheck, QrCode, MapPin,
  Layers, Activity, Globe, Sparkles, DollarSign, Settings, MessageSquare,
  FileText, ClipboardCheck, ScrollText, School
} from 'lucide-react'

export interface MenuItem {
  label: string
  icon: React.ReactNode
  path?: string
  children?: { label: string; path: string }[]
}

// Admin/operator/TU: urut sesuai alur input data — master data dulu, operasional, lalu pengaturan.
export const adminMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Mata Pelajaran', icon: <BookOpen size={20} />, path: '/admin/mapel' },
  { label: 'Rombongan Belajar', icon: <Layers size={20} />, path: '/admin/rombel' },
  { label: 'Kalender KBM', icon: <Calendar size={20} />, path: '/admin/kalender-kbm' },
  {
    label: 'Jadwal Pelajaran', icon: <Calendar size={20} />,
    children: [
      { label: 'Kelola Jadwal', path: '/admin/jadwal' },
      { label: 'Pengajar', path: '/admin/pengajar' },
      { label: 'Wali Kelas', path: '/admin/wali-kelas' },
    ]
  },
  {
    label: 'Absensi', icon: <UserCheck size={20} />,
    children: [
      { label: 'Absensi Siswa', path: '/admin/absensi-siswa' },
      { label: 'Absensi Guru (Geolokasi)', path: '/admin/absensi-guru' },
      { label: 'Rekapitulasi', path: '/admin/rekap-absensi' },
      { label: 'Ekstrakurikuler', path: '/admin/ekskul' },
      { label: 'Absensi Ekskul', path: '/admin/absensi-ekskul' },
      { label: 'Absensi Kokurikuler', path: '/admin/absensi-kokurikuler' },
      { label: 'Absensi Kegiatan', path: '/admin/absensi-kegiatan' },
    ]
  },
  { label: 'Ceklok Saya', icon: <MapPin size={20} />, path: '/admin/ceklok' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/admin/jurnal' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
  { label: 'Catatan Kepribadian', icon: <ScrollText size={20} />, path: '/admin/catatan-kepribadian' },
  { label: 'Generator Modul Ajar', icon: <Sparkles size={20} />, path: '/admin/modul-ajar' },
  { label: 'Tahun Ajaran', icon: <School size={20} />, path: '/admin/tahun-ajaran' },
  {
    label: 'Keuangan', icon: <DollarSign size={20} />,
    children: [
      { label: 'Tagihan & Pembayaran', path: '/admin/tagihan' },
      { label: 'Tabungan Siswa', path: '/admin/tabungan' },
    ]
  },
  {
    label: 'WhatsApp', icon: <MessageSquare size={20} />,
    children: [
      { label: 'Broadcast', path: '/admin/broadcast' },
      { label: 'Konfigurasi Gateway', path: '/admin/wa-gateway' },
      { label: 'Notifikasi Otomatis', path: '/admin/notif-settings' },
    ]
  },
  { label: 'Pengaturan', icon: <Settings size={20} />, path: '/admin/settings' },
  { label: 'Manajemen Pengguna', icon: <UserCheck size={20} />, path: '/admin/users' },
  { label: 'Manajemen Lembaga', icon: <Globe size={20} />, path: '/admin/tenants' },
]

export const guruMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/guru' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/guru/jurnal' },
  { label: 'Penilaian Harian', icon: <BookOpen size={20} />, path: '/guru/penilaian-harian' },
  { label: 'Catatan Kepribadian', icon: <ScrollText size={20} />, path: '/guru/catatan-kepribadian' },
  { label: 'Jadwal Saya', icon: <Calendar size={20} />, path: '/guru/jadwal' },
  { label: 'Absensi Siswa', icon: <QrCode size={20} />, path: '/guru/absensi-siswa' },
  { label: 'Absensi Saya', icon: <MapPin size={20} />, path: '/guru/absensi-guru' },
  { label: 'Modul Ajar', icon: <Sparkles size={20} />, path: '/guru/modul-ajar' },
  { label: 'Kelas Wali Saya', icon: <Layers size={20} />, path: '/guru/rombel' },
]

export const siswaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/siswa' },
  { label: 'Absensi Saya', icon: <QrCode size={20} />, path: '/siswa/absensi' },
  { label: 'Jadwal', icon: <Calendar size={20} />, path: '/siswa/jadwal' },
  { label: 'Ekskul', icon: <Activity size={20} />, path: '/siswa/ekskul' },
]

// Kepala Madrasah/Sekolah = pimpinan, tetap punya ceklok sendiri karena masuk kategori GTK.
export const kepalaMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
  { label: 'Ceklok Saya', icon: <MapPin size={20} />, path: '/admin/ceklok' },
  { label: 'Data Siswa', icon: <GraduationCap size={20} />, path: '/admin/siswa' },
  { label: 'Data GTK', icon: <Users size={20} />, path: '/admin/gtk' },
  { label: 'Rapor Siswa', icon: <FileText size={20} />, path: '/admin/rapor' },
  { label: 'Catatan Kepribadian', icon: <ScrollText size={20} />, path: '/admin/catatan-kepribadian' },
  { label: 'Rombongan Belajar', icon: <Layers size={20} />, path: '/admin/rombel' },
  { label: 'Jurnal Mengajar', icon: <ClipboardList size={20} />, path: '/admin/jurnal' },
  { label: 'Supervisi Guru', icon: <ClipboardCheck size={20} />, path: '/admin/supervisi' },
  {
    label: 'Absensi', icon: <UserCheck size={20} />,
    children: [
      { label: 'Absensi Siswa', path: '/admin/absensi-siswa' },
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
export function menuForRole(role?: string): MenuItem[] {
  const items = role === 'kepala' ? kepalaMenuItems
    : role === 'admin' || role === 'super_admin' ? adminMenuItems
    : role === 'guru' || role === 'wali_kelas' ? guruMenuItems
    : siswaMenuItems
  return items.filter(item => item.path !== '/admin/tenants' || role === 'super_admin')
}

// Ratakan menu (parent + anak submenu) jadi daftar link datar untuk grid ikon.
export interface FlatMenu { label: string; path: string; icon: React.ReactNode }
export function flattenMenu(items: MenuItem[]): FlatMenu[] {
  const out: FlatMenu[] = []
  for (const it of items) {
    if (it.children) {
      for (const c of it.children) out.push({ label: c.label, path: c.path, icon: it.icon })
    } else if (it.path) {
      out.push({ label: it.label, path: it.path, icon: it.icon })
    }
  }
  return out
}

// 7 ikon utama grid 4x2 mobile (slot ke-8 = Lainnya).
// Admin/kepala pakai daftar tetap sesuai permintaan; role lain ambil 7 pertama.
const adminPrimaryGrid: FlatMenu[] = [
  { label: 'Kelola Jadwal', path: '/admin/jadwal', icon: <Calendar size={20} /> },
  { label: 'Absensi Siswa', path: '/admin/absensi-siswa', icon: <UserCheck size={20} /> },
  { label: 'Absensi GTK', path: '/admin/absensi-guru', icon: <MapPin size={20} /> },
  { label: 'Wali Kelas', path: '/admin/wali-kelas', icon: <Users size={20} /> },
  { label: 'Rekapitulasi', path: '/admin/rekap-absensi', icon: <ClipboardList size={20} /> },
  { label: 'Tagihan', path: '/admin/tagihan', icon: <DollarSign size={20} /> },
  { label: 'Tabungan', path: '/admin/tabungan', icon: <School size={20} /> },
]

export function primaryGridForRole(role?: string): FlatMenu[] {
  if (role === 'admin' || role === 'kepala' || role === 'super_admin' || role === 'operator') return adminPrimaryGrid
  return flattenMenu(menuForRole(role))
    .filter(item => !['/admin', '/guru', '/siswa'].includes(item.path))
    .slice(0, 7)
}
