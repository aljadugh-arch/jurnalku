import { useSettingsStore } from '../stores/settingsStore'
import { Link } from 'react-router-dom'
import PortalSheet from './ui/PortalSheet'
import { useAuthStore } from '../stores/authStore'
import { useSubscriptionStore } from '../stores/subscriptionStore'
import { flattenMenu, menuForRole, type FlatMenu } from '../lib/menuItems'
import { pathEnabled } from '../lib/featureAccess'

const colors = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
  'bg-rose-600', 'bg-cyan-600', 'bg-indigo-600',
]

// Susunan kelompok mengikuti NAV_GROUPS di jurnalv2 (Rust): Penyiapan → Harian
// → Akademik → Keuangan → Layanan → Sistem. Hanya SUSUNAN/kelompoknya yang
// diambil; isi menu tetap milik jurnalku.
const categoryRules: [string, RegExp][] = [
  ['Penyiapan', /tahun-ajaran|kalender-kbm|\/mapel|\/gtk|\/rombel|\/siswa|\/mutasi|\/jadwal|\/pengajar|\/substitusi/],
  ['Harian', /absensi|ceklok|\/jurnal|\/bk|rekap-absensi|\/monitoring$/],
  ['Akademik', /rapor|rekap-nilai|monitoring-nilai|bank-soal|kisi|paket-ujian|catatan-kepribadian|supervisi|kkm|buku-induk|nilai-ledger/],
  ['Keuangan', /tagihan|tabungan|buku-kas|laporan|rkas|payroll|payment-gateway|kantin|cashless|kasir|beasiswa/],
  ['Layanan', /ppdb|administrasi|posting|broadcast|wa-gateway|notif|smtp|perpustakaan|pustaka|\/lms|modul-ajar|program-belajar/],
]

const categoryFor = (item: FlatMenu) => {
  const p = item.path || ''
  for (const [group, re] of categoryRules) if (re.test(p)) return group
  return 'Sistem'
}

function MenuLink({ item, index, onClose }: { item: FlatMenu; index: number; onClose: () => void }) {
  const body = <>
    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${colors[index % colors.length]}`}>{item.icon}</span>
    <span className="mt-1.5 w-full text-[10px] font-medium leading-3 text-slate-600 dark:text-gray-300">{item.label}</span>
  </>
  const className = 'flex min-w-0 flex-col items-center text-center active:scale-95'
  return item.external
    ? <a href={item.external} target="_blank" rel="noopener noreferrer" onClick={onClose} className={className}>{body}</a>
    : <Link to={item.path} onClick={onClose} className={className}>{body}</Link>
}

export default function MobileMenuSheet({ open, onClose, variant = 'all' }: { open: boolean; onClose: () => void; variant?: 'all' | 'settings' }) {
  const role = useAuthStore(s => s.user?.role)
  const features = useSubscriptionStore(s => s.subscription?.features)
  const settings = useSettingsStore(s => s.settings)
  const adminRole = ['admin', 'kepala', 'super_admin', 'operator', 'tata_usaha', 'tu', 'bendahara'].includes(role || '')
  const allItems = flattenMenu(menuForRole(role)).filter(item => !['/admin', '/guru', '/siswa'].includes(item.path) && pathEnabled(item.path.split('#')[0], features, settings.jenjang))
  const items = variant === 'settings'
    ? allItems.filter(item => /Pengaturan|Tahun Ajaran|Backup|Gateway|Notifikasi|REST API/.test(item.label))
    : allItems
  const categories = ['Penyiapan', 'Harian', 'Akademik', 'Keuangan', 'Layanan', 'Sistem']

  return <PortalSheet open={open} onClose={onClose} title={variant === 'settings' ? 'Pengaturan Lembaga' : 'Semua Menu'} description="Seluruh fitur yang tersedia sesuai peran dan paket lembaga">
    {!adminRole ? <p className="py-8 text-center text-sm text-slate-500">Menu ini hanya tersedia untuk pengelola.</p> : (
      <div className="space-y-6" data-menu-categories="true">
        {categories.map(category => {
          const categoryItems = items.filter(item => categoryFor(item) === category)
          if (!categoryItems.length) return null
          return <section key={category}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">{category}</h3>
            <div className="grid grid-cols-4 gap-x-2 gap-y-4">
              {categoryItems.map((item, index) => <MenuLink key={`${item.path}-${item.label}`} item={item} index={index} onClose={onClose} />)}
            </div>
          </section>
        })}
      </div>
    )}
  </PortalSheet>
}
