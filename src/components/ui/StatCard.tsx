import type { ReactNode } from 'react'

// Compact stat card: gradient icon chip + big value. SaaS-modern.
// Grid parent controls columns; card fills width and stays tidy on mobile.
export default function StatCard({ label, value, icon, gradient = 'from-blue-500 to-indigo-600', sub }: {
  label: string
  value: ReactNode
  icon: ReactNode
  gradient?: string
  sub?: string
}) {
  return (
    <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100 hover:shadow-md transition">
      <div className="flex items-center justify-between gap-2">
        <div className={'w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ' + gradient + ' flex items-center justify-center text-white shrink-0'}>
          {icon}
        </div>
        <p className="text-xl sm:text-2xl font-bold text-gray-800 truncate">{value}</p>
      </div>
      <p className="text-xs text-gray-500 mt-2 truncate">{label}</p>
      {sub && <p className="text-xs text-green-600 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}
