import { ReactNode } from 'react'

// Compact page header: title + optional subtitle + right-side actions.
// Responsive: stacks on mobile, row on sm+.
export default function PageHeader({ title, subtitle, actions }: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 font-display truncate">{title}</h1>
        {subtitle && <p className="text-gray-500 text-xs sm:text-sm mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
