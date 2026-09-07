import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useSubscriptionStore } from '../stores/subscriptionStore'
import { flattenMenu, menuForRole, type FlatMenu } from '../lib/menuItems'
import { pathEnabled } from '../lib/featureAccess'
import PortalSheet from './ui/PortalSheet'

const colors = [
  'bg-blue-600 text-white', 'bg-emerald-600 text-white',
  'bg-violet-600 text-white', 'bg-amber-600 text-white',
  'bg-rose-600 text-white', 'bg-cyan-600 text-white', 'bg-indigo-600 text-white',
]

function LinkItem({ item, index, onClick }: { item: FlatMenu; index: number; onClick?: () => void }) {
  const content = (
    <>
      <span className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90 ${colors[index % colors.length]}`}>
        {item.icon}
      </span>
      <span className="mt-2 w-full text-[11px] leading-4 font-medium text-gray-600 dark:text-gray-300 line-clamp-2">
        {item.label}
      </span>
    </>
  )
  return item.external ? <a href={item.external} target="_blank" rel="noopener noreferrer" onClick={onClick} className="group flex min-w-0 flex-col items-center text-center">{content}</a> : <Link to={item.path} onClick={onClick} className="group flex min-w-0 flex-col items-center text-center">{content}</Link>
}

/**
 * Sheet "Semua Menu" (Lihat Semua) untuk dashboard mobile/tablet.
 * Menampilkan seluruh menu peran dalam grid 4 kolom dengan filter fitur,
 * mirip PortalSheet di MobileMenuGrid tapi bisa dibuka dari header hero.
 */
export default function MobileMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore()
  const features = useSubscriptionStore(s => s.subscription?.features)
  const items = flattenMenu(menuForRole(user?.role)).filter(
    item => !['/admin', '/guru', '/siswa'].includes(item.path) && pathEnabled(item.path, features)
  )

  return (
    <PortalSheet open={open} onClose={onClose} title="Semua Menu" description="Pilih layanan yang dibutuhkan">
      <div className="grid grid-cols-4 gap-x-2 gap-y-4">
        {items.map((item, index) => <LinkItem key={item.path} item={item} index={index} onClick={onClose} />)}
      </div>
    </PortalSheet>
  )
}