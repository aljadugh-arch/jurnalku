import { Link } from 'react-router-dom'
import {
  BookOpen, Code2, DatabaseBackup, DollarSign, FileText, GraduationCap, Layers, MapPin,
  MessageSquare, QrCode, Receipt, Settings, ShoppingCart, UserCheck, Users, Wallet,
} from 'lucide-react'
import PortalSheet from './ui/PortalSheet'
import { useAuthStore } from '../stores/authStore'
import { useSubscriptionStore } from '../stores/subscriptionStore'
import { pathEnabled } from '../lib/featureAccess'

interface MenuLink { label: string; path: string; icon: React.ReactNode }
interface MenuSection { title: string; items: MenuLink[] }

const adminMenuSections: MenuSection[] = [
  {
    title: 'Menu Layanan',
    items: [
      { label: 'Absensi QR Siswa', path: '/admin/absensi-siswa', icon: <QrCode size={19} /> },
      { label: 'Ceklok GTK', path: '/admin/ceklok', icon: <UserCheck size={19} /> },
      { label: 'Absensi GTK', path: '/admin/absensi-guru', icon: <MapPin size={19} /> },
      { label: 'Rekap Absensi', path: '/admin/rekap-absensi', icon: <Receipt size={19} /> },
      { label: 'Penilaian', path: '/admin/rapor', icon: <BookOpen size={19} /> },
      { label: 'Jadwal', path: '/admin/jadwal', icon: <BookOpen size={19} /> },
      { label: 'Posting', path: '/admin/posting', icon: <FileText size={19} /> },
    ],
  },
  {
    title: 'Manajemen Data',
    items: [
      { label: 'Data Siswa', path: '/admin/siswa', icon: <GraduationCap size={19} /> },
      { label: 'Data GTK', path: '/admin/gtk', icon: <Users size={19} /> },
      { label: 'User & Hak Akses', path: '/admin/users', icon: <UserCheck size={19} /> },
    ],
  },
  {
    title: 'Akademik & Kelas',
    items: [
      { label: 'Kelas / Rombel', path: '/admin/rombel', icon: <Layers size={19} /> },
      { label: 'Mata Pelajaran', path: '/admin/mapel', icon: <BookOpen size={19} /> },
      { label: 'Pengajar', path: '/admin/pengajar', icon: <Users size={19} /> },
      { label: 'Jurnal Mengajar', path: '/admin/jurnal', icon: <Receipt size={19} /> },
      { label: 'Kalender Akademik', path: '/admin/kalender-kbm', icon: <BookOpen size={19} /> },
      { label: 'Ekstrakurikuler', path: '/admin/ekskul', icon: <Layers size={19} /> },
    ],
  },
  {
    title: 'Administrasi & Keuangan',
    items: [
      { label: 'Tagihan & Pembayaran', path: '/admin/tagihan', icon: <DollarSign size={19} /> },
      { label: 'Tabungan', path: '/admin/tabungan', icon: <Wallet size={19} /> },
      { label: 'Laporan', path: '/admin/rekap-absensi', icon: <Receipt size={19} /> },
      { label: 'Backup & Restore', path: '/admin/backup-restore', icon: <DatabaseBackup size={19} /> },
    ],
  },
  {
    title: 'Komunikasi',
    items: [
      { label: 'Broadcast', path: '/admin/broadcast', icon: <MessageSquare size={19} /> },
      { label: 'Notifikasi WA', path: '/admin/notif-settings', icon: <MessageSquare size={19} /> },
      { label: 'WA Gateway', path: '/admin/wa-gateway', icon: <MessageSquare size={19} /> },
    ],
  },
]

const settingsMenuSections: MenuSection[] = [
  {
    title: 'Identitas Lembaga',
    items: [
      { label: 'Profil Sekolah', path: '/admin/settings#identitas', icon: <GraduationCap size={19} /> },
      { label: 'Jenjang & Kurikulum', path: '/admin/settings#jenjang', icon: <BookOpen size={19} /> },
      { label: 'Tahun Ajaran', path: '/admin/tahun-ajaran', icon: <Layers size={19} /> },
      { label: 'Hari Libur', path: '/admin/settings#hari-libur', icon: <BookOpen size={19} /> },
    ],
  },
  {
    title: 'Manajemen Sistem',
    items: [
      { label: 'Tampilan & Theme', path: '/admin/settings#tampilan', icon: <Settings size={19} /> },
      { label: 'PWA', path: '/admin/settings#pwa', icon: <Settings size={19} /> },
      { label: 'Ceklok Setting', path: '/admin/settings#ceklok', icon: <UserCheck size={19} /> },
      { label: 'Fitur Aktif/Nonaktif', path: '/admin/settings#fitur', icon: <Settings size={19} /> },
      { label: 'Backup & Restore', path: '/admin/backup-restore', icon: <DatabaseBackup size={19} /> },
    ],
  },
  {
    title: 'Konfigurasi WhatsApp',
    items: [
      { label: 'Broadcast', path: '/admin/broadcast', icon: <MessageSquare size={19} /> },
      { label: 'Notifikasi WA', path: '/admin/notif-settings', icon: <MessageSquare size={19} /> },
      { label: 'WA Gateway', path: '/admin/wa-gateway', icon: <MessageSquare size={19} /> },
    ],
  },
  {
    title: 'Cashless',
    items: [
      { label: 'Kantin / Koperasi', path: '/admin/kantin-menu', icon: <ShoppingCart size={19} /> },
      { label: 'Order', path: '/admin/kantin-orders', icon: <Receipt size={19} /> },
      { label: 'Topup', path: '/admin/cashless-topup', icon: <Wallet size={19} /> },
      { label: 'Transfer', path: '/admin/cashless-bank-config', icon: <DollarSign size={19} /> },
      { label: 'Kasir QR', path: '/admin/kantin-scanner', icon: <ShoppingCart size={19} /> },
    ],
  },
  {
    title: 'Developer Mode',
    items: [{ label: 'REST API', path: '/admin/developer-api', icon: <Code2 size={19} /> }],
  },
]

const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600', 'bg-indigo-600']

export default function MobileMenuSheet({ open, onClose, variant = 'all' }: { open: boolean; onClose: () => void; variant?: 'all' | 'settings' }) {
  const role = useAuthStore(s => s.user?.role)
  const features = useSubscriptionStore(s => s.subscription?.features)
  const adminRole = ['admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu'].includes(role || '')
  const sections = variant === 'settings' ? settingsMenuSections : adminMenuSections

  return (
    <PortalSheet open={open} onClose={onClose} title={variant === 'settings' ? 'Pengaturan Lembaga' : 'Semua Menu'} description={variant === 'settings' ? 'Identitas dan manajemen sistem lembaga' : 'Menu dikelompokkan berdasarkan kebutuhan'}>
      {!adminRole ? <p className="py-8 text-center text-sm text-slate-500">Pengaturan lembaga hanya tersedia untuk pengelola.</p> : (
        <div className="space-y-6" data-menu-categories="true">
          {sections.map(section => {
            const items = section.items.filter(item => pathEnabled(item.path.split('#')[0], features))
            if (!items.length) return null
            return <section key={section.title}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">{section.title}</h3>
              <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                {items.map((item, index) => <Link key={item.path} to={item.path} onClick={onClose} className="flex min-w-0 flex-col items-center text-center active:scale-95"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${colors[index % colors.length]}`}>{item.icon}</span><span className="mt-1.5 w-full text-[10px] font-medium leading-3 text-slate-600 dark:text-gray-300">{item.label}</span></Link>)}
              </div>
            </section>
          })}
        </div>
      )}
    </PortalSheet>
  )
}
