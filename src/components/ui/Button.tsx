import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm shadow-primary/30',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
  ghost: 'text-gray-600 hover:bg-gray-100',
  danger: 'bg-danger text-white hover:opacity-90',
}

// Compact button. icon-only when children omitted.
export default function Button({ variant = 'primary', icon, children, className = '', ...rest }: {
  variant?: Variant
  icon?: ReactNode
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ' +
        (children ? 'px-3 py-2 ' : 'p-2 ') + styles[variant] + ' ' + className}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
