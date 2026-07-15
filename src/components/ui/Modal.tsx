import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
}

export default function Modal({ open, onClose, title, children, footer, maxWidth = 'md:max-w-lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    window.scrollTo(0, 0)
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={
          'bg-white flex flex-col w-full rounded-2xl max-h-[90vh] my-6 md:my-10 ' +
          'md:max-h-[calc(100vh-5rem)] ' +
          maxWidth
        }
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100">{footer}</div>
        )}
      </div>
    </div>
  )
}
