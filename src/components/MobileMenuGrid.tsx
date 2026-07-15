import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Grid3X3, X } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { flattenMenu, menuForRole, primaryGridForRole, type FlatMenu } from '../lib/menuItems'

const colors = [
  'bg-blue-50 text-blue-600', 'bg-emerald-50 text-emerald-600',
  'bg-violet-50 text-violet-600', 'bg-amber-50 text-amber-600',
  'bg-rose-50 text-rose-600', 'bg-cyan-50 text-cyan-600',
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

      {showAll && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setShowAll(false)}>
          <div className="w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-gray-900 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white dark:bg-gray-900 pb-4">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Semua Menu</h3>
                <p className="text-xs text-gray-500">Pilih layanan yang dibutuhkan</p>
              </div>
              <button onClick={() => setShowAll(false)} className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300" aria-label="Tutup menu">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-5">
              {items.map((item, index) => <MenuLink key={item.path} item={item} index={index} onClick={() => setShowAll(false)} />)}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
