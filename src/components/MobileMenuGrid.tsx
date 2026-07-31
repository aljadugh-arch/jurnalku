import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Grid3X3 } from 'lucide-react'
import PortalSheet from './ui/PortalSheet'
import { useAuthStore } from '../stores/authStore'
import { flattenMenu, menuForRole, primaryGridForRole, type FlatMenu } from '../lib/menuItems'

const colors = [
  'bg-blue-600 text-white', 'bg-emerald-600 text-white',
  'bg-violet-600 text-white', 'bg-amber-600 text-white',
  'bg-rose-600 text-white', 'bg-cyan-600 text-white', 'bg-indigo-600 text-white',
]

function MenuLink({ item, index, onClick }: { item: FlatMenu; index: number; onClick?: () => void }) {
  return (
    <Link to={item.path} onClick={onClick} className="group flex min-w-0 flex-col items-center text-center">
      <span className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90 ${colors[index % colors.length]}`}>
        {item.icon}
      </span>
      <span className="mt-2 w-full text-[11px] leading-4 font-medium text-gray-600 dark:text-gray-300 line-clamp-2">
        {item.label}
      </span>
    </Link>
  )
}

/** Mobile/tablet: 7 menu utama + Lainnya dalam grid tetap 4x2. */
export default function MobileMenuGrid() {
  const { user } = useAuthStore()
  const [showAll, setShowAll] = useState(false)
  const items = flattenMenu(menuForRole(user?.role)).filter(item => !['/admin', '/guru', '/siswa'].includes(item.path))
  const primary = primaryGridForRole(user?.role)

  return (
    <>
      <section className="lg:hidden bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Menu Layanan</h2>
        <div className="grid grid-cols-4 gap-x-2 gap-y-5">
          {primary.map((item, index) => <MenuLink key={item.path} item={item} index={index} />)}
          <button onClick={() => setShowAll(true)} className="group flex min-w-0 flex-col items-center text-center">
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-700 transition-transform group-active:scale-90">
              <Grid3X3 size={20} />
            </span>
            <span className="mt-2 text-[11px] leading-4 font-medium text-gray-600 dark:text-gray-300">Lainnya</span>
          </button>
        </div>
      </section>

      <PortalSheet open={showAll} onClose={() => setShowAll(false)} title="Semua Menu" description="Pilih layanan yang dibutuhkan">
            <div className="grid grid-cols-4 gap-x-2 gap-y-5">
              {items.map((item, index) => <MenuLink key={item.path} item={item} index={index} onClick={() => setShowAll(false)} />)}
            </div>
      </PortalSheet>
    </>
  )
}
