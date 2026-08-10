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
  const base = 'bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100 transition text-left w-full'
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className={'w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ' + gradient + ' flex items-center justify-center text-white shrink-0'}>
          {icon}
        </div>
        <p className="text-xl sm:text-2xl font-bold text-gray-800 truncate">{value}</p>
      </div>
      <p className="text-xs text-gray-500 mt-2 truncate">{label}</p>
      {sub && <p className="text-xs text-green-600 mt-0.5 truncate">{sub}</p>}
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
