import type { ReactNode } from 'react'

// Compact card container. SaaS-modern: soft shadow, rounded, thin border.
export default function Card({ children, className = '', title, icon, action }: {
  children: ReactNode
  className?: string
  title?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={'bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100 ' + className}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3 gap-2">
          {title && (
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 min-w-0">
              {icon}
              <span className="truncate">{title}</span>
            </h3>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
