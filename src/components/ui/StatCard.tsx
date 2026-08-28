import { ReactNode } from 'react'

// Compact stat card: gradient icon chip + big value. SaaS-modern.
// Grid parent controls columns; card fills width and stays tidy on mobile.
// onClick opsional -> render sebagai tombol (dapat diakses & fokus keyboard).
export default function StatCard({ label, value, icon, gradient = 'from-blue-500 to-indigo-600', sub, onClick }: {
  label: string
  value: ReactNode
  icon: ReactNode
  gradient?: string
  sub?: string
  onClick?: () => void
}) {
  const base = 'bg-white rounded-xl p-3 shadow-sm border border-gray-100 transition text-left w-full h-full min-h-[104px] flex flex-col'
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className={'w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br ' + gradient + ' flex items-center justify-center text-white shrink-0'}>
          {icon}
        </div>
        <p className="text-lg sm:text-xl font-bold text-gray-800 truncate">{value}</p>
      </div>
      <p className="text-xs text-gray-500 mt-1.5 truncate">{label}</p>
      {sub && <p className="text-[11px] text-green-600 mt-0.5 truncate">{sub}</p>}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base + ' hover:shadow-md hover:border-primary/40 active:scale-[0.98] cursor-pointer'}>
        {body}
      </button>
    )
  }
  return <div className={base + ' hover:shadow-md'}>{body}</div>
}
