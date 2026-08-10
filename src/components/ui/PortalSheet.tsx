import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface PortalSheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  align?: 'bottom' | 'top'
}

export default function PortalSheet({ open, onClose, title, description, children, align = 'bottom' }: PortalSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement as HTMLElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.scrollTo(0, 0)
    panelRef.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return event.preventDefault()
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = previousOverflow
      previousFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={`fixed inset-0 z-[100] flex justify-center bg-black/50 p-0 sm:p-4 ${align === 'top' ? 'items-start sm:pt-16' : 'items-end sm:items-center'}`} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="portal-sheet-title" className={`w-full sm:max-w-2xl max-h-[88dvh] overflow-y-auto bg-white dark:bg-gray-900 p-5 shadow-2xl outline-none ${align === 'top' ? 'rounded-b-3xl sm:rounded-3xl' : 'rounded-t-3xl sm:rounded-3xl'} pb-[max(1.25rem,env(safe-area-inset-bottom))]`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-white dark:bg-gray-900 pb-4">
          <div><h3 id="portal-sheet-title" className="font-bold text-gray-900 dark:text-white">{title}</h3>{description && <p className="text-xs text-gray-500">{description}</p>}</div>
          <button onClick={onClose} className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300" aria-label="Tutup"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>, document.body
  )
}
