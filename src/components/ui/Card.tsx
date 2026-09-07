import { ReactNode } from 'react'

// Compact card container. SaaS-modern: soft shadow, rounded, thin border.
export default function Card({ children, className = '', title, icon, action }: {
  children: ReactNode
  className?: string
  title?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={'bg-white dark:bg-gray-900 rounded-xl p-3.5 sm:p-4 shadow-sm border border-gray-100 dark:border-gray-800 ' + className}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-2.5 gap-2">
          {title && (
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 min-w-0">
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
